// Geocoding + destination-intent resolver:
// - Converts user text into concrete US coordinates (Nominatim).
// - Expands fuzzy intents ("2 hours from X") into nearby destination suggestions (Overpass).
// - Uses bounded caching and radius limits to stay fast and abuse-resistant.
const NOMINATIM_TIMEOUT_MS = 8000;
const OVERPASS_TIMEOUT_MS = 12000;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
const CACHE_MAX_ENTRIES = 500;

// 500 mi ceiling prevents abuse via giant Overpass queries while staying generous for road trips.
const MAX_RADIUS_MILES = 500;
// 60 mph average chosen over routing APIs to keep MVP cost-free.
const DEFAULT_DRIVE_SPEED_MPH = 60;
const MAX_SUGGESTIONS = 3;

const geocodeCache = new Map();
const suggestionCache = new Map();

// Test helper to reset in-memory caches between test cases.
// No-op outside of the test environment so the export is safe to leave on the module.
export function __resetGeocodingCachesForTests() {
  if (process.env.NODE_ENV !== "test") return;
  geocodeCache.clear();
  suggestionCache.clear();
}

function getCache(map, key) {
  // Shared TTL-aware cache read used by geocode + suggestion lookups.
  const cached = map.get(key);
  if (!cached) return null;
  if (Date.now() - cached.timestamp > CACHE_TTL_MS) {
    map.delete(key);
    return null;
  }
  return cached.value;
}

// Evict the oldest entry when the map hits its cap; Map preserves insertion order.
function setCache(map, key, value) {
  if (map.size >= CACHE_MAX_ENTRIES) {
    map.delete(map.keys().next().value);
  }
  map.set(key, { value, timestamp: Date.now() });
}

async function fetchWithTimeout(url, options, timeoutMs) {
  // Keeps upstream calls from hanging request handlers indefinitely.
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

function extractStateCode(result) {
  // Normalize Nominatim's varying ISO fields into a simple US two-letter code.
  const isoCode =
    result?.address?.["ISO3166-2-lvl4"] ||
    result?.address?.["ISO3166-2-lvl3"] ||
    result?.address?.["ISO3166-2-lvl2"];

  if (typeof isoCode === "string" && isoCode.startsWith("US-")) {
    return isoCode.slice(3).toUpperCase();
  }

  const fallbackStateCode = result?.address?.state_code;
  if (typeof fallbackStateCode === "string" && fallbackStateCode.length >= 2) {
    return fallbackStateCode.slice(0, 2).toUpperCase();
  }

  return null;
}

export async function geocodeLocation(locationString) {
  // Core geocoder used by both trip planning and destination suggestion flows.
  const cacheKey = locationString.trim().toLowerCase();
  const cached = getCache(geocodeCache, cacheKey);
  if (cached) return cached;

  try {
    const encodedLocation = encodeURIComponent(locationString);
    const response = await fetchWithTimeout(
      `https://nominatim.openstreetmap.org/search?q=${encodedLocation}&format=json&addressdetails=1&limit=1&countrycodes=us`,
      {
        headers: {
          "User-Agent": "SproutRoute/1.0",
        },
      },
      NOMINATIM_TIMEOUT_MS,
    );

    if (!response.ok) {
      throw new Error("Geocoding service unavailable");
    }

    const data = await response.json();

    if (!data || data.length === 0) {
      throw new Error("Location not found. Please enter a US city.");
    }

    const result = data[0];
    const parsed = {
      lat: parseFloat(result.lat),
      lon: parseFloat(result.lon),
      displayName: result.display_name,
      stateName: result?.address?.state || null,
      stateCode: extractStateCode(result),
    };

    // Guard against corrupt or spoofed upstream responses before caching.
    if (
      !Number.isFinite(parsed.lat) ||
      !Number.isFinite(parsed.lon) ||
      parsed.lat < -90 ||
      parsed.lat > 90 ||
      parsed.lon < -180 ||
      parsed.lon > 180
    ) {
      throw new Error("Invalid coordinates from geocoding service");
    }

    setCache(geocodeCache, cacheKey, parsed);
    return parsed;
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error("Geocoding timed out. Please try again.");
    }
    throw new Error("Failed to geocode location: " + error.message);
  }
}

function parseLocationQuery(input) {
  // Lightweight NLP parser: classify query as city, distance, drive-time, or "near".
  const normalized = input.trim();
  const hoursMatch = normalized.match(
    /(\d+(?:\.\d+)?)\s*(hour|hr|hrs|hours)\s*(drive|driving)?\s*(from|of)\s+(.+)/i,
  );
  if (hoursMatch) {
    return {
      type: "drive_time",
      hours: parseFloat(hoursMatch[1]),
      base: hoursMatch[5].trim(),
    };
  }

  const milesMatch = normalized.match(
    /(\d+(?:\.\d+)?)\s*(mile|miles|mi)\s*(from|of|around|near)\s+(.+)/i,
  );
  if (milesMatch) {
    return {
      type: "distance",
      miles: parseFloat(milesMatch[1]),
      base: milesMatch[4].trim(),
    };
  }

  const nearMatch = normalized.match(/(near|around|close to)\s+(.+)/i);
  if (nearMatch) {
    return {
      type: "near",
      base: nearMatch[2].trim(),
    };
  }

  return { type: "city", query: normalized };
}

