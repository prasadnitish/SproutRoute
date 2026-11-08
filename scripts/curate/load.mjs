// Load curated destinations and attractions into Supabase.
// node load.mjs           dry run: prints what would change, writes nothing
// node load.mjs --apply   writes
// Rules: Google-sourced columns are never overwritten. Places a web search confirmed closed are not added (and an
// existing row for them is retired). Renames a search confirmed are applied. Coordinates come only from Wikidata.
import { createClient } from "@supabase/supabase-js";
import { readFileSync, readdirSync, existsSync, writeFileSync } from "node:fs";

const APPLY = process.argv.includes("--apply");
const here = (p) => new URL(p, import.meta.url);
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
const NOW = new Date().toISOString();

const norm = (s) => String(s || "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/['’`ʻ]/g, "")
  .replace(/\b(the|of|and|&)\b/g, " ").replace(/[^a-z0-9]+/g, " ").trim();
const cityKey = (s) => norm(String(s).replace(/\s*\[[A-Z]{2}\]\s*$/, "").split(",")[0]);
const bare = (s) => String(s || "").replace(/\s*\([^)]*\)\s*$/, "");
const sameName = (a, b) => {
  const x = norm(bare(a)), y = norm(bare(b));
  if (!x || !y) return false;
  if (x === y) return true;
  // "Magic Kingdom" = "Magic Kingdom Park", but "Balboa Park" != "Balboa Park Carousel".
  const shorter = x.length < y.length ? x : y, longer = x.length < y.length ? y : x;
  const extra = longer.startsWith(shorter + " ") ? longer.slice(shorter.length + 1) : "";
  return shorter.length >= 4 && GENERIC.test(extra);
};
const GENERIC = /^(park|theme park|museum|zoo|aquarium|gardens?|botanical gardens?|beach|national park|state park|center|centre|resort|market|square|island)$/;
const km = (a, b) => {
  const r = Math.PI / 180, dlat = (b.lat - a.lat) * r, dlon = (b.lon - a.lon) * r;
  const h = Math.sin(dlat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dlon / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
};
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };

// Curated vocabulary -> the vocabulary the table already uses.
const CATEGORY = { theme_park: "theme_park", water_park: "water", zoo_aquarium: "wildlife", museum: "museums", science_center: "museums",
  park_garden: "parks", beach: "beach", playground: "playgrounds", landmark: "landmark", nature_outdoors: "nature",
  neighborhood_walk: "city", market_food: "shopping", show_entertainment: "entertainment", boat_tour: "water",
  farm_animals: "wildlife", sports_activity: "sports", day_trip: "day_trip", other: "general" };
const PACE = { relaxed: "slow", moderate: "moderate", active: "fast" };
const CROWD = { low: "low", medium: "moderate", high: "high" };
const BUDGET = { free: "free", low: "budget", medium: "moderate", high: "premium" };
const IO = { indoor: "indoor", outdoor: "outdoor", mixed: "both" };
function ageBands(bands) {
  const has = (b) => bands.includes(b);
  const fit = (yes) => (yes ? "great" : "poor");
  return [
    { label: "infant", minAge: 0, maxAge: 1, suitability: fit(has("0-2")) },
    { label: "toddler", minAge: 2, maxAge: 3, suitability: fit(has("0-2") || has("3-5")) },
    { label: "preschool", minAge: 4, maxAge: 5, suitability: fit(has("3-5")) },
    { label: "school_age", minAge: 6, maxAge: 12, suitability: fit(has("6-9") || has("10-12")) },
    { label: "teen", minAge: 13, maxAge: 17, suitability: fit(has("13-17")) },
  ];
}
const tier = (p) => (p >= 5 ? "tier1" : p >= 4 ? "tier2" : "tier3");
const clamp10 = (n) => Math.max(1, Math.min(10, Math.round(Number(n || 3) * 2)));

async function all(table, columns) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from(table).select(columns).range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...data);
    if (data.length < 1000) return out;
  }
}

const index = JSON.parse(readFileSync(here("./batch-index.json")));
const wiki = existsSync(here("./wikidata-matches.json")) ? JSON.parse(readFileSync(here("./wikidata-matches.json"))) : {};
const verdicts = {};
if (existsSync(here("./verified/"))) {
  for (const f of readdirSync(here("./verified/"))) {
    for (const v of JSON.parse(readFileSync(here(`./verified/${f}`))).verdicts) verdicts[`${f.slice(0, -5)}|${norm(v.name.replace(/\s*\([^)]*\)\s*$/, ""))}`] = v;
  }
}

