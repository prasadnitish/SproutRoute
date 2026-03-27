// src/backend/services/placesEnrich.js
import { PlacesCache } from "../utils/placesCache.js";

const cache = new PlacesCache({ maxSize: 500, ttlMs: 24 * 60 * 60 * 1000 });

const FIELD_MASK = [
  "places.id", "places.displayName", "places.rating", "places.userRatingCount",
  "places.formattedAddress", "places.nationalPhoneNumber", "places.websiteUri",
  "places.regularOpeningHours", "places.priceLevel", "places.googleMapsUri", "places.photos",
].join(",");

export async function enrichActivity(activityName, destination, category = "") {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) return null;

  const cached = cache.get(activityName, destination);
  if (cached) return cached;

  try {
    const query = category
      ? `${activityName} ${category} in ${destination}`
      : `${activityName} in ${destination}`;

    const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": FIELD_MASK,
      },
      body: JSON.stringify({ textQuery: query, maxResultCount: 1 }),
    });

    if (!res.ok) return null;
    const data = await res.json();
    if (!data.places || data.places.length === 0) return null;

    const place = data.places[0];
    const result = {
      placeId: place.id,
      name: place.displayName?.text || activityName,
      rating: place.rating || null,
      userRatingsTotal: place.userRatingCount || null,
      address: place.formattedAddress || null,
      phone: place.nationalPhoneNumber || null,
      website: place.websiteUri || null,
      openingHours: place.regularOpeningHours?.weekdayDescriptions || [],
      priceLevel: parsePriceLevel(place.priceLevel),
      mapsUrl: place.googleMapsUri || null,
      photos: (place.photos || []).slice(0, 5).map(p =>
        `/api/v1/places/photo?ref=${encodeURIComponent(p.name)}`
      ),
    };

    cache.set(activityName, destination, result);
    return result;
  } catch (err) {
    if (process.env.NODE_ENV !== "production") console.error("Places enrichment error:", err);
    return null;
  }
}

function parsePriceLevel(level) {
  const map = {
    PRICE_LEVEL_FREE: 0, PRICE_LEVEL_INEXPENSIVE: 1,
    PRICE_LEVEL_MODERATE: 2, PRICE_LEVEL_EXPENSIVE: 3, PRICE_LEVEL_VERY_EXPENSIVE: 4,
  };
  return map[level] ?? null;
}

export function __resetCacheForTests() {
  cache._map.clear();
}
