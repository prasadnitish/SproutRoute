/**
 * Resolve an attraction against Google Places (New) and return the facts we store: place id, rating,
 * review count, hours, price level, photo, business status, location and types.
 *
 * Google is the source of truth for whether a place exists and is open. A failed request is reported as
 * "error", never as "unmatched", so a quota problem or outage cannot retire good rows.
 */

const PLACES_URL = "https://places.googleapis.com/v1";
const FIELDS = [
  "id", "displayName", "location", "rating", "userRatingCount", "priceLevel",
  "regularOpeningHours", "photos", "businessStatus", "types", "primaryType",
];
const SEARCH_MASK = FIELDS.map((f) => `places.${f}`).join(",");
const DETAILS_MASK = FIELDS.join(",");

const PRICE_LEVELS = {
  PRICE_LEVEL_FREE: 0,
  PRICE_LEVEL_INEXPENSIVE: 1,
  PRICE_LEVEL_MODERATE: 2,
  PRICE_LEVEL_EXPENSIVE: 3,
  PRICE_LEVEL_VERY_EXPENSIVE: 4,
};

const STOPWORDS = new Set(["the", "of", "and", "a", "an", "at", "in", "on", "for"]);
const MIN_NAME_SCORE = 0.5;
const DEFAULT_MAX_KM = 60;

function tokens(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter((token) => token && !STOPWORDS.has(token));
}

/** Jaccard overlap of name tokens, 0 to 1. */
export function nameScore(left, right) {
  const a = new Set(tokens(left));
  const b = new Set(tokens(right));
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const token of a) if (b.has(token)) shared += 1;
  return shared / (a.size + b.size - shared);
}

function distanceKm(lat1, lon1, lat2, lon2) {
  const rad = (deg) => (deg * Math.PI) / 180;
  const h = Math.sin(rad(lat2 - lat1) / 2) ** 2
    + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lon2 - lon1) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

function normalize(place) {
  return {
    placeId: place.id,
    name: place.displayName?.text || null,
    lat: place.location?.latitude ?? null,
    lon: place.location?.longitude ?? null,
    rating: Number.isFinite(place.rating) ? place.rating : null,
    ratingCount: Number.isFinite(place.userRatingCount) ? place.userRatingCount : null,
    priceLevel: PRICE_LEVELS[place.priceLevel] ?? null,
    openingHours: place.regularOpeningHours
      ? { weekdayDescriptions: place.regularOpeningHours.weekdayDescriptions || [], periods: place.regularOpeningHours.periods || [] }
      : null,
    photoRef: place.photos?.[0]?.name || null,
    businessStatus: place.businessStatus || null,
    types: place.types || [],
    primaryType: place.primaryType || null,
  };
}

async function request(fetchFn, url, init) {
  try {
    const response = await fetchFn(url, init);
    return { response };
  } catch (error) {
    return { failure: { status: "error", reason: `network: ${error.message}` } };
  }
}

/**
 * @param {{name: string, city: string, cityLat?: number, cityLon?: number, placeId?: string, maxKm?: number}} target
 * @returns {Promise<{status: "matched", place: object} | {status: "unmatched", reason: string} | {status: "error", reason: string}>}
 */
export async function resolvePlace(target, { fetchFn = globalThis.fetch, apiKey = process.env.GOOGLE_PLACES_API_KEY } = {}) {
  if (!apiKey) return { status: "error", reason: "no_api_key" };
  const headers = { "Content-Type": "application/json", "X-Goog-Api-Key": apiKey };

  if (target.placeId) {
    const { response, failure } = await request(fetchFn, `${PLACES_URL}/places/${encodeURIComponent(target.placeId)}`, {
      method: "GET",
      headers: { ...headers, "X-Goog-FieldMask": DETAILS_MASK },
    });
    if (failure) return failure;
    if (response.status === 404) return { status: "unmatched", reason: "not_found" };
    if (!response.ok) return { status: "error", reason: `http_${response.status}` };
    const place = await response.json();
    return place?.id ? { status: "matched", place: normalize(place) } : { status: "unmatched", reason: "not_found" };
  }

  const hasCenter = Number.isFinite(target.cityLat) && Number.isFinite(target.cityLon);
  const body = {
    textQuery: `${target.name} ${target.city}`,
    maxResultCount: 5,
    ...(hasCenter ? { locationBias: { circle: { center: { latitude: target.cityLat, longitude: target.cityLon }, radius: 50000 } } } : {}),
  };
  const { response, failure } = await request(fetchFn, `${PLACES_URL}/places:searchText`, {
    method: "POST",
    headers: { ...headers, "X-Goog-FieldMask": SEARCH_MASK },
    body: JSON.stringify(body),
  });
  if (failure) return failure;
  if (!response.ok) return { status: "error", reason: `http_${response.status}` };

  const candidates = (await response.json())?.places || [];
  if (!candidates.length) return { status: "unmatched", reason: "no_results" };

  const scored = candidates
    .map((place) => ({ place, score: nameScore(target.name, place.displayName?.text) }))
    .filter((entry) => entry.score >= MIN_NAME_SCORE)
    .sort((a, b) => b.score - a.score);
  if (!scored.length) return { status: "unmatched", reason: "no_close_name" };

  const maxKm = target.maxKm ?? DEFAULT_MAX_KM;
  const nearby = scored.filter(({ place }) => !hasCenter || !place.location
    || distanceKm(target.cityLat, target.cityLon, place.location.latitude, place.location.longitude) <= maxKm);
  if (!nearby.length) return { status: "unmatched", reason: "too_far" };

  return { status: "matched", place: normalize(nearby[0].place) };
}

/** The status a resolve result implies: null means "leave the row alone" (the request failed). */
export function statusForPlace(result) {
  if (result.status === "error") return null;
  if (result.status === "unmatched") return "closed_unverified";
  return result.place.businessStatus === "CLOSED_PERMANENTLY" ? "closed_unverified" : "active";
}