const cities = await all("cities", "id, city_name, display_name, country_code, lat, lon, aliases");
const attractions = await all("city_attractions", "id, city_id, canonical_name, google_place_id, wikidata_id, lat, lon, status, source_type, verification_status, why_recommended, timing_tip");
const byCity = new Map();
for (const a of attractions) (byCity.get(a.city_id) ?? byCity.set(a.city_id, []).get(a.city_id)).push(a);

const stats = { citiesMatched: 0, citiesNew: 0, citiesSkipped: [], inserts: 0, insertsWithCoords: 0, updates: 0, updatesGainingCoords: 0,
  closedSkipped: 0, retired: 0, renamed: 0, paused: 0 };
const cityInserts = [], cityUpdates = [], rowInserts = [], rowUpdates = [];
const taken = new Set();

for (const file of readdirSync(here("./results/"))) {
  const slug = file.slice(0, -5);
  const dest = index[slug];
  const data = JSON.parse(readFileSync(here(`./results/${file}`)));
  const w = wiki[slug] ?? { center: null, places: [] };
  const coordsByName = new Map(w.places.filter((p) => Number.isFinite(p.lat)).map((p) => [p.name, p]));

  const names = new Set([cityKey(dest.name), ...dest.aliases.map(cityKey)].filter(Boolean));
  let city = cities.find((c) => c.country_code === dest.country_code && (names.has(cityKey(c.city_name)) || names.has(cityKey(c.display_name))));
  const aliases = [...new Set([dest.name, ...dest.aliases].map((a) => String(a).replace(/\s*\[[A-Z]{2}\]\s*$/, "").trim().toLowerCase()).filter(Boolean))];
  const curatedCity = {
    kind: dest.kind, family_popularity: dest.family_popularity, summary: data.destination_summary, best_months: data.best_months,
    family_base_areas: data.family_base_areas, getting_around: data.getting_around, typical_trip_days: data.typical_trip_days,
    curated_at: NOW,
  };

  let center;
  if (city) {
    stats.citiesMatched += 1;
    center = { lat: city.lat, lon: city.lon };
    cityUpdates.push({ id: city.id, ...curatedCity, aliases: [...new Set([...(city.aliases ?? []), ...aliases])], wikidata_id: w.center?.id ?? null });
  } else {
    // Trust the Wikidata centre only when the matched places sit around it; otherwise use their median.
    const placed = [...coordsByName.values()];
    const mid = placed.length >= 3 ? { lat: median(placed.map((p) => p.lat)), lon: median(placed.map((p) => p.lon)) } : null;
    center = w.center && (!mid || km(w.center, mid) < 80) ? w.center : mid;
    if (!center) { stats.citiesSkipped.push(slug); continue; }
    stats.citiesNew += 1;
    city = { id: crypto.randomUUID(), city_name: dest.name, country_code: dest.country_code, lat: center.lat, lon: center.lon };
    cityInserts.push({
      id: city.id, city_name: dest.name, display_name: dest.region && cityKey(dest.region) !== cityKey(dest.name) ? `${dest.name}, ${dest.region}` : dest.name,
      country_code: dest.country_code, region_code: "", lat: center.lat, lon: center.lon, priority_tier: tier(dest.family_popularity),
      aliases, wikidata_id: w.center?.id ?? null, ...curatedCity,
    });
  }

  const existing = byCity.get(city.id) ?? [];
  for (const place of data.attractions) {
    const verdict = verdicts[`${slug}|${norm(place.canonical_name)}`];
    const checked = verdict?.checked_by_search === true;
    const match = existing.find((r) => sameName(r.canonical_name, place.canonical_name));
    if (verdict?.status === "closed_permanently") {
      stats.closedSkipped += 1;
      if (match && checked && match.status === "active") { rowUpdates.push({ id: match.id, status: "closed_unverified", web_check: verdict, curated_at: NOW }); stats.retired += 1; }
      continue;
    }
    const name = checked && verdict.status === "renamed" && verdict.current_name && !/unverified|not confirmed/i.test(verdict.current_name)
      ? verdict.current_name.replace(/\s*\([^)]*\)\s*$/, "").trim() : place.canonical_name;
    if (name !== place.canonical_name) stats.renamed += 1;
    const paused = checked && verdict.status === "closed_temporarily";
    if (paused) stats.paused += 1;
    // Places matched without a city centre had no distance limit; drop any that sit far from the city.
    const found = coordsByName.get(place.canonical_name);
    const tooFar = found && km(center, found) > Math.max(60, (place.km_from_center || 0) * 1.6 + 25);
    if (tooFar) stats.farCoordsDropped = (stats.farCoordsDropped ?? 0) + 1;
    const geo = tooFar ? null : found;
    const notes = [verdict?.note, place.hours_pattern && `Usual hours: ${place.hours_pattern}`].filter(Boolean).join(" ");
    const curated = {
      wikidata_id: geo?.wikidata_id ?? null, official_url: verdict?.official_url || place.official_url || null, area: place.area || null,
      must_do: place.must_do, hours_pattern: (checked && verdict.hours_pattern) || place.hours_pattern || null,
      seasonal_note: place.seasonal_note || null, km_from_center: geo?.km_from_center_actual ?? place.km_from_center ?? null,
      web_check: verdict ?? null, curated_at: NOW,
    };

    if (match) {
      const update = { id: match.id, ...curated };
      if (match.wikidata_id) delete update.wikidata_id;
      if (!match.why_recommended) update.why_recommended = place.why_recommended;
      if (!match.timing_tip) update.timing_tip = place.timing_tip;
      if (!Number.isFinite(match.lat) && geo) {
        Object.assign(update, { lat: geo.lat, lon: geo.lon, verification_status: "verified", last_verified_at: NOW });
        stats.updatesGainingCoords += 1;
      }
      if (paused) update.status = "closed_unverified";
      rowUpdates.push(update);
      stats.updates += 1;
      continue;
    }
    // A new row without Wikidata coordinates can't be planned, and the refresh job would send it to Google. Keep it in the files only.
    if (!geo) { stats.insertsWithoutCoordsSkipped = (stats.insertsWithoutCoordsSkipped ?? 0) + 1; continue; }
    // (city_id, canonical_name) is unique; skip repeats within the list and clashes with existing rows.
    const key = `${city.id}|${name}`;
    if (taken.has(key) || existing.some((r) => r.canonical_name === name)) { stats.duplicatesSkipped = (stats.duplicatesSkipped ?? 0) + 1; continue; }
    taken.add(key);
    rowInserts.push({
      city_id: city.id, canonical_name: name, short_summary: place.short_summary, category: CATEGORY[place.category] ?? "general",
      subcategories_json: [place.category], age_bands_json: ageBands(place.age_bands), indoor_outdoor: IO[place.indoor_outdoor] ?? "both",
      duration_bucket: place.duration_bucket, pace_fit: PACE[place.pace_fit] ?? "any", crowd_level: CROWD[place.crowd_level] ?? "moderate",
      budget_tier: BUDGET[place.budget_tier] ?? "moderate", stroller_friendly: place.stroller_friendly, rainy_day_fit: place.rainy_day_fit,
      pet_friendly: place.pet_friendly, booking_needed: place.booking_needed, kid_appeal_score: clamp10(place.kid_appeal_score),
      parent_appeal_score: clamp10(place.parent_appeal_score),
      confidence_score: Math.max(0, Math.min(1, checked && verdict.status === "open" ? Math.max(place.confidence, 0.9) : place.confidence)),
      llm_notes: notes, why_recommended: place.why_recommended, timing_tip: place.timing_tip,
      lat: geo?.lat ?? null, lon: geo?.lon ?? null, verification_status: geo ? "verified" : "unverified",
      last_verified_at: geo ? NOW : null, source_type: "curated", status: paused ? "closed_unverified" : "active", ...curated,
    });
    stats.inserts += 1;
    if (geo) stats.insertsWithCoords += 1;
  }
}

