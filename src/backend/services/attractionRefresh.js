/**
 * Re-verify a slice of city_attractions against Google Places, retire rows that no longer exist, and fill in
 * Claude's family-fit judgment for rows that lack one.
 *
 * Rows are taken stalest first, so running this weekly with a slice of about a quarter of the table
 * re-checks every row within 30 days. Rows are never deleted: a place that cannot be matched, or is
 * permanently closed, becomes status "closed_unverified" and is left out of generation.
 * Nothing is written unless `apply` is true.
 */
import { randomUUID } from "node:crypto";
import { resolvePlace, statusForPlace } from "./placesGrounding.js";
import { assessFamilyFit, fitToRowUpdate, FAMILY_FIT_VERSION, FAMILY_FIT_MODEL } from "./attractionFit.js";

const RATING_MOVE = 0.3;
const CONCURRENCY = 4;
const DEFAULT_MAX_KM = 150;
// Country- and state-sized "cities": their attractions sit hundreds of kilometres from the centre point.
const BROAD_REGIONS = new Set(["japan", "florida", "hawaii"]);
const BROAD_MAX_KM = 1500;

const one = (value) => (Array.isArray(value) ? value[0] : value) || {};

function targetFor(row) {
  const city = one(row.cities);
  const cityName = city.city_name || "";
  return {
    name: row.canonical_name,
    city: city.display_name || cityName,
    cityLat: city.lat,
    cityLon: city.lon,
    placeId: row.google_place_id || undefined,
    maxKm: BROAD_REGIONS.has(cityName.toLowerCase()) ? BROAD_MAX_KM : DEFAULT_MAX_KM,
  };
}

function planMatched(row, place, status, nowIso) {
  const fields = {
    google_place_id: place.placeId,
    lat: place.lat,
    lon: place.lon,
    rating: place.rating,
    rating_count: place.ratingCount,
    price_level: place.priceLevel,
    opening_hours: place.openingHours,
    photo_ref: place.photoRef,
    business_status: place.businessStatus,
    place_types: place.types,
    status,
    last_verified_at: nowIso,
    updated_at: nowIso,
    ...(status === "active" ? { verification_status: "verified" } : {}),
  };
  const logs = [];
  if (!row.google_place_id) logs.push({ change_type: "matched", detail: { placeId: place.placeId } });
  else if (row.google_place_id !== place.placeId) {
    logs.push({ change_type: "matched", detail: { placeId: place.placeId, replacedPlaceId: row.google_place_id } });
  }
  if (row.status !== "closed_unverified" && status === "closed_unverified") {
    logs.push({ change_type: "closed", detail: { businessStatus: place.businessStatus } });
  }
  if (row.status === "closed_unverified" && status === "active") logs.push({ change_type: "reopened", detail: {} });
  if (Number.isFinite(row.rating) && Number.isFinite(place.rating) && Math.abs(place.rating - row.rating) > RATING_MOVE + 1e-9) {
    logs.push({ change_type: "rating_change", detail: { from: Number(row.rating), to: place.rating } });
  }
  return { fields, logs };
}

function planUnmatched(row, reason, nowIso) {
  return {
    fields: { status: "closed_unverified", last_verified_at: nowIso, updated_at: nowIso },
    logs: row.status === "closed_unverified" ? [] : [{ change_type: "unmatched", detail: { reason } }],
  };
}

export async function refreshAttractions({
  admin,
  apply = false,
  limit = 100,
  cityId = null,
  withFit = true,
  resolveFn = resolvePlace,
  fitFn = assessFamilyFit,
  now = Date.now,
  runId = randomUUID(),
  onProgress = () => {},
} = {}) {
  const summary = {
    runId, applied: apply, scanned: 0, matched: 0, unmatched: 0, closed: 0, reopened: 0,
    ratingChanges: 0, errors: 0, duplicates: 0, fitDone: 0, fitFailed: 0, fitSkippedDryRun: 0,
  };

  let query = admin
    .from("city_attractions")
    .select("id, canonical_name, google_place_id, status, rating, last_verified_at, family_fit_json, cities(city_name, display_name, lat, lon)");
  if (cityId) query = query.eq("city_id", cityId);
  const { data, error } = await query
    .order("last_verified_at", { ascending: true, nullsFirst: true })
    .limit(limit);
  if (error) throw new Error(`could not read attractions: ${error.message}`);

  const rows = data || [];
  const logs = [];
  const nowIso = new Date(now()).toISOString();

  async function handle(row) {
    summary.scanned += 1;
    const result = await resolveFn(targetFor(row));
    if (result.status === "error") {
      summary.errors += 1;
      return;
    }

    const status = statusForPlace(result);
    const plan = result.status === "matched"
      ? planMatched(row, result.place, status, nowIso)
      : planUnmatched(row, result.reason, nowIso);
    if (result.status === "matched") summary.matched += 1; else summary.unmatched += 1;

    if (result.status === "matched" && status === "active" && withFit && row.family_fit_json?.version !== FAMILY_FIT_VERSION) {
      if (!apply) {
        summary.fitSkippedDryRun += 1;
      } else {
        const fitted = await fitFn({
          name: result.place.name || row.canonical_name,
          city: targetFor(row).city,
          types: result.place.types,
          primaryType: result.place.primaryType,
          priceLevel: result.place.priceLevel,
        });
        if (fitted.ok) {
          Object.assign(plan.fields, fitToRowUpdate(fitted.fit, { model: FAMILY_FIT_MODEL, now: nowIso }));
          summary.fitDone += 1;
        } else {
          summary.fitFailed += 1;
        }
      }
    }

    if (!apply) {
      for (const entry of plan.logs) tally(entry);
      return;
    }

    let { error: updateError } = await admin.from("city_attractions").update(plan.fields).eq("id", row.id);
    if (updateError?.code === "23505") {
      // Another row already holds this place in this city. Keep this one as a retired duplicate.
      summary.duplicates += 1;
      const retired = { status: "closed_unverified", last_verified_at: nowIso, updated_at: nowIso };
      ({ error: updateError } = await admin.from("city_attractions").update(retired).eq("id", row.id));
      plan.logs = [{ change_type: "unmatched", detail: { reason: "duplicate_place", placeId: plan.fields.google_place_id } }];
    }
    if (updateError) {
      summary.errors += 1;
      return;
    }
    for (const entry of plan.logs) {
      tally(entry);
      logs.push({ run_id: runId, attraction_id: row.id, ...entry });
    }
  }

  function tally(entry) {
    if (entry.change_type === "closed") summary.closed += 1;
    if (entry.change_type === "reopened") summary.reopened += 1;
    if (entry.change_type === "rating_change") summary.ratingChanges += 1;
  }

  let next = 0;
  async function worker() {
    while (next < rows.length) {
      const row = rows[next++];
      try {
        await handle(row);
      } catch (failure) {
        summary.errors += 1;
        onProgress({ id: row.id, error: failure.message });
      }
      onProgress({ done: next, total: rows.length });
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, rows.length) }, worker));

  if (apply && logs.length) {
    const { error: logError } = await admin.from("refresh_log").insert(logs);
    if (logError) throw new Error(`could not write refresh_log: ${logError.message}`);
  }
  return summary;
}
