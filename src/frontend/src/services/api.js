// Frontend API client — Phase 2 reliability upgrade
// Fixes:
//   #2: response.json() crash on non-JSON 502 HTML bodies → parseSafeResponse
//   #3: no retry on transient failures → fetchWithRetry with exponential backoff
//   #4: no rate-limit awareness → RateLimit-Reset header read + rateLimitReset on errors

const configuredApiBaseUrl = (import.meta.env.VITE_API_URL || "")
  .trim()
  .replace(/\/+$/, "");

const API_BASE_URL =
  configuredApiBaseUrl || (import.meta.env.PROD ? "" : "http://localhost:3000");

const API_CONFIG_ERROR =
  import.meta.env.PROD && !configuredApiBaseUrl
    ? "Configuration error: VITE_API_URL is not set. API requests are blocked in production."
    : null;

// ── Human-readable status messages ──────────────────────────────────────────

export const HTTP_STATUS_MESSAGES = {
  400: "The request was invalid. Please check your inputs.",
  404: "API endpoint not found. Check VITE_API_URL and backend route configuration.",
  422: "Your destination could not be processed. Please try a different location.",
  429: "Too many requests — please wait a moment before trying again.",
  500: "Server error. Please try again shortly.",
  502: "Server temporarily unavailable. Please try again in a few seconds.",
  503: "Service temporarily unavailable. Please try again in a few seconds.",
  504: "Server timed out. Please try again.",
};

const RETRYABLE_STATUSES = new Set([429, 502, 503, 504]);

// ── parseSafeResponse ────────────────────────────────────────────────────────

/**
 * Safely parse a fetch Response — never throws SyntaxError on non-JSON bodies.
 * Throws an Error with { status, retryable, rateLimitReset? } on failure.
 */
async function parseSafeResponse(response) {
  if (response.ok) {
    try {
      return await response.json();
    } catch {
      throw Object.assign(
        new Error("Server returned an unexpected response. Please try again."),
        { status: response.status, retryable: false },
      );
    }
  }

  const status = response.status;
  const retryable = RETRYABLE_STATUSES.has(status);

  // Read rate limit reset header for countdown UI (fix #4)
  let rateLimitReset;
  try {
    const resetHeader = response.headers?.get?.("RateLimit-Reset");
    if (resetHeader) rateLimitReset = Number(resetHeader);
  } catch { /* ignore */ }

  // Try to get message from body
  let bodyMessage = null;
  try {
    const json = await response.json();
    bodyMessage = json?.message || json?.error || null;
  } catch {
    try {
      const text = await response.text();
      if (text && !text.trim().startsWith("<")) {
        bodyMessage = text.trim().substring(0, 200);
      }
    } catch { /* ignore */ }
  }

  const humanMessage =
    bodyMessage && bodyMessage.length > 5 && !bodyMessage.includes("<html")
      ? bodyMessage
      : HTTP_STATUS_MESSAGES[status] || `Request failed (${status}). Please try again.`;

  const err = new Error(humanMessage);
  err.status = status;
  err.retryable = retryable;
  if (rateLimitReset !== undefined) err.rateLimitReset = rateLimitReset;
  throw err;
}

// ── fetchWithRetry ───────────────────────────────────────────────────────────

/**
 * Fetch with exponential backoff retry for transient failures.
 *
 * @param {string} url
 * @param {RequestInit} options
 * @param {object} config - { maxRetries, retryableStatuses, timeoutMs, onRetry }
 * @returns {Promise<any>} Parsed JSON
 */
