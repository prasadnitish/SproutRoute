/**
 * SproutRoute mobile API client
 * Ported from strollerscout/src/frontend/src/services/api.js
 *
 * Key differences from web:
 * - fetch is globally available in React Native (no polyfill needed)
 * - Base URL points directly to Railway production (no VITE env var)
 * - Same fetchWithRetry + parseSafeResponse pattern for reliability
 */

import type {
  TripRequest,
  ResolveDestinationResponse,
  TripPlan,
  Weather,
  TripData,
  PackingList,
  SafetyGuidance,
  Child,
} from "../types/trip";

// Railway production URL — always HTTPS in mobile (no localhost fallback needed)
const API_BASE_URL = "https://sproutroute-production.up.railway.app";

// ── Human-readable HTTP status messages ──────────────────────────────────────

export const HTTP_STATUS_MESSAGES: Record<number, string> = {
  400: "The request was invalid. Please check your inputs.",
  422: "Your destination could not be processed. Please try a different location.",
  429: "Too many requests — please wait a moment before trying again.",
  500: "Server error. Please try again shortly.",
  502: "Server temporarily unavailable. Please try again in a few seconds.",
  503: "Service temporarily unavailable. Please try again in a few seconds.",
  504: "Server timed out. Please try again.",
};

const RETRYABLE_STATUSES = new Set([429, 502, 503, 504]);

// ── parseSafeResponse ─────────────────────────────────────────────────────────

interface RateLimitInfo {
  remaining: number;
  reset: number | null;
}

interface ParseHooks {
  onRateLimitInfo?: (info: RateLimitInfo) => void;
}

interface ApiError extends Error {
  status: number;
  retryable: boolean;
  rateLimitReset?: number;
}

async function parseSafeResponse(
  response: Response,
  hooks: ParseHooks = {},
): Promise<unknown> {
  const { onRateLimitInfo } = hooks;

  if (response.ok) {
    // Read rate-limit headers from successful responses (for low-remaining warning)
    if (onRateLimitInfo) {
      try {
        const remaining = response.headers.get("RateLimit-Remaining");
        const reset = response.headers.get("RateLimit-Reset");
        if (remaining !== null) {
          onRateLimitInfo({
            remaining: Number(remaining),
            reset: reset ? Number(reset) : null,
          });
        }
      } catch {
        /* ignore */
      }
    }

    try {
      return await response.json();
    } catch {
      const err = new Error(
        "Server returned unexpected non-JSON response.",
      ) as ApiError;
      err.status = response.status;
      err.retryable = false;
      throw err;
    }
  }

  const status = response.status;
  const retryable = RETRYABLE_STATUSES.has(status);

  let rateLimitReset: number | undefined;
  try {
    const resetHeader = response.headers.get("RateLimit-Reset");
    if (resetHeader) rateLimitReset = Number(resetHeader);
  } catch {
    /* ignore */
  }

  let bodyMessage: string | null = null;
  try {
    const json = (await response.json()) as Record<string, string>;
    bodyMessage = json?.message || json?.error || null;
    if (!rateLimitReset && json?.rateLimitReset) {
      rateLimitReset = Number(json.rateLimitReset);
    }
  } catch {
    try {
      const text = await response.text();
      if (text && !text.trim().startsWith("<")) {
        bodyMessage = text.trim().substring(0, 200);
      }
    } catch {
      /* ignore */
    }
  }

  const humanMessage =
    bodyMessage && bodyMessage.length > 5 && !bodyMessage.includes("<html")
      ? bodyMessage
      : HTTP_STATUS_MESSAGES[status] ||
        `Request failed (${status}). Please try again.`;

  const err = new Error(humanMessage) as ApiError;
  err.status = status;
  err.retryable = retryable;
  if (rateLimitReset !== undefined) err.rateLimitReset = rateLimitReset;
  throw err;
}

// ── fetchWithRetry ────────────────────────────────────────────────────────────

interface FetchConfig {
  maxRetries?: number;
  retryableStatuses?: number[];
  baseDelayMs?: number;
  timeoutMs?: number;
  onRetry?: (attempt: number, err: Error) => void;
  onRateLimitInfo?: (info: RateLimitInfo) => void;
}

