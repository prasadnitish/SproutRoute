import { getSupabaseAdmin } from "../utils/supabaseClient.js";
import { log } from "../utils/logger.js";
import { sanitizeDestination } from "./inputSafety.js";
import { enrichActivity } from "./placesEnrich.js";

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function safeLower(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeStringArray(value, maxItems = 12) {
  return Array.isArray(value)
    ? value
      .map((item) => String(item || "").trim())
      .filter(Boolean)
      .slice(0, maxItems)
    : [];
}

function normalizeName(value) {
  return safeLower(value)
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function firstNonEmpty(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function deriveCityIdentity(destination, coords = {}) {
  const displayName = sanitizeDestination(coords.displayName || destination || "");
  const parts = displayName.split(",").map((part) => part.trim()).filter(Boolean);
  const cityName = sanitizeDestination(parts[0] || destination || "").slice(0, 80);
  return {
    cityName,
    displayName: displayName || cityName,
  };
}

function distanceScoreMiles(lat1, lon1, lat2, lon2) {
  if (![lat1, lon1, lat2, lon2].every(Number.isFinite)) return Number.POSITIVE_INFINITY;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const R = 3958.8;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function isBroadRegionalDestination(identity, coords = {}) {
  const cityName = normalizeName(identity?.cityName);
  const stateName = normalizeName(coords?.stateName);
  const displayFirstPart = normalizeName(String(coords?.displayName || "").split(",")[0] || "");

  if (!cityName) return false;
  if (stateName && cityName === stateName) return true;
  if (displayFirstPart && stateName && displayFirstPart === stateName) return true;
  return false;
}

function mapDurationBucket(duration) {
  const value = safeLower(duration);
  if (!value) return "1_2h";
  if (value.includes("full day")) return "full_day";
  if (value.includes("half day")) return "half_day";
  if (value.includes("under") || value.includes("1 hour") || value.includes("one hour")) return "under_1h";
  if (value.includes("2-4") || value.includes("3 hours") || value.includes("4 hours")) return "2_4h";
  return "1_2h";
}

function recencyScore(lastSeenAt) {
  if (!lastSeenAt) return 0;
  const timestamp = new Date(lastSeenAt).getTime();
  if (!Number.isFinite(timestamp)) return 0;
  const ageDays = (Date.now() - timestamp) / (1000 * 60 * 60 * 24);
  if (ageDays <= 7) return 3;
  if (ageDays <= 30) return 2;
  if (ageDays <= 90) return 1;
  return 0;
}

function verificationScore(status) {
  switch (safeLower(status)) {
    case "verified":
      return 5;
    case "stale":
      return 2;
    case "rejected":
      return -100;
    default:
      return 0;
  }
}

function keywordScore(attraction, requestedActivities = []) {
  const haystack = [
    attraction.canonical_name,
    attraction.category,
    attraction.short_summary,
    attraction.why_recommended,
    attraction.llm_notes,
  ].map(safeLower).join(" ");

  return requestedActivities.reduce((score, activity) => {
    const keyword = safeLower(activity);
    if (!keyword) return score;
    if (safeLower(attraction.category) === keyword) return score + 4;
    if (haystack.includes(keyword)) return score + 2;
    return score;
  }, 0);
}

function textSignals(attraction) {
  return [
    attraction.canonical_name,
    attraction.category,
    attraction.short_summary,
    attraction.why_recommended,
    attraction.llm_notes,
    attraction.city_display_name,
  ].map(safeLower).join(" ");
}

function phraseMatchScore(attraction, terms = [], weight = 2) {
  const haystack = textSignals(attraction);
  return normalizeStringArray(terms, 16).reduce((score, term) => {
    const needle = safeLower(term);
    if (!needle) return score;
    if (safeLower(attraction.canonical_name).includes(needle)) return score + weight + 2;
    if (haystack.includes(needle)) return score + weight;
    return score;
  }, 0);
}

function phrasePenalty(attraction, terms = [], penalty = 3) {
  const haystack = textSignals(attraction);
  return normalizeStringArray(terms, 16).reduce((score, term) => {
    const needle = safeLower(term);
    if (!needle) return score;
    return haystack.includes(needle) ? score + penalty : score;
  }, 0);
}

function noveltyPenalty(candidate, selected) {
  if (!selected.length) return 0;

  let penalty = 0;
  const sameCategoryCount = selected.filter((row) => safeLower(row.category) === safeLower(candidate.category)).length;
  const sameCityCount = candidate.city_id
    ? selected.filter((row) => row.city_id && row.city_id === candidate.city_id).length
    : 0;
  const sameIndoorOutdoorCount = candidate.indoor_outdoor
    ? selected.filter((row) => safeLower(row.indoor_outdoor) === safeLower(candidate.indoor_outdoor)).length
    : 0;
  const sameDurationBucketCount = candidate.duration_bucket
    ? selected.filter((row) => safeLower(row.duration_bucket) === safeLower(candidate.duration_bucket)).length
    : 0;

  penalty += sameCategoryCount * 4;
  penalty += sameCityCount * 2.5;
  penalty += sameIndoorOutdoorCount * 0.75;
  penalty += sameDurationBucketCount * 0.5;

  if (sameCategoryCount > 0 && sameCityCount > 0) {
    penalty += 1.5;
  }

  return penalty;
}

function noveltyBonus(candidate, selected) {
  if (!selected.length) return 0;

  let bonus = 0;
  const selectedCategories = new Set(selected.map((row) => safeLower(row.category)));
  const selectedCities = new Set(selected.map((row) => row.city_id).filter(Boolean));

  if (!selectedCategories.has(safeLower(candidate.category))) bonus += 3;
  if (candidate.city_id && !selectedCities.has(candidate.city_id)) bonus += 2;
  if (candidate.indoor_outdoor && !selected.some((row) => safeLower(row.indoor_outdoor) === safeLower(candidate.indoor_outdoor))) {
    bonus += 0.75;
  }

  return bonus;
}

function selectDiverseAttractions(scoredAttractions, maxResults) {
  const pool = [...toArray(scoredAttractions)];
  const selected = [];

  while (selected.length < maxResults && pool.length > 0) {
    let bestIndex = 0;
    let bestScore = Number.NEGATIVE_INFINITY;

    for (let index = 0; index < pool.length; index += 1) {
      const candidate = pool[index];
      const adjustedScore =
        Number(candidate._score || 0) +
        noveltyBonus(candidate, selected) -
        noveltyPenalty(candidate, selected);

      if (adjustedScore > bestScore) {
        bestScore = adjustedScore;
        bestIndex = index;
      }
    }

    selected.push(pool.splice(bestIndex, 1)[0]);
  }

  return selected;
}

function tokenizeName(value) {
  return normalizeName(value).split(" ").filter(Boolean);
}

export function classifyVerificationFreshness(verification, now = Date.now()) {
  if (!verification?.verified_at && !verification?.verifiedAt) return "unverified";

  const expiresAt = new Date(verification.expires_at || verification.expiresAt || 0).getTime();
  if (!Number.isFinite(expiresAt) || expiresAt <= now) return "stale";

  const remainingDays = (expiresAt - now) / (1000 * 60 * 60 * 24);
  if (remainingDays <= 3) return "aging";
  return "fresh";
}

function freshnessScore(bucket) {
  switch (safeLower(bucket)) {
    case "fresh":
      return 6;
    case "aging":
      return 3;
    case "stale":
      return -2;
    default:
      return 0;
  }
}

export function attachVerificationFreshness(attractions, verificationMap, now = Date.now()) {
  return toArray(attractions).map((attraction) => {
    const latestVerification = verificationMap?.get?.(attraction.id) || null;
    const freshnessBucket = classifyVerificationFreshness(latestVerification, now);
    const verificationStatus = latestVerification?.verified_at
      ? (freshnessBucket === "stale" ? "stale" : "verified")
      : firstNonEmpty(attraction.verification_status, "unverified");

    return {
      ...attraction,
      verification_status: verificationStatus,
      freshness_bucket: freshnessBucket,
      last_verified_at: firstNonEmpty(
        latestVerification?.verified_at,
        latestVerification?.verifiedAt,
        attraction.last_verified_at,
      ),
    };
  });
}

export function areNamesNearDuplicate(left, right) {
  const a = normalizeName(left);
  const b = normalizeName(right);
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.startsWith(`${b} `) || b.startsWith(`${a} `)) {
    return Math.min(tokenizeName(a).length, tokenizeName(b).length) >= 2;
  }

  const tokensA = new Set(tokenizeName(a));
  const tokensB = new Set(tokenizeName(b));
  let overlap = 0;
  for (const token of tokensA) {
    if (tokensB.has(token)) overlap += 1;
  }
  const denominator = Math.max(tokensA.size, tokensB.size, 1);
  return overlap / denominator >= 0.75;
}

function canonicalDedupKey(attraction) {
  return firstNonEmpty(attraction.google_place_id, attraction.googlePlaceId) || normalizeName(
    firstNonEmpty(attraction.canonical_name, attraction.canonicalName, attraction.name),
  );
}

export function collapseDuplicateAttractions(attractions) {
  const deduped = [];

  for (const attraction of toArray(attractions)) {
    const directKey = canonicalDedupKey(attraction);
    const existingIndex = deduped.findIndex((candidate) => {
      const candidateKey = canonicalDedupKey(candidate);
      if (directKey && candidateKey && directKey === candidateKey) return true;
      return areNamesNearDuplicate(
        firstNonEmpty(candidate.canonical_name, candidate.canonicalName, candidate.name),
        firstNonEmpty(attraction.canonical_name, attraction.canonicalName, attraction.name),
      );
    });

    if (existingIndex === -1) {
      deduped.push(attraction);
      continue;
    }

    const current = deduped[existingIndex];
    const currentScore = Number(current._score || 0) + Number(current.times_seen || 0);
    const incomingScore = Number(attraction._score || 0) + Number(attraction.times_seen || 0);

    if (incomingScore > currentScore) {
      deduped[existingIndex] = {
        ...current,
        ...attraction,
        times_seen: Math.max(Number(current.times_seen || 0), Number(attraction.times_seen || 0)),
      };
    } else {
      deduped[existingIndex] = {
        ...current,
        times_seen: Math.max(Number(current.times_seen || 0), Number(attraction.times_seen || 0)),
      };
    }
  }

  return deduped;
}

export function rankCandidateAttractions(attractions, context = {}) {
  const {
    childrenAges = [],
    requestedActivities = [],
    tripGoals = [],
    mustHaves = [],
    avoidances = [],
    transportPreferences = [],
    accessibilityNeeds = [],
    scheduleConstraints = [],
    pace = "",
    pets = [],
    maxResults = 8,
  } = context;

  const scored = collapseDuplicateAttractions([...toArray(attractions)]
    .filter((attraction) => safeLower(attraction.verification_status) !== "rejected")
    .map((attraction) => {
      let score = 0;
      score += Number(attraction.kid_appeal_score || 0);
      score += Number(attraction.parent_appeal_score || 0) * 0.5;
      score += Number(attraction.confidence_score || 0) * 4;
      score += verificationScore(attraction.verification_status);
      score += freshnessScore(attraction.freshness_bucket);
      score += recencyScore(attraction.last_seen_at || attraction.updated_at);
      score += Math.min(Number(attraction.times_seen || 0), 5);
      score += keywordScore(attraction, requestedActivities);
      score += phraseMatchScore(attraction, tripGoals, 2);
      score += phraseMatchScore(attraction, mustHaves, 4);
      score -= phrasePenalty(attraction, avoidances, 4);
      score += phraseMatchScore(attraction, transportPreferences, 1.5);
      score += phraseMatchScore(attraction, accessibilityNeeds, 2);
      score -= phrasePenalty(attraction, scheduleConstraints, 1.5);

      if (childrenAges.length > 0) {
        if (attraction.stroller_friendly) score += 2;
        if (safeLower(attraction.indoor_outdoor) === "both") score += 1;
      }

      if (pace && (safeLower(attraction.pace_fit) === safeLower(pace) || safeLower(attraction.pace_fit) === "any")) {
        score += 2;
      }

      if (pets.length > 0) {
        score += attraction.pet_friendly ? 2 : -1;
      }

      return { ...attraction, _score: score };
    }))
    .sort((a, b) => b._score - a._score);

  const candidatePool = scored.slice(0, Math.max(maxResults * 3, maxResults + 8));
  return selectDiverseAttractions(candidatePool, maxResults);
}

export function buildCachedAttractionsSummary(attractions, { maxItems = 6, compact = false } = {}) {
  const lines = toArray(attractions)
    .slice(0, maxItems)
    .map((attraction) => {
      const name = firstNonEmpty(attraction.canonical_name, attraction.canonicalName, attraction.name);
      const category = firstNonEmpty(attraction.category, "general");
      const area = firstNonEmpty(attraction.city_display_name, attraction.cityDisplayName);
      const indoorOutdoor = firstNonEmpty(attraction.indoor_outdoor, attraction.indoorOutdoor);
      const durationBucket = firstNonEmpty(attraction.duration_bucket, attraction.durationBucket);
      const whatItIs = firstNonEmpty(attraction.what_it_is, attraction.whatItIs, attraction.short_summary, attraction.shortSummary);
      const whyRecommended = firstNonEmpty(attraction.why_recommended, attraction.whyRecommended);
      const timingTip = firstNonEmpty(attraction.timing_tip, attraction.timingTip);
      const verification = firstNonEmpty(attraction.verification_status, attraction.verificationStatus, "unverified");

      if (compact) {
        const compactParts = [
          `${name} | ${category}`,
          area && `area: ${area}`,
          indoorOutdoor && `mode: ${indoorOutdoor}`,
          durationBucket && `duration: ${durationBucket}`,
          `status: ${verification}`,
        ].filter(Boolean);
        return `- ${compactParts.join(" | ")}`;
      }

      const parts = [
        `${name} (${category})`,
        whatItIs && `what it is: ${whatItIs}`,
        whyRecommended && `why it fits: ${whyRecommended}`,
        timingTip && `timing: ${timingTip}`,
        `status: ${verification}`,
      ].filter(Boolean);

      return `- ${parts.join(" | ")}`;
    });

  return lines.join("\n");
}

async function resolveCityRecord(admin, destination, coords = {}, countryCode = "US", { createIfMissing = false } = {}) {
  const identity = deriveCityIdentity(destination, coords);
  if (!identity.cityName) return null;

  let query = admin
    .from("cities")
    .select("id, city_name, display_name, country_code, region_code")
    .eq("country_code", countryCode)
    .ilike("city_name", identity.cityName)
    .limit(1);

  let { data, error } = await query;
  if (error) throw error;
  if (data?.length) return data[0];

  if (!createIfMissing) return null;

  const insertPayload = {
    country_code: countryCode,
    region_code: coords.regionCode || "",
    city_name: identity.cityName,
    display_name: identity.displayName,
    lat: Number(coords.lat) || 0,
    lon: Number(coords.lon) || 0,
    priority_tier: "tier3",
  };

  const { data: inserted, error: insertError } = await admin
    .from("cities")
    .insert(insertPayload)
    .select("id, city_name, display_name, country_code, region_code")
    .limit(1);

  if (insertError) throw insertError;
  return inserted?.[0] || null;
}

async function resolveRegionalCityPool(admin, coords = {}, countryCode = "US", limit = 12) {
  const regionCode = firstNonEmpty(coords.regionCode);
  if (!regionCode) return [];

  const { data, error } = await admin
    .from("cities")
    .select("id, city_name, display_name, country_code, region_code, lat, lon, priority_tier")
    .eq("country_code", countryCode)
    .eq("region_code", regionCode)
    .limit(limit);

  if (error) throw error;

  return toArray(data)
    .sort((left, right) => {
      const leftDistance = distanceScoreMiles(
        Number(coords.lat),
        Number(coords.lon),
        Number(left.lat),
        Number(left.lon),
      );
      const rightDistance = distanceScoreMiles(
        Number(coords.lat),
        Number(coords.lon),
        Number(right.lat),
        Number(right.lon),
      );
      return leftDistance - rightDistance;
    })
    .slice(0, limit);
}

async function resolveNearbyCityPool(admin, coords = {}, countryCode = "US", limit = 24) {
  const queryLimit = Math.max(limit * 12, 200);
  const { data, error } = await admin
    .from("cities")
    .select("id, city_name, display_name, country_code, region_code, lat, lon, priority_tier")
    .eq("country_code", countryCode)
    .limit(queryLimit);

  if (error) throw error;

  return toArray(data)
    .sort((left, right) => {
      const leftDistance = distanceScoreMiles(
        Number(coords.lat),
        Number(coords.lon),
        Number(left.lat),
        Number(left.lon),
      );
      const rightDistance = distanceScoreMiles(
        Number(coords.lat),
        Number(coords.lon),
        Number(right.lat),
        Number(right.lon),
      );
      return leftDistance - rightDistance;
    })
    .slice(0, limit);
}

async function fetchAttractionsForCityIds(admin, cityIds, limit = 50) {
  const safeIds = toArray(cityIds).filter(Boolean);
  if (safeIds.length === 0) return [];

  const { data, error } = await admin
    .from("city_attractions")
    .select("*")
    .in("city_id", safeIds)
    .neq("verification_status", "rejected")
    .limit(limit);

  if (error) throw error;
  return data || [];
}

function buildStoredAttraction(activity) {
  return {
    canonical_name: firstNonEmpty(activity.name, "Unknown attraction"),
    short_summary: firstNonEmpty(activity.whatItIs, activity.description, activity.whyRecommended),
    category: firstNonEmpty(activity.category, "general"),
    duration_bucket: mapDurationBucket(activity.duration),
    stroller_friendly: /stroller/i.test(`${activity.whyRecommended || ""} ${activity.whatItIs || ""}`),
    rainy_day_fit: /rain/i.test(`${activity.whyRecommended || ""} ${activity.whatItIs || ""}`),
    parent_appeal_score: activity.kidFriendly ? 7 : 6,
    kid_appeal_score: activity.kidFriendly ? 8 : 4,
    pet_friendly: Boolean(activity.petFriendly),
    confidence_score: 0.65,
    llm_notes: "Captured from live trip generation",
    why_recommended: firstNonEmpty(activity.whyRecommended),
    timing_tip: firstNonEmpty(activity.timingTip),
    verification_status: "unverified",
    source_type: "generated",
  };
}

function buildVerifiedPayload(activity, place) {
  return {
    attractionName: firstNonEmpty(activity.name),
    resolvedName: firstNonEmpty(place?.name),
    placeId: firstNonEmpty(place?.placeId),
    address: firstNonEmpty(place?.address),
    mapsUrl: firstNonEmpty(place?.mapsUrl),
    rating: place?.rating ?? null,
    userRatingsTotal: place?.userRatingsTotal ?? null,
  };
}

async function fetchExistingAttractions(admin, cityId) {
  const { data, error } = await admin
    .from("city_attractions")
    .select("id, canonical_name, google_place_id, times_seen, verification_status")
    .eq("city_id", cityId)
    .limit(100);

  if (error) throw error;
  return data || [];
}

async function fetchLatestVerificationMap(admin, attractionIds) {
  const ids = toArray(attractionIds).filter(Boolean);
  if (ids.length === 0) return new Map();

  const { data, error } = await admin
    .from("attraction_verification_cache")
    .select("attraction_id, provider, verified_at, expires_at")
    .in("attraction_id", ids)
    .order("verified_at", { ascending: false })
    .limit(Math.max(ids.length * 5, 50));

  if (error) throw error;

  const latestByAttraction = new Map();
  for (const row of toArray(data)) {
    if (!row?.attraction_id || latestByAttraction.has(row.attraction_id)) continue;
    latestByAttraction.set(row.attraction_id, row);
  }
  return latestByAttraction;
}

function findExistingAttraction(existingRows, stored) {
  return existingRows.find((row) => {
    if (stored.google_place_id && row.google_place_id && stored.google_place_id === row.google_place_id) {
      return true;
    }
    return areNamesNearDuplicate(row.canonical_name, stored.canonical_name);
  }) || null;
}

async function writeVerificationCache(admin, attractionId, place) {
  if (!attractionId || !place?.placeId) return;
  const verifiedAt = new Date();
  const expiresAt = new Date(verifiedAt.getTime() + 14 * 24 * 60 * 60 * 1000);

  const { error } = await admin
    .from("attraction_verification_cache")
    .insert({
      attraction_id: attractionId,
      provider: "google_places_identity",
      verification_payload_json: buildVerifiedPayload({ name: place.name }, place),
      verified_at: verifiedAt.toISOString(),
      expires_at: expiresAt.toISOString(),
    });

  if (error) throw error;
}

async function resolveStoredAttraction(activity, destination, resolvePlaceIdentity) {
  const stored = buildStoredAttraction(activity);
  if (!resolvePlaceIdentity) return stored;

  const place = await resolvePlaceIdentity(activity.name, destination, activity.category);
  if (!place?.placeId) return stored;

  return {
    ...stored,
    canonical_name: firstNonEmpty(place.name, stored.canonical_name),
    google_place_id: place.placeId,
    verification_status: "verified",
    last_verified_at: new Date().toISOString(),
    short_summary: firstNonEmpty(stored.short_summary, place.address),
    _resolvedPlace: place,
  };
}

async function persistOneAttraction(admin, cityId, destination, activity, resolvePlaceIdentity) {
  const now = new Date().toISOString();
  const resolved = await resolveStoredAttraction(activity, destination, resolvePlaceIdentity);
  const { _resolvedPlace, ...stored } = resolved;
  const existingRows = await fetchExistingAttractions(admin, cityId);
  const existing = findExistingAttraction(existingRows, stored);

  if (existing?.id) {
    const { error: updateError } = await admin
      .from("city_attractions")
      .update({
        ...stored,
        times_seen: Number(existing.times_seen || 0) + 1,
        last_seen_at: now,
        updated_at: now,
      })
      .eq("id", existing.id);

    if (updateError) throw updateError;
    await writeVerificationCache(admin, existing.id, _resolvedPlace);
    return existing.id;
  }

  const { data: inserted, error: insertError } = await admin
    .from("city_attractions")
    .insert({
      city_id: cityId,
      ...stored,
      times_seen: 1,
      last_seen_at: now,
      updated_at: now,
    })
    .select("id")
    .limit(1);

  if (insertError) throw insertError;
  const insertedId = inserted?.[0]?.id || null;
  await writeVerificationCache(admin, insertedId, _resolvedPlace);
  return insertedId;
}

async function backfillOneAttraction(admin, row, destination, resolvePlaceIdentity) {
  if (!row?.id || row.google_place_id) {
    return { updated: false, skipped: true };
  }

  const place = await resolvePlaceIdentity?.(row.canonical_name, destination, row.category);
  if (!place?.placeId) {
    return { updated: false, skipped: true };
  }

  const now = new Date().toISOString();
  const payload = {
    canonical_name: firstNonEmpty(place.name, row.canonical_name),
    google_place_id: place.placeId,
    verification_status: "verified",
    last_verified_at: now,
    updated_at: now,
  };

  const { error } = await admin
    .from("city_attractions")
    .update(payload)
    .eq("id", row.id);

  if (error) throw error;
  await writeVerificationCache(admin, row.id, place);
  return { updated: true, skipped: false };
}

export async function refreshStaleCandidates(admin, candidates, destination, resolvePlaceIdentity) {
  const original = toArray(candidates);
  if (original.length === 0) return original;

  const stale = original.filter((c) => c.freshness_bucket === "stale");
  if (stale.length === 0) return original;

  const toRefresh = stale.slice(0, 5);

  async function doRefresh() {
    const refreshedIds = new Map();

    for (const candidate of toRefresh) {
      try {
        const place = await resolvePlaceIdentity(candidate.canonical_name, destination, candidate.category);
        if (!place?.placeId) continue;

        const now = new Date();
        const expiresAt = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

        await admin
          .from("city_attractions")
          .update({
            verification_status: "verified",
            last_verified_at: now.toISOString(),
            updated_at: now.toISOString(),
          })
          .eq("id", candidate.id);

        await admin
          .from("attraction_verification_cache")
          .insert({
            attraction_id: candidate.id,
            provider: "google_places_identity",
            verification_payload_json: {
              attractionName: candidate.canonical_name,
              resolvedName: firstNonEmpty(place.name),
              placeId: firstNonEmpty(place.placeId),
              address: firstNonEmpty(place.address),
              mapsUrl: firstNonEmpty(place.mapsUrl),
              rating: place.rating ?? null,
              userRatingsTotal: place.userRatingsTotal ?? null,
            },
            verified_at: now.toISOString(),
            expires_at: expiresAt.toISOString(),
          });

        refreshedIds.set(candidate.id, {
          verification_status: "verified",
          freshness_bucket: "fresh",
          last_verified_at: now.toISOString(),
        });
      } catch (_) {
        // Skip individual failures — stale data is better than no data
      }
    }

    if (refreshedIds.size === 0) return original;

    return original.map((c) => {
      const update = refreshedIds.get(c.id);
      return update ? { ...c, ...update } : c;
    });
  }

  try {
    const result = await Promise.race([
      doRefresh(),
      new Promise((resolve) => setTimeout(() => resolve(original), 3000)),
    ]);
    return result;
  } catch (_) {
    return original;
  }
}

export function createAttractionMemoryService({
  getAdmin = getSupabaseAdmin,
  logger = log,
  resolvePlaceIdentity = enrichActivity,
} = {}) {
  async function withAdmin(work, fallback) {
    try {
      const admin = getAdmin();
      return await work(admin);
    } catch (error) {
      logger.warn("attraction-memory:unavailable", { error: error.message });
      return fallback;
    }
  }

  return {
    async getPlanningCandidates({
      destination,
      coords,
      countryCode = "US",
      childrenAges = [],
      requestedActivities = [],
      tripGoals = [],
      mustHaves = [],
      avoidances = [],
      transportPreferences = [],
      accessibilityNeeds = [],
      scheduleConstraints = [],
      pace = "",
      pets = [],
      maxResults = 8,
    }) {
      return withAdmin(async (admin) => {
        const identity = deriveCityIdentity(destination, coords);
        const broadRegional = isBroadRegionalDestination(identity, coords);
        const city = broadRegional
          ? null
          : await resolveCityRecord(admin, destination, coords, countryCode);
        const cityDisplayNames = new Map();
        const minimumAttractionPool = Math.max(Math.min(maxResults, 24), 12);

        let data = [];
        let source = "city";

        if (city?.id) {
          cityDisplayNames.set(city.id, city.display_name || city.city_name || identity.displayName);
          data = await fetchAttractionsForCityIds(admin, [city.id], 50);

          if ((data || []).length < minimumAttractionPool) {
            const supplementalCityIds = new Set();

            const regionalCities = await resolveRegionalCityPool(admin, coords, countryCode, 12);
            regionalCities.forEach((row) => {
              cityDisplayNames.set(row.id, row.display_name || row.city_name || "");
              if (row.id && row.id !== city.id) supplementalCityIds.add(row.id);
            });

            if (supplementalCityIds.size === 0 || (data || []).length < minimumAttractionPool) {
              const nearbyCities = await resolveNearbyCityPool(admin, coords, countryCode, 18);
              nearbyCities.forEach((row) => {
                cityDisplayNames.set(row.id, row.display_name || row.city_name || "");
                if (row.id && row.id !== city.id) supplementalCityIds.add(row.id);
              });
            }

            if (supplementalCityIds.size > 0) {
              const supplemental = await fetchAttractionsForCityIds(admin, [...supplementalCityIds], 160);
              data = [...data, ...supplemental];
              source = "city+nearby";
            }
          }
        } else {
          const regionalCities = await resolveRegionalCityPool(admin, coords, countryCode, 12);
          regionalCities.forEach((row) => {
            cityDisplayNames.set(row.id, row.display_name || row.city_name || "");
          });
          data = await fetchAttractionsForCityIds(
            admin,
            regionalCities.map((row) => row.id),
            120,
          );
          source = "region";
        }

        logger.info("attraction-memory:loaded", {
          destination,
          source,
          rawCount: (data || []).length,
        });

        const withCityDisplay = (data || []).map((row) => ({
          ...row,
          city_display_name: cityDisplayNames.get(row.city_id) || row.city_display_name || "",
        }));

        const withFreshness = attachVerificationFreshness(
          withCityDisplay,
          await fetchLatestVerificationMap(admin, withCityDisplay.map((row) => row.id)),
        );

        const ranked = rankCandidateAttractions(withFreshness, {
          childrenAges,
          requestedActivities,
          tripGoals,
          mustHaves,
          avoidances,
          transportPreferences,
          accessibilityNeeds,
          scheduleConstraints,
          pace,
          pets,
          maxResults,
        });

        logger.info("attraction-memory:ranked", { destination, rankedCount: ranked.length, maxResults });

        return refreshStaleCandidates(admin, ranked, destination, resolvePlaceIdentity);
      }, []);
    },

    async persistTripAttractions({
      destination,
      coords,
      countryCode = "US",
      tripPlan,
    }) {
      const activities = toArray(tripPlan?.suggestedActivities).filter((activity) => activity?.name);
      if (activities.length === 0) return;

      return withAdmin(async (admin) => {
        const city = await resolveCityRecord(admin, destination, coords, countryCode, { createIfMissing: true });
        if (!city?.id) return;

        for (const activity of activities.slice(0, 16)) {
          await persistOneAttraction(admin, city.id, destination, activity, resolvePlaceIdentity);
        }
      });
    },

    async backfillCityAttractions({
      destination,
      coords,
      countryCode = "US",
      limit = 25,
    }) {
      return withAdmin(async (admin) => {
        const city = await resolveCityRecord(admin, destination, coords, countryCode);
        if (!city?.id) return { cityId: null, scanned: 0, updated: 0, skipped: 0 };

        const { data, error } = await admin
          .from("city_attractions")
          .select("id, canonical_name, category, google_place_id, verification_status")
          .eq("city_id", city.id)
          .limit(limit);

        if (error) throw error;

        let updated = 0;
        let skipped = 0;
        const cityDestination = firstNonEmpty(city.display_name, city.city_name, destination);

        for (const row of toArray(data)) {
          const result = await backfillOneAttraction(admin, row, cityDestination, resolvePlaceIdentity);
          if (result.updated) updated += 1;
          if (result.skipped) skipped += 1;
        }

        return {
          cityId: city.id,
          scanned: toArray(data).length,
          updated,
          skipped,
        };
      }, { cityId: null, scanned: 0, updated: 0, skipped: 0 });
    },
  };
}