async function fetchWithRetry(url, options = {}, config = {}) {
  if (API_CONFIG_ERROR) {
    throw Object.assign(new Error(API_CONFIG_ERROR), {
      status: 0,
      retryable: false,
    });
  }

  const {
    maxRetries = 2,
    retryableStatuses = [429, 502, 503, 504],
    timeoutMs = 30000,
    onRetry, // optional: (attempt, err) => void — for "Retrying..." UI
  } = config;

  const retryableSet = new Set(retryableStatuses);
  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timeoutId);
      return await parseSafeResponse(response);
    } catch (err) {
      clearTimeout(timeoutId);

      if (err.name === "AbortError") {
        lastError = Object.assign(
          new Error("Request timed out — the server is taking too long. Please try again."),
          { status: 0, retryable: true },
        );
      } else if (!err.status && err.message?.includes("Failed to fetch")) {
        lastError = Object.assign(
          new Error("Network error — please check your connection and try again."),
          { status: 0, retryable: true },
        );
      } else {
        lastError = err;
      }

      const isRetryable = lastError.retryable || retryableSet.has(lastError.status);
      if (!isRetryable || attempt >= maxRetries) throw lastError;

      const delay = 1000 * (2 ** attempt); // 1s, 2s, 4s
      if (onRetry) onRetry(attempt + 1, lastError);
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  throw lastError;
}

// ── Public API functions ─────────────────────────────────────────────────────

const POST_OPTS = (body) => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

/** Generate the trip itinerary + weather (full plan from scratch). */
export const generateTripPlan = async (tripData, { onRetry, onRateLimitInfo } = {}) =>
  fetchWithRetry(
    `${API_BASE_URL}/api/trip-plan`,
    POST_OPTS(tripData),
    { maxRetries: 2, timeoutMs: 35000, onRetry, onRateLimitInfo },
  );

/**
 * Regenerate ONLY the trip itinerary using cached weather (no geocoding round-trip).
 * Used when the user customizes activities after the initial plan is generated.
 * Requires tripData to include a `weather` field with the cached forecast.
 */
export const replanTrip = async (tripData, { onRetry, onRateLimitInfo } = {}) =>
  fetchWithRetry(
    `${API_BASE_URL}/api/v1/trip/replan`,
    POST_OPTS(tripData),
    { maxRetries: 2, timeoutMs: 35000, onRetry, onRateLimitInfo },
  );

/**
 * Bundle endpoint — single call for plan + packing + weather + geocoding.
 * Replaces sequential generateTripPlan → generatePackingList flow.
 * Returns { trip, weather, tripPlan, packingList, safetyGuidance?, timings }.
 */
export const bundleTripPlan = async (tripData, { onRetry, onRateLimitInfo } = {}) =>
  fetchWithRetry(
    `${API_BASE_URL}/api/v1/trip/bundle`,
    POST_OPTS(tripData),
    { maxRetries: 2, timeoutMs: 60000, onRetry, onRateLimitInfo },
  );

/** Generate the packing list (uses selected activities). */
export const generatePackingList = async (tripData, { onRetry, onRateLimitInfo } = {}) =>
  fetchWithRetry(
    `${API_BASE_URL}/api/generate`,
    POST_OPTS(tripData),
    { maxRetries: 2, timeoutMs: 35000, onRetry, onRateLimitInfo },
  );

/** Resolve natural-language destination queries via AI NLP resolver. */
export const resolveDestination = async (query, { onRetry, onRateLimitInfo } = {}) =>
  fetchWithRetry(
    `${API_BASE_URL}/api/v1/destination/ai-resolve`,
    POST_OPTS({ query }),
    { maxRetries: 1, timeoutMs: 20000, onRetry, onRateLimitInfo },
  );

/** Health check. */
export const checkHealth = async () =>
  fetchWithRetry(`${API_BASE_URL}/api/health`, {}, { maxRetries: 0, timeoutMs: 5000 });

/** Car seat guidance by jurisdiction. */
export const getCarSeatGuidance = async (payload, { onRetry, onRateLimitInfo } = {}) =>
  fetchWithRetry(
    `${API_BASE_URL}/api/safety/car-seat-check`,
    POST_OPTS(payload),
    { maxRetries: 1, timeoutMs: 20000, onRetry, onRateLimitInfo },
  );