function milesToMeters(miles) {
  // Overpass "around" operator uses meters, but product UX speaks miles.
  return miles * 1609.34;
}

function haversineDistanceMiles(lat1, lon1, lat2, lon2) {
  // Great-circle distance approximation: good enough for ranking nearby options.
  const toRad = (deg) => (deg * Math.PI) / 180;
  const R = 3958.8; // Earth radius in miles
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function extractNearbyCities(elements, originLat, originLon) {
  // Converts raw Overpass elements into ranked, de-duplicated suggestion cards.
  const results = elements
    .filter((el) => el.tags && el.tags.name)
    .map((el) => {
      const distanceMiles = haversineDistanceMiles(
        originLat,
        originLon,
        el.lat,
        el.lon,
      );
      const state =
        el.tags["addr:state"] || el.tags["is_in:state"] || el.tags.state;

      return {
        name: el.tags.name,
        displayName: state ? `${el.tags.name}, ${state}` : el.tags.name,
        lat: el.lat,
        lon: el.lon,
        distanceMiles: Math.round(distanceMiles),
      };
    })
    .sort((a, b) => a.distanceMiles - b.distanceMiles);

  const unique = [];
  const seen = new Set();
  for (const place of results) {
    const key = place.displayName.toLowerCase();
    if (!seen.has(key)) {
      unique.push(place);
      seen.add(key);
    }
    if (unique.length >= MAX_SUGGESTIONS) break;
  }

  return unique;
}

async function getNearbyCities(lat, lon, radiusMiles) {
  // Queries Overpass for populated places near origin; intentionally capped + filtered.
  // Defense-in-depth: cap even if upstream validation is bypassed.
  const radiusMeters = Math.min(
    milesToMeters(MAX_RADIUS_MILES),
    Math.max(10000, milesToMeters(radiusMiles)),
  );
  const query = `
    [out:json][timeout:25];
    (
      node["place"~"city|town|village"](around:${Math.round(
        radiusMeters,
      )},${lat},${lon});
    );
    out body 20;
  `;

  const response = await fetchWithTimeout(
    "https://overpass-api.de/api/interpreter",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "SproutRoute/1.0",
      },
      body: `data=${encodeURIComponent(query)}`,
    },
    OVERPASS_TIMEOUT_MS,
  );

  if (!response.ok) {
    throw new Error("Nearby places service unavailable");
  }

  const data = await response.json();
  if (!data.elements) return [];

  return extractNearbyCities(data.elements, lat, lon);
}

async function buildNearbyResult(parsed, baseCoords, cacheKey) {
  // Derives search radius from user intent and gracefully degrades to direct destination.
  const radiusMiles =
    parsed.type === "drive_time"
      ? Math.min(
          MAX_RADIUS_MILES,
          Math.max(20, parsed.hours * DEFAULT_DRIVE_SPEED_MPH),
        )
      : parsed.type === "distance"
        ? Math.min(MAX_RADIUS_MILES, Math.max(20, parsed.miles))
        : 60;

  let nearbyRaw = [];
  try {
    nearbyRaw = await getNearbyCities(
      baseCoords.lat,
      baseCoords.lon,
      radiusMiles,
    );
  } catch (error) {
    // Overpass failures are non-fatal — we fall back to the base city below.
    if (process.env.NODE_ENV !== "production") {
      console.warn("Nearby suggestions unavailable:", error.message);
    }
  }

  const baseName = (baseCoords.displayName || parsed.base).toLowerCase();
  const nearby = nearbyRaw.filter(
    (place) => place.displayName.toLowerCase() !== baseName,
  );

  if (!nearby.length) {
    const fallbackResult = {
      mode: "direct",
      destination: baseCoords.displayName || parsed.base,
    };
    setCache(suggestionCache, cacheKey, fallbackResult);
    return fallbackResult;
  }

  const suggestionResult = {
    mode: "suggestions",
    origin: baseCoords.displayName || parsed.base,
    suggestions: nearby,
  };
  setCache(suggestionCache, cacheKey, suggestionResult);
  return suggestionResult;
}

export async function resolveDestinationQuery(input) {
  // Public API helper: validate input length and resolve free-text destination intent into direct mode or suggestions.
  const trimmed = String(input || "").trim();
  
  if (trimmed.length < 2) {
    throw new Error("Destination must be at least 2 characters");
  }
  if (trimmed.length > 500) {
    throw new Error("Destination is too long (max 500 characters)");
  }

  const cacheKey = trimmed.toLowerCase();
  const cached = getCache(suggestionCache, cacheKey);
  if (cached) return cached;

  const parsed = parseLocationQuery(trimmed);

  if (parsed.type === "city") {
    const coords = await geocodeLocation(parsed.query);
    const directResult = {
      mode: "direct",
      destination: coords.displayName || parsed.query,
    };
    setCache(suggestionCache, cacheKey, directResult);
    return directResult;
  }

  const baseCoords = await geocodeLocation(parsed.base);
  return buildNearbyResult(parsed, baseCoords, cacheKey);
}