console.log(JSON.stringify({ apply: APPLY, ...stats, citiesSkipped: stats.citiesSkipped.length, skippedSample: stats.citiesSkipped.slice(0, 10) }, null, 2));
writeFileSync(here("./load-preview.json"), JSON.stringify({ cityInserts: cityInserts.map(({ id, city_name, display_name, country_code, lat, lon }) => ({ id, city_name, display_name, country_code, lat, lon })), rowInserts: rowInserts.slice(0, 20), rowUpdates: rowUpdates.slice(0, 20) }, null, 2));

if (APPLY) {
  const chunk = (xs, n) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));
  for (const part of chunk(cityInserts, 200)) { const { error } = await db.from("cities").insert(part); if (error) throw new Error("cities insert: " + error.message); }
  for (const u of cityUpdates) { const { id, ...f } = u; const { error } = await db.from("cities").update(f).eq("id", id); if (error) throw new Error("cities update: " + error.message); }
  for (const part of chunk(rowInserts, 500)) { const { error } = await db.from("city_attractions").insert(part); if (error) throw new Error("attractions insert: " + error.message); }
  let done = 0;
  const queue = [...rowUpdates];
  await Promise.all(Array.from({ length: 8 }, async () => {
    while (queue.length) {
      const { id, ...f } = queue.shift();
      const { error } = await db.from("city_attractions").update(f).eq("id", id);
      if (error) throw new Error("attractions update: " + error.message);
      done += 1;
    }
  }));
  console.log("written", { cities: cityInserts.length, cityUpdates: cityUpdates.length, inserts: rowInserts.length, updates: done });
}
