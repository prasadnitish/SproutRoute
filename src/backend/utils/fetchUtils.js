/**
 * fetchUtils.js — Shared fetch utilities (Node-compatible ESM)
 *
 * Used by:
 *   - src/frontend/src/services/api.js (browser, via copy or import)
 *   - tests/unit/apiFetch.test.js (Node, directly)
 *
 * Fixes Phase 2 critical bugs #2 and #3:
 *   #2: response.json() crash on non-JSON 502 HTML bodies
 *   #3: no retry on transient failures
 */

// ── Human-readable status messages ──────────────────────────────────────────

export const HTTP_STATUS_MESSAGES = {
  400: "The request was invalid. Please check your inputs.",
  401: "Authentication required. Please refresh the page.",
  403: "Access denied. Please contact support if this is unexpected.",
  404: "The requested resource was not found.",
  422: "Your destination could not be processed. Please try a different location.",
  429: "Too many requests — please wait a moment before trying again.",
  500: "Server error. Our team has been notified. Please try again shortly.",
  502: "Server temporarily unavailable. Please try again in a few seconds.",
  503: "Service temporarily unavailable. Please try again in a few seconds.",
  504: "Server timed out. Please try again.",
};

/** Status codes that indicate a transient failure worth retrying */
const DEFAULT_RETRYABLE_STATUSES = new Set([429, 502, 503, 504]);

// ── parseSafeResponse ────────────────────────────────────────────────────────

/**
 * Safely parse a fetch Response — never throws SyntaxError on non-JSON bodies.
 *
 * On success (response.ok): returns parsed JSON body (+ calls onRateLimitInfo if provided).
 * On failure: throws an Error with human-readable message, `status`, and `retryable` props.
 *
 * @param {Response} response - A fetch Response object
 * @param {object} [hooks] - Optional hooks
 * @param {function} [hooks.onRateLimitInfo] - Called with { remaining, reset } from headers
 * @returns {Promise<any>} Parsed JSON data
 * @throws {Error & { status: number, retryable: boolean, rateLimitReset?: number }}
 */
export async function parseSafeResponse(response, hooks = {}) {
  const { onRateLimitInfo } = hooks;

  if (response.ok) {
    // Read rate-limit headers from successful responses too (for low-remaining warning)
    if (onRateLimitInfo) {
      try {
        const remaining = response.headers?.get?.("RateLimit-Remaining");
        const reset = response.headers?.get?.("RateLimit-Reset");
        if (remaining !== null && remaining !== undefined) {
          onRateLimitInfo({
            remaining: Number(remaining),
            reset: reset ? Number(reset) : null,
          });
        }
      } catch { /* headers unavailable — ignore */ }
    }

    // Success path: try JSON, fall back to text
    try {
      return await response.json();
    } catch {
      throw Object.assign(
        new Error("Server returned unexpected non-JSON response."),
        { status: response.status, retryable: false },
      );
    }
  }

  // Error path: always try to get a message, never crash on HTML body
  const status = response.status;
  const retryable = DEFAULT_RETRYABLE_STATUSES.has(status);

  // Try reading rate limit reset header for 429 countdown UI
  let rateLimitReset;
  try {
    const resetHeader = response.headers?.get?.("RateLimit-Reset");
    if (resetHeader) {
      rateLimitReset = Number(resetHeader);
    }
  } catch {
    // headers.get not available in all environments — ignore
  }

  // Try to get error message + rateLimitReset from response body (JSON preferred, text fallback)
  let bodyMessage = null;
  try {
    const json = await response.json();
    bodyMessage = json?.message || json?.error || null;
    // Body may include rateLimitReset (Unix ts) when header isn't accessible
    if (!rateLimitReset && json?.rateLimitReset) {
      rateLimitReset = Number(json.rateLimitReset);
    }
  } catch {
    try {
      const text = await response.text();
      // Only use text body if it's NOT HTML (HTML means gateway/proxy error)
      if (text && !text.trim().startsWith("<")) {
        bodyMessage = text.trim().substring(0, 200);
      }
    } catch {
      // ignore
    }
  }

  // Prefer body message if it's user-friendly, otherwise use our status map
  const humanMessage =
    bodyMessage && bodyMessage.length > 5 && !bodyMessage.includes("<html")
      ? bodyMessage
      : HTTP_STATUS_MESSAGES[status] || `Request failed (${status}). Please try again.`;

  const err = new Error(humanMessage);
  err.status = status;
  err.retryable = retryable;
  if (rateLimitReset !== undefined) {
    err.rateLimitReset = rateLimitReset;
  }

  throw err;
}

// ── fetchWithRetry ───────────────────────────────────────────────────────────

/**
 * Fetch with exponential backoff retry for transient failures.
 *
 * @param {string} url
 * @param {RequestInit} options - Standard fetch options
 * @param {object} config
 * @param {number} config.maxRetries - Max number of additional attempts (default: 2)
 * @param {number[]} config.retryableStatuses - HTTP status codes to retry (default: [429,502,503,504])
 * @param {Function} config.fetchFn - Override fetch (for testing)
 * @param {number} config.baseDelayMs - Base delay for exponential backoff in ms (default: 1000)
 * @param {number} config.timeoutMs - Per-request timeout in ms (default: 30000)
 * @param {Function} config.onRetry - Called before each retry: (attempt, err) => void
 * @param {Function} config.onRateLimitInfo - Called with { remaining, reset } on each success
 * @returns {Promise<any>} Parsed JSON response
 */
export async function fetchWithRetry(url, options = {}, config = {}) {
  const {
    maxRetries = 2,
    retryableStatuses = [429, 502, 503, 504],
    fetchFn = globalThis.fetch,
    baseDelayMs = 1000,
    timeoutMs = 30000,
    onRetry,
    onRateLimitInfo,
  } = config;

  const retryableSet = new Set(retryableStatuses);
  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    // Per-attempt timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetchFn(url, {
        ...options,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      // parseSafeResponse handles ok/error branching and calls onRateLimitInfo hook
      return await parseSafeResponse(response, { onRateLimitInfo });
    } catch (err) {
      clearTimeout(timeoutId);

      // AbortError = timeout
      if (err.name === "AbortError") {
        lastError = Object.assign(
          new Error("Request timed out — the server is taking too long. Please try again."),
          { status: 0, retryable: true },
        );
      } else if (!err.status && err.message?.includes("Failed to fetch")) {
        // Network-level failure (offline, DNS)
        lastError = Object.assign(
          new Error("Network error — please check your connection and try again."),
          { status: 0, retryable: true },
        );
      } else {
        lastError = err;
      }

      // Don't retry if not retryable or we've exhausted attempts
      const isRetryable = lastError.retryable || retryableSet.has(lastError.status);
      if (!isRetryable || attempt >= maxRetries) {
        throw lastError;
      }

      // Exponential backoff: 1s, 3s, 7s…
      const delay = baseDelayMs * (2 ** attempt);

      if (onRetry) {
        onRetry(attempt + 1, lastError);
      }

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}