/** Fetch /api/v1/meta/capabilities for feature flags. */
export const getCapabilities = async (client = "web") =>
  fetchWithRetry(
    `${API_BASE_URL}/api/v1/meta/capabilities?client=${client}`,
    {},
    { maxRetries: 0, timeoutMs: 5000 },
  );

// --- Phase 4: International safety API calls ---

/** Fetch US State Dept travel advisory for a country. Returns null for US or if unavailable. */
export const getTravelAdvisory = async (countryCode, { onRetry, onRateLimitInfo } = {}) =>
  fetchWithRetry(
    `${API_BASE_URL}/api/v1/safety/travel-advisory/${encodeURIComponent(countryCode)}`,
    {},
    { maxRetries: 1, timeoutMs: 20000, onRetry, onRateLimitInfo },
  );

/** Fetch Amadeus/GeoSure neighborhood safety scores. Returns null if unavailable. */
export const getNeighborhoodSafety = async (lat, lon, { onRetry, onRateLimitInfo } = {}) =>
  fetchWithRetry(
    `${API_BASE_URL}/api/v1/safety/neighborhood?lat=${lat.toFixed(4)}&lon=${lon.toFixed(4)}`,
    {},
    { maxRetries: 1, timeoutMs: 20000, onRetry, onRateLimitInfo },
  );

// ── SSE Streaming ──────────────────────────────────────────────────────────

/**
 * Stream trip plan via SSE (Server-Sent Events).
 * Falls back to bundleTripPlan if streaming fails.
 *
 * @param {object} tripData - Trip request payload
 * @param {function} onEvent - Called with { type, data } for each SSE event
 * @param {AbortSignal} signal - Optional abort signal for cancellation
 * @returns {Promise<object>} Accumulated result { trip, weather, tripPlan, packingList, safetyGuidance }
 */
export async function streamTripPlan(tripData, onEvent, signal) {
  if (API_CONFIG_ERROR) throw new Error(API_CONFIG_ERROR);

  const url = `${API_BASE_URL}/api/v1/trip/stream`;
  const result = { trip: null, weather: null, tripPlan: null, packingList: null, safetyGuidance: null };

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
      body: JSON.stringify(tripData),
      signal,
    });

    if (!response.ok) {
      throw new Error(`Stream failed with status ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          try {
            const data = JSON.parse(line.slice(6));
            const type = data.type || data.event;

            if (type === "destination") {
              result.trip = data.data || data;
              onEvent({ type: "destination", data: result.trip });
            } else if (type === "weather") {
              result.weather = data.data || data;
              onEvent({ type: "weather", data: result.weather });
            } else if (type === "itinerary-chunk" || type === "itinerary") {
              result.tripPlan = data.data || data;
              onEvent({ type: "itinerary", data: result.tripPlan });
            } else if (type === "packing") {
              result.packingList = data.data || data;
              onEvent({ type: "packing", data: result.packingList });
            } else if (type === "safety") {
              result.safetyGuidance = data.data || data;
            } else if (type === "done") {
              if (data.data) Object.assign(result, data.data);
              onEvent({ type: "done", data: result });
            } else if (type === "error") {
              throw new Error(data.message || data.error || "Stream error");
            }
          } catch (parseErr) {
            if (parseErr.message === "Stream error" || parseErr.message?.startsWith("Stream")) {
              throw parseErr;
            }
            // Ignore individual parse failures
          }
        }
      }
    }

    return result;
  } catch (err) {
    if (err.name === "AbortError") throw err;

    // Fallback to bundle API
    console.warn("SSE stream failed, falling back to bundle:", err.message);
    onEvent({ type: "fallback", data: null });
    const bundleResult = await bundleTripPlan(tripData, {});
    result.trip = bundleResult.trip || tripData;
    result.weather = bundleResult.weather;
    result.tripPlan = bundleResult.tripPlan;
    result.packingList = bundleResult.packingList;
    result.safetyGuidance = bundleResult.safetyGuidance || null;
    onEvent({ type: "done", data: result });
    return result;
  }
}
