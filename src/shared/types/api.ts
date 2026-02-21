/**
 * SproutRoute — Shared API Contract Types
 * Phase 1: API versioning foundation
 *
 * Consumed by:
 *   - src/frontend/  (web)
 *   - src/backend/   (server — runtime validation via Zod in Phase 1+)
 *   - sproutroute-mobile/ (Expo app — Phase 3)
 *
 * These types are the source of truth for all API request/response shapes.
 * Update here first, then update implementations.
 */

// ── Standard Error Envelope ──────────────────────────────────────────────────

/** Error category tags for client-side handling decisions */
export type ErrorCategory =
  | "validation"
  | "geocoding"
  | "weather"
  | "ai"
  | "safety"
  | "rate_limit"
  | "server";

/**
 * Standard error envelope — all /api/v1 error responses use this shape.
 * @example
 * { code: "WEATHER_UNAVAILABLE", message: "...", category: "weather",
 *   retryable: true, requestId: "uuid-v4" }
 */
export interface ApiError {
  /** Machine-readable SCREAMING_SNAKE_CASE code */
  code: string;
  /** Human-readable message — safe to show to users */
  message: string;
  /** Error category for client routing logic */
  category: ErrorCategory;
  /** Whether the client should retry this request */
  retryable: boolean;
  /** UUID v4 for request correlation and support */
  requestId: string;
  /** Optional debug details — never shown to end users */
  details?: Record<string, unknown>;
}

// ── Client / Schema Versioning ───────────────────────────────────────────────

/** Client platform identifier sent in all v1 requests */
export type ClientPlatform = "web" | "ios" | "android";

/** Unit system for temperature, distance, weight */
export type UnitSystem = "imperial" | "metric";

/** Common fields present on all v1 requests */
export interface V1RequestBase {
  /** Platform making the request */
  client?: ClientPlatform;
  /** Schema version for forward compatibility */
  schemaVersion?: string;
  /** ISO 3166-1 alpha-2 country code of the destination */
  countryCode?: string;
  /** User's preferred unit system */
  unitSystem?: UnitSystem;
  /** IANA timezone string */
  timezone?: string;
  /** BCP 47 locale string */
  locale?: string;
}

// ── Capabilities Endpoint ────────────────────────────────────────────────────

/** Weather provider identifiers */
export type WeatherProvider = "weathergov" | "openweathermap" | "weatherkit";

/** Safety guidance mode */
export type GuidanceMode = "us_state_law" | "country_general";

/** iOS 26 native feature flags */
export interface Ios26Features {
  liquidGlass: boolean;
  weatherKitFastPath: boolean;
  foundationModelRecap: boolean;
  appIntents: boolean;
}

/** Feature flags for progressive rollout */
export interface FeatureFlags {
  shareLinks: boolean;
  customItems: boolean;
  darkMode: boolean;
  pwa: boolean;
  /** iOS-specific native features — only present when client=ios */
  ios26Features?: Ios26Features;
}

/** Response shape for GET /api/v1/meta/capabilities */
export interface CapabilityPayload {
  requestId: string;
  schemaVersion: string;
  /** ISO 3166-1 alpha-2 codes of supported destination countries */
  supportedCountries: string[];
  /** Maps country code → weather provider key */
  weatherProviders: Record<string, WeatherProvider>;
  /** Maps country code → safety guidance mode */
  safetyModes: Record<string, GuidanceMode>;
  featureFlags: FeatureFlags;
  /** Only present when client=ios */
  ios26Features?: Ios26Features;
}