async function fetchWithRetry(
  url: string,
  options: RequestInit = {},
  config: FetchConfig = {},
): Promise<unknown> {
  const {
    maxRetries = 2,
    retryableStatuses = [429, 502, 503, 504],
    baseDelayMs = 1000,
    timeoutMs = 30000,
    onRetry,
    onRateLimitInfo,
  } = config;

  const retryableSet = new Set(retryableStatuses);
  let lastError: ApiError | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      return await parseSafeResponse(response, { onRateLimitInfo });
    } catch (rawErr) {
      clearTimeout(timeoutId);
      const err = rawErr as ApiError;

      if (err.name === "AbortError") {
        lastError = Object.assign(
          new Error("Request timed out — please try again."),
          { status: 0, retryable: true },
        ) as ApiError;
      } else if (
        !err.status &&
        err.message?.includes("Network request failed")
      ) {
        lastError = Object.assign(
          new Error("Network error — please check your connection."),
          { status: 0, retryable: true },
        ) as ApiError;
      } else {
        lastError = err;
      }

      const isRetryable =
        lastError.retryable || retryableSet.has(lastError.status);
      if (!isRetryable || attempt >= maxRetries) throw lastError;

      const delay = baseDelayMs * 2 ** attempt;
      if (onRetry) onRetry(attempt + 1, lastError);
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  throw lastError;
}

// ── Request helpers ───────────────────────────────────────────────────────────

const POST_OPTS = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

// ── Public API functions ──────────────────────────────────────────────────────

export interface TripPlanResponse {
  trip: TripData;
  weather: Weather;
  tripPlan: TripPlan;
}

export interface PackingListResponse {
  trip: TripData;
  weather: Weather;
  packingList: PackingList;
}

interface ApiOptions {
  onRetry?: (attempt: number, err: Error) => void;
  onRateLimitInfo?: (info: RateLimitInfo) => void;
}

/** Resolve a free-text destination query into a concrete city or suggestions. */
export const resolveDestination = async (
  query: string,
  opts: ApiOptions = {},
): Promise<ResolveDestinationResponse> =>
  fetchWithRetry(
    `${API_BASE_URL}/api/resolve-destination`,
    POST_OPTS({ query }),
    { maxRetries: 1, timeoutMs: 20000, ...opts },
  ) as Promise<ResolveDestinationResponse>;

/** Generate the trip itinerary + weather. */
export const generateTripPlan = async (
  tripData: TripRequest,
  opts: ApiOptions = {},
): Promise<TripPlanResponse> =>
  fetchWithRetry(`${API_BASE_URL}/api/trip-plan`, POST_OPTS(tripData), {
    maxRetries: 2,
    timeoutMs: 45000,
    ...opts,
  }) as Promise<TripPlanResponse>;

/** Generate the packing list (requires selected activities). */
export const generatePackingList = async (
  tripData: TripRequest & { approvedActivities?: unknown[] },
  opts: ApiOptions = {},
): Promise<PackingListResponse> =>
  fetchWithRetry(`${API_BASE_URL}/api/generate`, POST_OPTS(tripData), {
    maxRetries: 2,
    timeoutMs: 45000,
    ...opts,
  }) as Promise<PackingListResponse>;

/** Get car seat guidance for a jurisdiction. */
export const getCarSeatGuidance = async (
  payload: {
    destination: string;
    jurisdictionCode?: string;
    tripDate?: string;
    children: Child[];
  },
  opts: ApiOptions = {},
): Promise<SafetyGuidance> =>
  fetchWithRetry(
    `${API_BASE_URL}/api/safety/car-seat-check`,
    POST_OPTS(payload),
    { maxRetries: 1, timeoutMs: 20000, ...opts },
  ) as Promise<SafetyGuidance>;

/** Health check — used for connectivity test on app launch. */
export const checkHealth = async (): Promise<{ status: string }> =>
  fetchWithRetry(
    `${API_BASE_URL}/api/health`,
    {},
    { maxRetries: 0, timeoutMs: 5000 },
  ) as Promise<{ status: string }>;
