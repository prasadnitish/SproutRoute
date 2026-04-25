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
    if (resetHeader) {
      const raw = Number(resetHeader);
      // express-rate-limit sends relative seconds; normalize to epoch
      rateLimitReset = raw > 1_000_000_000 ? raw : Math.floor(Date.now() / 1000) + raw;
    }
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
    onRateLimitInfo, // optional: (resetTimestamp) => void — for rate limit countdown UI
  } = config;

  const retryableSet = new Set(retryableStatuses);
  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    // Propagate external abort signal (from useTrip's abortRef) alongside timeout
    const externalSignal = options.signal;
    if (externalSignal?.aborted) throw Object.assign(new Error("Aborted"), { name: "AbortError" });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    // If external signal fires, abort our internal controller too
    const onExternalAbort = () => controller.abort();
    externalSignal?.addEventListener("abort", onExternalAbort);

    try {
      const response = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timeoutId);
      externalSignal?.removeEventListener("abort", onExternalAbort);
      return await parseSafeResponse(response);
    } catch (err) {
      clearTimeout(timeoutId);
      externalSignal?.removeEventListener("abort", onExternalAbort);

      // Distinguish user-initiated abort from timeout
      if (err.name === "AbortError" && externalSignal?.aborted) {
        throw Object.assign(new Error("Aborted"), { name: "AbortError" });
      }

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

      if (lastError.status === 429 && lastError.rateLimitReset && onRateLimitInfo) {
        onRateLimitInfo(lastError.rateLimitReset);
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
export const generateTripPlan = async (tripData, { signal, onRetry, onRateLimitInfo } = {}) =>
  fetchWithRetry(
    `${API_BASE_URL}/api/trip-plan`,
    { ...POST_OPTS(tripData), signal },
    { maxRetries: 2, timeoutMs: 60000, onRetry, onRateLimitInfo },
  );

/**
 * Regenerate ONLY the trip itinerary using cached weather (no geocoding round-trip).
 * Used when the user customizes activities after the initial plan is generated.
 * Requires tripData to include a `weather` field with the cached forecast.
 */
export const replanTrip = async (tripData, { signal, onRetry, onRateLimitInfo } = {}) =>
  fetchWithRetry(
    `${API_BASE_URL}/api/v1/trip/replan`,
    { ...POST_OPTS(tripData), signal },
    { maxRetries: 2, timeoutMs: 35000, onRetry, onRateLimitInfo },
  );

/**
 * Bundle endpoint — single call for plan + packing + weather + geocoding.
 * Replaces sequential generateTripPlan → generatePackingList flow.
 * Returns { trip, weather, tripPlan, packingList, safetyGuidance?, timings }.
 */
export const bundleTripPlan = async (tripData, { signal, onRetry, onRateLimitInfo } = {}) =>
  fetchWithRetry(
    `${API_BASE_URL}/api/v1/trip/bundle`,
    { ...POST_OPTS(tripData), signal },
    { maxRetries: 2, timeoutMs: 60000, onRetry, onRateLimitInfo },
  );

/** Generate the packing list (uses selected activities). */
export const generatePackingList = async (tripData, { signal, onRetry, onRateLimitInfo } = {}) =>
  fetchWithRetry(
    `${API_BASE_URL}/api/generate`,
    { ...POST_OPTS(tripData), signal },
    { maxRetries: 2, timeoutMs: 35000, onRetry, onRateLimitInfo },
  );

/** Resolve natural-language destination queries via AI NLP resolver. */
export const resolveDestination = async (query, { signal, onRetry, onRateLimitInfo } = {}) =>
  fetchWithRetry(
    `${API_BASE_URL}/api/v1/trip/resolve`,
    { ...POST_OPTS({ query }), signal },
    { maxRetries: 1, timeoutMs: 20000, onRetry, onRateLimitInfo },
  );

/** Health check. */
export const checkHealth = async () =>
  fetchWithRetry(`${API_BASE_URL}/api/health`, {}, { maxRetries: 0, timeoutMs: 5000 });

/** Car seat guidance by jurisdiction. */
export const getCarSeatGuidance = async (payload, { signal, onRetry, onRateLimitInfo } = {}) =>
  fetchWithRetry(
    `${API_BASE_URL}/api/safety/car-seat-check`,
    { ...POST_OPTS(payload), signal },
    { maxRetries: 1, timeoutMs: 20000, onRetry, onRateLimitInfo },
  );

/** Fetch /api/v1/meta/capabilities for feature flags. */
export const getCapabilities = async (client = "web") =>
  fetchWithRetry(
    `${API_BASE_URL}/api/v1/meta/capabilities?client=${client}`,
    {},
    { maxRetries: 0, timeoutMs: 5000 },
  );

/** Parse natural-language trip input via AI. */
export const parseInput = async (payload, { signal, onRetry, onRateLimitInfo } = {}) =>
  fetchWithRetry(
    `${API_BASE_URL}/api/v1/trip/parse-input`,
    { ...POST_OPTS(payload), signal },
    { maxRetries: 1, timeoutMs: 20000, onRetry, onRateLimitInfo },
  );

/** Fetch travel safety tips (car seat, general safety). */
export const getTravelSafety = async (payload, { signal, onRetry, onRateLimitInfo } = {}) =>
  fetchWithRetry(
    `${API_BASE_URL}/api/safety/travel-tips`,
    { ...POST_OPTS(payload), signal },
    { maxRetries: 1, timeoutMs: 20000, onRetry, onRateLimitInfo },
  );

// --- Pet travel safety ---

/** Fetch pet travel guidance (airline policies + entry requirements). */
export const petTravelCheck = async ({ pets, destination, countryCode, travelMode }, { signal, onRetry, onRateLimitInfo } = {}) =>
  fetchWithRetry(
    `${API_BASE_URL}/api/v1/safety/pet-travel-check`,
    { ...POST_OPTS({ pets, destination, countryCode, travelMode }), signal },
    { maxRetries: 1, timeoutMs: 20000, onRetry, onRateLimitInfo },
  );

// --- Phase 4: International safety API calls ---

/** Fetch US State Dept travel advisory for a country. Returns null for US or if unavailable. */
export const getTravelAdvisory = async (countryCode, { signal, onRetry, onRateLimitInfo } = {}) =>
  fetchWithRetry(
    `${API_BASE_URL}/api/v1/safety/travel-advisory/${encodeURIComponent(countryCode)}`,
    { signal },
    { maxRetries: 1, timeoutMs: 20000, onRetry, onRateLimitInfo },
  );

/** Fetch Amadeus/GeoSure neighborhood safety scores. Returns null if unavailable. */
export const getNeighborhoodSafety = async (lat, lon, { signal, onRetry, onRateLimitInfo } = {}) =>
  fetchWithRetry(
    `${API_BASE_URL}/api/v1/safety/neighborhood?lat=${lat.toFixed(4)}&lon=${lon.toFixed(4)}`,
    { signal },
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
  const result = {
    trip: null,
    weather: null,
    tripPlan: null,
    packingList: null,
    safetyGuidance: null,
    routePlan: null,
    stopWeather: {},
    stopItineraries: {},
    scheduledByStop: {},
  };

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
    let currentEventType = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        // SSE format: "event: <type>" followed by "data: <json>"
        if (line.startsWith("event: ")) {
          currentEventType = line.slice(7).trim();
        } else if (line.startsWith("data: ")) {
          try {
            const data = JSON.parse(line.slice(6));
            // Use the SSE event field, falling back to type inside JSON
            const type = currentEventType || data.type || data.event;
            currentEventType = ""; // reset for next event

            if (type === "route") {
              result.routePlan = data.routePlan || data;
              result.trip = data.trip || {
                destination: result.routePlan?.title || tripData.destination,
                startDate: tripData.startDate,
                endDate: tripData.endDate,
                duration: result.routePlan?.totalDays,
                activities: tripData.activities || [],
                children: [],
              };
              onEvent({ type: "route", data: { routePlan: result.routePlan, trip: result.trip } });
            } else if (type === "stop-weather") {
              const stopId = data.stop?.id;
              if (stopId) result.stopWeather[stopId] = data.weather;
              onEvent({ type: "stop-weather", data });
            } else if (type === "stop-itinerary") {
              const stopId = data.stop?.id;
              if (stopId) {
                result.stopItineraries[stopId] = data.tripPlan;
                if (data.scheduledItinerary) result.scheduledByStop[stopId] = data.scheduledItinerary;
              }
              if (data.tripPlan) {
                if (!result.tripPlan) {
                  result.tripPlan = data.tripPlan;
                  result.scheduledItinerary = data.scheduledItinerary || null;
                } else {
                  result.tripPlan = {
                    ...result.tripPlan,
                    suggestedActivities: [
                      ...(result.tripPlan.suggestedActivities || []),
                      ...(data.tripPlan.suggestedActivities || []),
                    ],
                    dailyItinerary: [
                      ...(result.tripPlan.dailyItinerary || []),
                      ...(data.tripPlan.dailyItinerary || []),
                    ],
                    tips: [...new Set([
                      ...(result.tripPlan.tips || []),
                      ...(data.tripPlan.tips || []),
                    ])],
                  };
                  if (data.scheduledItinerary) {
                    result.scheduledItinerary = [
                      ...(result.scheduledItinerary || []),
                      ...data.scheduledItinerary,
                    ];
                  }
                }
              }
              onEvent({ type: "stop-itinerary", data, accumulated: result });
            } else if (type === "destination") {
              result.trip = data;
              onEvent({ type: "destination", data });
            } else if (type === "weather") {
              result.weather = data.weather || data;
              onEvent({ type: "weather", data: result.weather });
            } else if (type === "itinerary-chunk") {
              if (data.tripPlan) {
                const isFirstChunk = !result.tripPlan;
                const chunk = data.chunk || 1;
                const totalChunks = data.totalChunks || 1;

                if (isFirstChunk) {
                  // First chunk — set initial data
                  result.tripPlan = data.tripPlan;
                  result.scheduledItinerary = data.scheduledItinerary || null;
                  result._totalChunks = totalChunks;
                  result._receivedChunks = 1;
                  onEvent({ type: "itinerary", data: result.tripPlan, scheduledItinerary: result.scheduledItinerary, chunk, totalChunks });
                } else {
                  // Subsequent chunks — merge into existing data
                  const prev = result.tripPlan;
                  result.tripPlan = {
                    ...prev,
                    dailyItinerary: [...(prev.dailyItinerary || []), ...(data.tripPlan.dailyItinerary || [])],
                    suggestedActivities: [...(prev.suggestedActivities || []), ...(data.tripPlan.suggestedActivities || [])],
                    tips: [...new Set([...(prev.tips || []), ...(data.tripPlan.tips || [])])],
                  };
                  if (data.scheduledItinerary) {
                    result.scheduledItinerary = [
                      ...(result.scheduledItinerary || []),
                      ...data.scheduledItinerary,
                    ];
                  }
                  result._receivedChunks = (result._receivedChunks || 1) + 1;
                  onEvent({ type: "itinerary-update", data: result.tripPlan, scheduledItinerary: result.scheduledItinerary, chunk, totalChunks });
                }
              } else {
                onEvent({ type: "itinerary-status", data });
              }
            } else if (type === "packing") {
              result.packingList = data.packingList || data;
              onEvent({ type: "packing", data: result.packingList });
            } else if (type === "safety") {
              result.safetyGuidance = data;
            } else if (type === "done") {
              if (data.routePlan) result.routePlan = data.routePlan;
              if (data.stopWeather) result.stopWeather = data.stopWeather;
              if (data.stopItineraries) result.stopItineraries = data.stopItineraries;
              if (data.tripPlan) result.tripPlan = data.tripPlan;
              if (data.trip) result.trip = data.trip;
              onEvent({ type: "done", data: result });
            } else if (type === "error") {
              const err = new Error(data.message || data.error || "Stream error");
              err.isStreamError = true;
              throw err;
            }
          } catch (parseErr) {
            if (parseErr.isStreamError) throw parseErr;
            // Ignore individual JSON parse failures
          }
        }
      }
    }

    return result;
  } catch (err) {
    if (err.name === "AbortError") throw err;

    // Fallback to bundle API
    console.warn("SSE stream failed, falling back to bundle:", err.message);
    // Check abort before fallback — prevents stale data overwriting new trip
    if (signal?.aborted) throw Object.assign(new Error("Aborted"), { name: "AbortError" });
    onEvent({ type: "fallback", data: null });
    const bundleResult = await bundleTripPlan(tripData, { signal });
    // Check abort again after bundle completes
    if (signal?.aborted) throw Object.assign(new Error("Aborted"), { name: "AbortError" });
    result.trip = bundleResult.trip || tripData;
    result.weather = bundleResult.weather;
    result.tripPlan = bundleResult.tripPlan;
    result.packingList = bundleResult.packingList;
    result.safetyGuidance = bundleResult.safetyGuidance || null;
    onEvent({ type: "done", data: result });
    return result;
  }
}
