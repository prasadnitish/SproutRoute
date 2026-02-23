// Amadeus Safe Place API client (powered by GeoSure).
// Returns neighborhood-level safety scores across 7 categories.
// Graceful: returns null if API is down or quota exhausted — never blocks trip planning.

const AMADEUS_BASE_URL = "https://test.api.amadeus.com";
const TOKEN_CACHE_TTL_MS = 29 * 60 * 1000; // 29 minutes (Amadeus tokens last 30 min)
const SAFETY_CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours
const SAFETY_CACHE_MAX_ENTRIES = 500;
const FETCH_TIMEOUT_MS = 10000;

/** @type {{ token: string | null, expiresAt: number }} */
let tokenCache = { token: null, expiresAt: 0 };

/** @type {Map<string, { value: object, timestamp: number }>} */
const safetyCache = new Map();

/**
 * Reset all caches. Only works in test environment.
 * Safe to leave exported — no-op in production.
 */
export function __resetNeighborhoodCacheForTests() {
  tokenCache = { token: null, expiresAt: 0 };
  safetyCache.clear();
}

/**
 * Read from TTL-aware safety cache.
 * @param {string} key - Cache key (rounded lat,lon)
 * @returns {object | null} Cached safety result or null
 */
function getCached(key) {
  const entry = safetyCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > SAFETY_CACHE_TTL_MS) {
    safetyCache.delete(key);
    return null;
  }
  return entry.value;
}

/**
 * Write to safety cache with LRU eviction when capacity is reached.
 * @param {string} key - Cache key
 * @param {object} value - Safety result to cache
 */
function setCached(key, value) {
  if (safetyCache.size >= SAFETY_CACHE_MAX_ENTRIES) {
    const oldest = safetyCache.keys().next().value;
    safetyCache.delete(oldest);
  }
  safetyCache.set(key, { value, timestamp: Date.now() });
}

/**
 * Acquire an Amadeus OAuth2 access token via client credentials flow.
 * Caches the token for 29 minutes to avoid redundant auth calls.
 * @returns {Promise<string | null>} Bearer token or null if env vars missing / auth fails
 */
async function getAmadeusToken() {
  // Return cached token if still valid
  if (tokenCache.token && Date.now() < tokenCache.expiresAt) {
    return tokenCache.token;
  }

  const clientId = process.env.AMADEUS_API_KEY;
  const clientSecret = process.env.AMADEUS_API_SECRET;

  if (!clientId || !clientSecret) {
    return null;
  }

  try {
    const response = await fetch(
      AMADEUS_BASE_URL + "/v1/security/oauth2/token",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: "grant_type=client_credentials"
          + "&client_id=" + encodeURIComponent(clientId)
          + "&client_secret=" + encodeURIComponent(clientSecret),
      },
    );

    if (!response.ok) {
      if (process.env.NODE_ENV !== "production") {
        console.warn("Amadeus OAuth failed with status", response.status);
      }
      return null;
    }

    const data = await response.json();
    const token = data.access_token;

    if (!token) {
      return null;
    }

    // Cache token for 29 minutes (1 minute safety margin on 30-min expiry)
    tokenCache = {
      token,
      expiresAt: Date.now() + TOKEN_CACHE_TTL_MS,
    };

    return token;
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("Amadeus OAuth error:", error.message);
    }
    return null;
  }
}

/**
 * Fetch neighborhood-level safety scores for a location from Amadeus Safe Place API.
 *
 * Scores use the GeoSure 1-100 scale (higher = safer) across 6 categories:
 *   physicalHarm, theft, healthMedical, womensSafety, lgbtqSafety, politicalFreedoms
 *
 * Coordinates are rounded to 2 decimal places (~1.1 km resolution) for caching.
 * Returns null gracefully on any failure — safety data is supplemental, never blocking.
 *
 * @param {number} lat - Latitude
 * @param {number} lon - Longitude
 * @returns {Promise<{
 *   overallScore: number,
 *   categories: {
 *     physicalHarm: number,
 *     theft: number,
 *     healthMedical: number,
 *     womensSafety: number,
 *     lgbtqSafety: number,
 *     politicalFreedoms: number,
 *   },
 *   source: "geosure",
 * } | null>}
 */
export async function getNeighborhoodSafety(lat, lon) {
  try {
    // Round to 2 decimal places for cache key (~1.1 km resolution)
    const roundedLat = Number(lat.toFixed(2));
    const roundedLon = Number(lon.toFixed(2));
    const cacheKey = roundedLat + "," + roundedLon;

    // Check cache first
    const cached = getCached(cacheKey);
    if (cached) return cached;

    // Get OAuth token
    const token = await getAmadeusToken();
    if (!token) return null;

    // Call Amadeus Safe Place API
    const url =
      AMADEUS_BASE_URL
      + "/v1/safety/safety-rated-locations"
      + "?latitude=" + roundedLat
      + "&longitude=" + roundedLon
      + "&radius=1";

    const response = await fetch(url, {
      headers: {
        Authorization: "Bearer " + token,
      },
    });

    if (!response.ok) {
      if (process.env.NODE_ENV !== "production") {
        console.warn("Amadeus Safe Place API returned status", response.status);
      }
      return null;
    }

    const body = await response.json();

    // Validate response structure
    if (!body.data || !Array.isArray(body.data) || body.data.length === 0) {
      return null;
    }

    const scores = body.data[0].safetyScores;
    if (!scores) return null;

    // Map Amadeus field names to our category names
    const result = {
      overallScore: scores.overall,
      categories: {
        physicalHarm: scores.physicalHarm,
        theft: scores.theft,
        healthMedical: scores.medical,
        womensSafety: scores.women,
        lgbtqSafety: scores.lgbtq,
        politicalFreedoms: scores.politicalFreedom,
      },
      source: "geosure",
    };

    setCached(cacheKey, result);
    return result;
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("Neighborhood safety lookup failed:", error.message);
    }
    return null;
  }
}
