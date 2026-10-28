/**
 * Fill a city that has no grounded attractions from Google Places, so a first request for a new city is planned
 * from real, open, well-reviewed places instead of the model's memory.
 *
 * Rows are stored with Google's facts only. Claude's family-fit judgment is added later by the refresh job, so
 * the filters here lean on place types and review counts to keep bars, casinos and hotels out meanwhile.
 */
import { normalize, distanceKm, SEARCH_MASK, placeRowFields } from "./placesGrounding.js";

const SEARCH_URL = "https://places.googleapis.com/v1/places:searchText";
const MIN_RATING = 4.0;
const MIN_REVIEWS = 100;
const MAX_KM = 60;
const MAX_ROWS = 40;
const EXCLUDED_PRIMARY = new Set([
  "bar", "night_club", "casino", "liquor_store", "lodging", "hotel", "motel", "resort_hotel", "hostel",
  "restaurant", "cafe", "bakery", "fast_food_restaurant", "meal_takeaway", "coffee_shop", "pub",
]);
const EXCLUDED_ANYWHERE = new Set(["night_club", "casino", "adult_entertainment", "strip_club"]);
const CATEGORIES = [
  [["zoo", "aquarium"], "wildlife"],
  [["museum", "art_gallery"], "museums"],
  [["park", "playground", "national_park", "state_park", "botanical_garden", "garden"], "parks"],
  [["amusement_park", "water_park", "ferris_wheel"], "theme_park"],
  [["beach"], "beach"],
  [["tourist_attraction", "historical_landmark", "monument", "observation_deck"], "landmark"],
];

const inflight = new Map();

function categoryFor(place) {
  const types = [place.primaryType, ...(place.types || [])].filter(Boolean);
  for (const [matches, category] of CATEGORIES) if (types.some((type) => matches.includes(type))) return category;
  return "general";
}

function isWorthStoring(place, city) {
  if (!place.placeId || !place.name) return false;
  if (place.businessStatus && place.businessStatus !== "OPERATIONAL") return false;
  if (!(place.rating >= MIN_RATING) || !(place.ratingCount >= MIN_REVIEWS)) return false;
  if (place.primaryType && EXCLUDED_PRIMARY.has(place.primaryType)) return false;
  if (place.types.some((type) => EXCLUDED_ANYWHERE.has(type))) return false;
  const hasCenter = Number.isFinite(city.lat) && Number.isFinite(city.lon) && !(city.lat === 0 && city.lon === 0);
  if (hasCenter && Number.isFinite(place.lat) && distanceKm(city.lat, city.lon, place.lat, place.lon) > MAX_KM) return false;
  return true;
}

async function searchPlaces(fetchFn, apiKey, textQuery, city) {
  const hasCenter = Number.isFinite(city.lat) && Number.isFinite(city.lon) && !(city.lat === 0 && city.lon === 0);
  const response = await fetchFn(SEARCH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": SEARCH_MASK },
    body: JSON.stringify({
      textQuery,
      maxResultCount: 20,
      ...(hasCenter ? { locationBias: { circle: { center: { latitude: city.lat, longitude: city.lon }, radius: 30000 } } } : {}),
    }),
  });
  if (!response.ok) throw new Error(`places_http_${response.status}`);
  return (await response.json())?.places || [];
}

async function fill({ admin, city, fetchFn, apiKey, now }) {
  if (!apiKey) return { status: "no_api_key", inserted: 0 };
  const name = city.display_name || city.city_name;
  const phrases = [`things to do with kids in ${name}`, `top attractions in ${name}`, `parks and playgrounds in ${name}`];

  const found = new Map();
  try {
    for (const phrase of phrases) {
      for (const raw of await searchPlaces(fetchFn, apiKey, phrase, city)) {
        const place = normalize(raw);
        if (!found.has(place.placeId) && isWorthStoring(place, city)) found.set(place.placeId, place);
      }
    }
  } catch (error) {
    return { status: "error", inserted: 0, reason: error.message };
  }

  const { data: existing, error: readError } = await admin.from("city_attractions").select("google_place_id").eq("city_id", city.id);
  if (readError) return { status: "error", inserted: 0, reason: readError.message };
  const have = new Set((existing || []).map((row) => row.google_place_id).filter(Boolean));

  const rows = [...found.values()]
    .filter((place) => !have.has(place.placeId))
    .sort((a, b) => b.ratingCount - a.ratingCount)
    .slice(0, MAX_ROWS)
    .map((place) => ({
      city_id: city.id,
      canonical_name: place.name,
      category: categoryFor(place),
      source_type: "places",
      confidence_score: 0.8,
      ...placeRowFields(place, { status: "active", nowIso: now }),
    }));
  if (!rows.length) return { status: "filled", inserted: 0 };

  const { error } = await admin.from("city_attractions").insert(rows);
  // A concurrent fill (another instance) may have inserted the same places; the unique index rejects the repeat.
  if (error && error.code !== "23505") return { status: "error", inserted: 0, reason: error.message };
  return { status: "filled", inserted: error ? 0 : rows.length };
}

/** @returns {Promise<{status: "filled"|"error"|"no_api_key", inserted: number, reason?: string}>} */
export function fillCityFromPlaces({ admin, city, fetchFn = globalThis.fetch, apiKey = process.env.GOOGLE_PLACES_API_KEY, now = new Date().toISOString() }) {
  if (inflight.has(city.id)) return inflight.get(city.id);
  const work = fill({ admin, city, fetchFn, apiKey, now }).finally(() => inflight.delete(city.id));
  inflight.set(city.id, work);
  return work;
}
