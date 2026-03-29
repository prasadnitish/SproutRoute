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

function tokenizeName(value) {
  return normalizeName(value).split(" ").filter(Boolean);
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
    pace = "",
    pets = [],
    maxResults = 8,
  } = context;

  return collapseDuplicateAttractions([...toArray(attractions)]
    .filter((attraction) => safeLower(attraction.verification_status) !== "rejected")
    .map((attraction) => {
      let score = 0;
      score += Number(attraction.kid_appeal_score || 0);
      score += Number(attraction.parent_appeal_score || 0) * 0.5;
      score += Number(attraction.confidence_score || 0) * 4;
      score += verificationScore(attraction.verification_status);
      score += recencyScore(attraction.last_seen_at || attraction.updated_at);
      score += Math.min(Number(attraction.times_seen || 0), 5);
      score += keywordScore(attraction, requestedActivities);

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
    .sort((a, b) => b._score - a._score)
    .slice(0, maxResults);
}

export function buildCachedAttractionsSummary(attractions, { maxItems = 6 } = {}) {
  const lines = toArray(attractions)
    .slice(0, maxItems)
    .map((attraction) => {
      const name = firstNonEmpty(attraction.canonical_name, attraction.canonicalName, attraction.name);
      const category = firstNonEmpty(attraction.category, "general");
      const whatItIs = firstNonEmpty(attraction.what_it_is, attraction.whatItIs, attraction.short_summary, attraction.shortSummary);
      const whyRecommended = firstNonEmpty(attraction.why_recommended, attraction.whyRecommended);
      const timingTip = firstNonEmpty(attraction.timing_tip, attraction.timingTip);
      const verification = firstNonEmpty(attraction.verification_status, attraction.verificationStatus, "unverified");

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
      pace = "",
      pets = [],
      maxResults = 8,
    }) {
      return withAdmin(async (admin) => {
        const city = await resolveCityRecord(admin, destination, coords, countryCode);
        if (!city?.id) return [];

        const { data, error } = await admin
          .from("city_attractions")
          .select("*")
          .eq("city_id", city.id)
          .neq("verification_status", "rejected")
          .limit(50);

        if (error) throw error;
        return rankCandidateAttractions(data || [], {
          childrenAges,
          requestedActivities,
          pace,
          pets,
          maxResults,
        });
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
  };
}
