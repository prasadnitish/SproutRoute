// Backend entry point: Express server that orchestrates location, weather, and AI calls.
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import rateLimit from "express-rate-limit";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";
import {
  geocodeLocation,
  resolveDestinationQuery,
} from "./services/geocoding.js";
import { getWeatherForecast } from "./services/weather.js";
import { generatePackingList } from "./services/packingListAI.js";
import { generateTripPlan } from "./services/tripPlanAI.js";
import { getCarSeatGuidance } from "./services/safetyRules.js";
import { getTravelAdvisory } from "./services/travelAdvisory.js";
import { getNeighborhoodSafety } from "./services/neighborhoodSafety.js";
import { resolveAiDestination } from "./services/aiDestinationResolver.js";
import {
  sanitizeString,
  sanitizeChildren,
  sanitizeTripData,
  validateTripData,
} from "./utils/sanitize.js";
import { log } from "./utils/logger.js";

dotenv.config();

// Validate required environment variables at startup
function validateEnvironmentVariables() {
  if (!process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY === "your_api_key_here") {
    console.error("FATAL: ANTHROPIC_API_KEY must be set and valid in environment variables");
    console.error("Please set ANTHROPIC_API_KEY in your .env file or environment.");
    process.exit(1);
  }
}

function buildAllowedOrigins() {
  // In production (Option A), frontend is same-origin so CORS isn't triggered.
  // ALLOWED_ORIGINS can optionally allow external callers; defaults to empty (same-origin only).
  return process.env.NODE_ENV === "production"
    ? (process.env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean)
    : [
        "http://localhost:5173",
        "http://localhost:3000",
        "http://127.0.0.1:5173",
      ];
}

export function createApp(deps = {}) {
  // App factory enables dependency injection for fast, isolated integration tests.
  const {
    geocodeLocationFn = geocodeLocation,
    resolveDestinationQueryFn = resolveDestinationQuery,
    resolveAiDestinationFn = resolveAiDestination,
    getWeatherForecastFn = getWeatherForecast,
    generatePackingListFn = generatePackingList,
    generateTripPlanFn = generateTripPlan,
    getCarSeatGuidanceFn = getCarSeatGuidance,
    getTravelAdvisoryFn = getTravelAdvisory,
    getNeighborhoodSafetyFn = getNeighborhoodSafety,
    enableRequestLogging = process.env.NODE_ENV !== "test",
  } = deps;

  const app = express();

  // Railway sits behind a reverse proxy — trust first hop so express-rate-limit
  // reads the real client IP from X-Forwarded-For instead of throwing ERR_ERL_UNEXPECTED_X_FORWARDED_FOR.
  app.set("trust proxy", 1);

  // devLog kept for non-critical debug output; log.* used for production-visible logging
  const devLog = (...args) => {
    if (process.env.NODE_ENV !== "production" && enableRequestLogging) {
      console.log(...args);
    }
  };

  const allowedOrigins = buildAllowedOrigins();

  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin) {
          return callback(null, true);
        }

        if (allowedOrigins.includes(origin)) {
          callback(null, true);
        } else {
          callback(new Error("Not allowed by CORS"));
        }
      },
      credentials: true,
    }),
  );

  // Enforce reasonable request body size limits to prevent memory exhaustion attacks
  app.use(express.json({ limit: "10kb" }));
  app.use(express.urlencoded({ limit: "10kb", extended: false }));

  app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("X-XSS-Protection", "1; mode=block");
    if (process.env.NODE_ENV === "production") {
      res.setHeader(
        "Strict-Transport-Security",
        "max-age=31536000; includeSubDomains",
      );
    }
    next();
  });

  if (enableRequestLogging) {
    app.use((req, res, next) => {
      const start = Date.now();
      res.on("finish", () => {
        const duration = Date.now() - start;
        // Log all API requests (skip static file serving)
        if (req.path.startsWith("/api")) {
          log.info(`${req.method} ${req.path} ${res.statusCode}`, {
            duration: `${duration}ms`,
            ip: req.ip,
          });
        }
      });
      next();
    });
  }

  const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 30,  // Increased from 10 to 30: ~5 complete trip plans per window (resolve + plan + generate + car-seat = 4 calls/trip)
    message: {
      error: "Too many requests from this IP, please try again in 15 minutes.",
    },
    standardHeaders: true,  // Sends RateLimit-Limit, RateLimit-Remaining, RateLimit-Reset, RateLimit-Policy
    legacyHeaders: false,
    handler: (req, res) => {
      log.warn("Rate limit hit", { ip: req.ip, path: req.path });
      const resetAt = Math.ceil(Date.now() / 1000) + 15 * 60;
      res.status(429).json({
        error: "Too many requests. Please try again in 15 minutes.",
        retryAfter: "15 minutes",
        rateLimitReset: resetAt,
      });
    },
  });

  app.get("/api/health", (req, res) => {
    // Fast liveness probe for local dev and hosting health checks.
    res.json({
      status: "ok",
      message: "SproutRoute API is running",
      timestamp: new Date().toISOString(),
    });
  });

  // POST /api/v1/destination/ai-resolve
  // AI-powered natural-language destination resolver used by the mobile app.
  // Returns mode:"direct" for specific places or mode:"suggestions" (up to 3) for vague queries.
  app.post("/api/v1/destination/ai-resolve", apiLimiter, async (req, res) => {
    const requestId = crypto.randomUUID();
    try {
      const rawQuery = (req.body?.query || "").trim();
      if (!rawQuery) {
        return v1Error(res, 400, {
          code: "VALIDATION_ERROR",
          message: "query is required",
          category: "validation",
          retryable: false,
          requestId,
        });
      }
      if (rawQuery.length > 300) {
        return v1Error(res, 400, {
          code: "VALIDATION_ERROR",
          message: "query must be 300 characters or fewer",
          category: "validation",
          retryable: false,
          requestId,
        });
      }

      devLog("v1/destination/ai-resolve:", rawQuery);
      const result = await resolveAiDestinationFn(rawQuery);
      return res.json({ requestId, ...result });
    } catch (error) {
      log.error("ai-resolve failed", { requestId, error: error.message });
      return v1Error(res, 500, {
        code: "RESOLVE_FAILED",
        message: "Could not resolve destination. Please try a more specific location.",
        category: "geocoding",
        retryable: true,
        requestId,
      });
    }
  });

  app.post("/api/resolve-destination", apiLimiter, async (req, res) => {
    // Resolves free-text destination intent before trip planning starts.
    try {
      const rawQuery = sanitizeString(req.body?.query || "", 120);
      if (!rawQuery) {
        return res.status(400).json({ error: "Destination query is required" });
      }

      const result = await resolveDestinationQueryFn(rawQuery);
      return res.json(result);
    } catch (error) {
      log.error("resolve-destination failed", { error: error.message });
      return res.status(500).json({
        error: "Failed to resolve destination. Please try again.",
      });
    }
  });

  app.post("/api/trip-plan", apiLimiter, async (req, res) => {
    // Generates itinerary + weather context; activities are optional at this stage.
    try {
      const sanitizedData = sanitizeTripData(req.body);

      const validationErrors = validateTripData(sanitizedData, {
        requireActivities: false,
      });
      if (validationErrors.length > 0) {
        return res.status(400).json({
          error: validationErrors.join(", "),
        });
      }

      const { destination, startDate, endDate, activities, children } =
        sanitizedData;
      const safeActivities =
        Array.isArray(activities) && activities.length > 0
          ? activities
          : ["family-friendly", "parks", "city"];

      // Note: API key validation is performed at startup via validateEnvironmentVariables()
      // This graceful check is for extra safety but should never be reached in production

      devLog(`Generating trip plan...`);

      const coords = await geocodeLocationFn(destination);
      devLog(`Geocoded to: ${coords.lat}, ${coords.lon} (${coords.countryCode || "US"})`);

      const weather = await getWeatherForecastFn(coords.lat, coords.lon, coords.countryCode || "US", startDate, endDate);
      devLog(`Weather fetched successfully`);

      const tripPlan = await generateTripPlanFn(
        {
          destination,
          startDate,
          endDate,
          activities: safeActivities,
          children,
        },
        weather,
      );
      devLog(
        `Trip plan generated successfully`,
      );

      const tripDuration = Math.ceil(
        (new Date(endDate) - new Date(startDate)) / (1000 * 60 * 60 * 24),
      );

      res.json({
        trip: {
          destination: coords.displayName || destination,
          jurisdictionCode: coords.stateCode || null,
          jurisdictionName: coords.stateName || null,
          countryCode: coords.countryCode || null,
          regionCode: coords.regionCode || null,
          startDate,
          endDate,
          duration: tripDuration,
          activities: safeActivities,
          children,
        },
        weather,
        tripPlan,
      });
    } catch (error) {
      log.error("trip-plan failed", { error: error.message });

      if (
        error.message.includes("Location not found") ||
        error.message.includes("geocode")
      ) {
        return res.status(422).json({
          error:
            "Could not find that location. Please try a different city or address.",
        });
      }

      if (error.message.includes("Weather service") || error.message.includes("weather")) {
        return res.status(422).json({
          error:
            "Weather data unavailable for this location. The trip plan will still work, but weather info may be limited.",
        });
      }

      if (error.message.includes("API key")) {
        return res.status(500).json({
          error: "API configuration error. Please contact support.",
        });
      }

      res.status(500).json({
        error: "Failed to generate trip plan. Please try again.",
      });
    }
  });

  app.post("/api/generate", apiLimiter, async (req, res) => {
    // Generates packing list; requires selected activities for concrete output.
    try {
      const sanitizedData = sanitizeTripData(req.body);

      const validationErrors = validateTripData(sanitizedData, {
        requireActivities: true,
      });
      if (validationErrors.length > 0) {
        return res.status(400).json({
          error: validationErrors.join(", "),
        });
      }

      const { destination, startDate, endDate, activities, children } =
        sanitizedData;

      // Note: API key validation is performed at startup via validateEnvironmentVariables()
      // This graceful check is for extra safety but should never be reached in production

      devLog(`Generating packing list...`);

      const coords = await geocodeLocationFn(destination);
      devLog(`Geocoded coordinates obtained`);

      const weather = await getWeatherForecastFn(coords.lat, coords.lon, coords.countryCode || "US", startDate, endDate);
      devLog(`Weather fetched successfully`);

      const packingList = await generatePackingListFn(
        { destination, startDate, endDate, activities, children },
        weather,
      );
      devLog(
        `Packing list generated successfully`,
      );

      const tripDuration = Math.ceil(
        (new Date(endDate) - new Date(startDate)) / (1000 * 60 * 60 * 24),
      );

      res.json({
        trip: {
          destination: coords.displayName || destination,
          jurisdictionCode: coords.stateCode || null,
          jurisdictionName: coords.stateName || null,
          countryCode: coords.countryCode || null,
          regionCode: coords.regionCode || null,
          startDate,
          endDate,
          duration: tripDuration,
          activities,
          children,
        },
        weather,
        packingList,
      });
    } catch (error) {
      log.error("generate failed", { error: error.message });

      if (
        error.message.includes("Location not found") ||
        error.message.includes("geocode")
      ) {
        return res.status(422).json({
          error:
            "Could not find that location. Please try a different city or address.",
        });
      }

      if (error.message.includes("Weather service") || error.message.includes("weather")) {
        return res.status(422).json({
          error:
            "Weather data unavailable for this location. The packing list will still work, but weather items may be limited.",
        });
      }

      if (error.message.includes("API key")) {
        return res.status(500).json({
          error: "API configuration error. Please contact support.",
        });
      }

      res.status(500).json({
        error: "Failed to generate packing list. Please try again.",
      });
    }
  });

  app.post("/api/safety/car-seat-check", apiLimiter, async (req, res) => {
    // Evaluates child passenger restraint guidance for the resolved jurisdiction.
    try {
      const destination = sanitizeString(req.body?.destination || "", 120);
      const jurisdictionCode = sanitizeString(
        req.body?.jurisdictionCode || "",
        2,
      ).toUpperCase();
      const tripDate = sanitizeString(req.body?.tripDate || "", 20);
      const children = sanitizeChildren(req.body?.children, 10);
      // countryCode used to route non-US destinations to international guidance
      const VALID_COUNTRY_RE = /^[A-Za-z]{2}$/;
      const rawCountryCode = req.body?.countryCode;
      const countryCode = VALID_COUNTRY_RE.test(rawCountryCode || "")
        ? rawCountryCode.toUpperCase()
        : null;

      if (children.length === 0) {
        return res.status(400).json({
          error:
            "At least one child profile is required for car seat guidance.",
        });
      }

      const guidance = await Promise.resolve(
        getCarSeatGuidanceFn({
          destination,
          jurisdictionCode,
          tripDate,
          children,
          countryCode,
        }),
      );

      return res.json(guidance);
    } catch (error) {
      log.error("car-seat-check failed", { error: error.message });
      return res.status(500).json({
        error: "Failed to evaluate car seat guidance. Please try again.",
      });
    }
  });

  // ── /api/v1 Versioned Endpoints ─────────────────────────────────────────
  // All v1 routes use a standard error envelope and include requestId in every response.
  // Standard error envelope: { code, message, category, retryable, requestId, details? }
  // Legacy routes (/api/*) are preserved as aliases for one release cycle.

  // Helper: build a standard v1 error response
  function v1Error(res, statusCode, { code, message, category, retryable, requestId, details }) {
    return res.status(statusCode).json({
      code,
      message,
      category,
      retryable,
      requestId,
      ...(details ? { details } : {}),
    });
  }

  // GET /api/v1/meta/capabilities
  // Returns feature flags, supported countries, weather providers, safety modes.
  app.get("/api/v1/meta/capabilities", (req, res) => {
    const requestId = crypto.randomUUID();
    const client = req.query?.client || req.body?.client || "web";

    const payload = {
      requestId,
      schemaVersion: "1",
      supportedCountries: ["US", "CA", "GB", "AU"],
      weatherProviders: {
        US: "weathergov",
        other: "openweathermap",
      },
      safetyModes: {
        US: "us_state_law",
        CA: "country_general",
        GB: "country_general",
        AU: "country_general",
        EU: "eu_baseline",
      },
      safetyServices: {
        travelAdvisory: true,
        neighborhoodSafety: !!process.env.AMADEUS_API_KEY,
      },
      featureFlags: {
        shareLinks: false,
        customItems: false,
        darkMode: false,
        pwa: false,
        internationalSupport: true,
      },
    };

    // iOS-specific feature flags (Phase 3b)
    if (client === "ios") {
      payload.ios26Features = {
        liquidGlass: false,         // Phase 3b
        weatherKitFastPath: false,  // Phase 3b
        foundationModelRecap: false, // Phase 3b
        appIntents: false,          // Phase 3b
      };
    }

    res.json(payload);
  });

  // POST /api/v1/trip/resolve
  app.post("/api/v1/trip/resolve", apiLimiter, async (req, res) => {
    const requestId = crypto.randomUUID();
    try {
      const rawQuery = sanitizeString(req.body?.query || "", 120);
      if (!rawQuery) {
        return v1Error(res, 400, {
          code: "MISSING_QUERY",
          message: "Destination query is required.",
          category: "validation",
          retryable: false,
          requestId,
        });
      }

      const result = await resolveDestinationQueryFn(rawQuery);
      return res.json({ ...result, requestId });
    } catch (error) {
      log.error("v1/trip/resolve failed", { requestId, error: error.message });
      return v1Error(res, 500, {
        code: "RESOLVE_FAILED",
        message: "Failed to resolve destination. Please try again.",
        category: "server",
        retryable: true,
        requestId,
      });
    }
  });

  // POST /api/v1/trip/plan
  app.post("/api/v1/trip/plan", apiLimiter, async (req, res) => {
    const requestId = crypto.randomUUID();
    try {
      const sanitizedData = sanitizeTripData(req.body);
      const validationErrors = validateTripData(sanitizedData, { requireActivities: false });
      if (validationErrors.length > 0) {
        return v1Error(res, 400, {
          code: "VALIDATION_ERROR",
          message: validationErrors.join("; "),
          category: "validation",
          retryable: false,
          requestId,
        });
      }

      const { destination, startDate, endDate, activities, children } = sanitizedData;
      const safeActivities =
        Array.isArray(activities) && activities.length > 0
          ? activities
          : ["family-friendly", "parks", "city"];

      devLog("v1/trip/plan: geocoding...");
      const coords = await geocodeLocationFn(destination);
      const resolvedCountry = coords.countryCode || "US";
      const weather = await getWeatherForecastFn(coords.lat, coords.lon, resolvedCountry, startDate, endDate);
      const tripPlan = await generateTripPlanFn(
        { destination, startDate, endDate, activities: safeActivities, children },
        weather,
      );

      const tripDuration = Math.ceil(
        (new Date(endDate) - new Date(startDate)) / (1000 * 60 * 60 * 24),
      );

      return res.json({
        requestId,
        trip: {
          destination: coords.displayName || destination,
          jurisdictionCode: coords.stateCode || null,
          jurisdictionName: coords.stateName || null,
          startDate,
          endDate,
          duration: tripDuration,
          activities: safeActivities,
          children,
          // v1 extended fields
          countryCode: resolvedCountry,
          regionCode: coords.regionCode || null,
          unitSystem: req.body?.unitSystem || "imperial",
          client: req.body?.client || "web",
          schemaVersion: req.body?.schemaVersion || "1",
        },
        weather,
        tripPlan,
      });
    } catch (error) {
      log.error("v1/trip/plan failed", { requestId, error: error.message });
      if (error.message?.includes("Location not found") || error.message?.includes("geocode")) {
        return v1Error(res, 422, {
          code: "LOCATION_NOT_FOUND",
          message: "Could not find that location. Please try a more specific address.",
          category: "geocoding",
          retryable: false,
          requestId,
        });
      }
      if (error.message?.includes("Weather service")) {
        return v1Error(res, 422, {
          code: "WEATHER_UNAVAILABLE",
          message: "Weather data is temporarily unavailable. Please try again in a moment.",
          category: "weather",
          retryable: true,
          requestId,
        });
      }
      return v1Error(res, 500, {
        code: "PLAN_FAILED",
        message: "Failed to generate trip plan. Please try again.",
        category: "server",
        retryable: true,
        requestId,
      });
    }
  });

  // POST /api/v1/trip/bundle
  // Single endpoint: geocode once → weather once → trip plan + packing list in parallel.
  // Eliminates redundant geocoding + weather round-trip, runs AI calls concurrently.
  app.post("/api/v1/trip/bundle", apiLimiter, async (req, res) => {
    const requestId = crypto.randomUUID();
    const timings = {};
    try {
      const sanitizedData = sanitizeTripData(req.body);
      const validationErrors = validateTripData(sanitizedData, { requireActivities: false });
      if (validationErrors.length > 0) {
        return v1Error(res, 400, {
          code: "VALIDATION_ERROR",
          message: validationErrors.join("; "),
          category: "validation",
          retryable: false,
          requestId,
        });
      }

      const { destination, startDate, endDate, activities, children } = sanitizedData;
      const safeActivities =
        Array.isArray(activities) && activities.length > 0
          ? activities
          : ["family-friendly", "parks", "city"];

      // Extract tripType — not part of sanitizeTripData since it's not user-text; validate against allowlist
      const VALID_TRIP_TYPES = new Set(["beach", "city", "adventure", "cruise", "international"]);
      const rawTripType = req.body?.tripType;
      const tripType = VALID_TRIP_TYPES.has(rawTripType) ? rawTripType : null;

      const rlog = log.withRequestId(requestId);

      // Phase 1: Geocode
      const geocodeStart = Date.now();
      rlog.info("bundle: geocoding", { destination });
      const coords = await geocodeLocationFn(destination);
      const resolvedCountry = coords.countryCode || "US";
      timings.geocode = Date.now() - geocodeStart;
      rlog.info("bundle: geocoded", { lat: coords.lat, lon: coords.lon, country: resolvedCountry, ms: timings.geocode });

      // Phase 2: Weather
      const weatherStart = Date.now();
      const weather = await getWeatherForecastFn(coords.lat, coords.lon, resolvedCountry, startDate, endDate);
      timings.weather = Date.now() - weatherStart;
      rlog.info("bundle: weather fetched", { ms: timings.weather });

      // Phase 3: Trip plan + Packing list in parallel
      const aiStart = Date.now();
      rlog.info("bundle: AI starting (trip + packing)");
      const tripPayload = { destination, startDate, endDate, activities: safeActivities, children, tripType, countryCode: resolvedCountry };
      const [tripPlan, packingList] = await Promise.all([
        generateTripPlanFn(tripPayload, weather),
        generatePackingListFn(tripPayload, weather),
      ]);
      timings.ai = Date.now() - aiStart;
      timings.total = Date.now() - geocodeStart;

      rlog.info("bundle: complete", { geocode: `${timings.geocode}ms`, weather: `${timings.weather}ms`, ai: `${timings.ai}ms`, total: `${timings.total}ms` });

      const tripDuration = Math.ceil(
        (new Date(endDate) - new Date(startDate)) / (1000 * 60 * 60 * 24),
      );

      return res.json({
        requestId,
        trip: {
          destination: coords.displayName || destination,
          jurisdictionCode: coords.stateCode || null,
          jurisdictionName: coords.stateName || null,
          startDate,
          endDate,
          duration: tripDuration,
          activities: safeActivities,
          children,
          countryCode: resolvedCountry,
          regionCode: coords.regionCode || null,
          lat: coords.lat,
          lon: coords.lon,
          unitSystem: req.body?.unitSystem || "imperial",
          client: req.body?.client || "mobile",
          schemaVersion: req.body?.schemaVersion || "1",
        },
        weather,
        tripPlan,
        packingList,
        timings,
      });
    } catch (error) {
      log.error("v1/trip/bundle failed", { requestId, error: error.message, timings });
      if (error.message?.includes("Location not found") || error.message?.includes("geocode")) {
        return v1Error(res, 422, {
          code: "LOCATION_NOT_FOUND",
          message: "Could not find that location. Please try a more specific address.",
          category: "geocoding",
          retryable: false,
          requestId,
        });
      }
      if (error.message?.includes("Weather service")) {
        return v1Error(res, 422, {
          code: "WEATHER_UNAVAILABLE",
          message: "Weather data is temporarily unavailable. Please try again in a moment.",
          category: "weather",
          retryable: true,
          requestId,
        });
      }
      return v1Error(res, 500, {
        code: "BUNDLE_FAILED",
        message: "Failed to generate trip plan. Please try again.",
        category: "server",
        retryable: true,
        requestId,
      });
    }
  });

  // POST /api/v1/trip/stream
  // Server-Sent Events (SSE) streaming endpoint for progressive trip plan generation.
  // Emits events: destination, weather, itinerary-chunk, packing, safety, done, error.
  // Falls back gracefully — clients can use the bundle endpoint if SSE is unsupported.
  app.post("/api/v1/trip/stream", apiLimiter, async (req, res) => {
    const requestId = crypto.randomUUID();

    // Validate input before opening SSE connection
    const sanitizedData = sanitizeTripData(req.body);
    const validationErrors = validateTripData(sanitizedData, { requireActivities: false });
    if (validationErrors.length > 0) {
      return res.status(400).json({
        code: "VALIDATION_ERROR",
        message: validationErrors.join("; "),
        requestId,
      });
    }

    // Open SSE stream
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "X-Request-Id": requestId,
    });

    // Helper: write a typed SSE event
    function emit(type, payload) {
      res.write(`event: ${type}\ndata: ${JSON.stringify(payload)}\n\n`);
    }

    // Helper: flush-safe write (some proxies buffer SSE)
    function flush() {
      if (typeof res.flush === "function") res.flush();
    }

    try {
      const { destination, startDate, endDate, activities, children } = sanitizedData;
      const VALID_TRIP_TYPES = new Set(["beach", "city", "adventure", "cruise", "international"]);
      const rawTripType = req.body?.tripType;
      const tripType = VALID_TRIP_TYPES.has(rawTripType) ? rawTripType : null;
      const safeActivities =
        Array.isArray(activities) && activities.length > 0
          ? activities
          : ["family-friendly", "parks", "city"];

      const rlog = log.withRequestId(requestId);
      const streamStart = Date.now();

      // Phase 1: Geocode
      rlog.info("stream: geocoding", { destination });
      const coords = await geocodeLocationFn(destination);
      const resolvedCountry = coords.countryCode || "US";
      rlog.info("stream: geocoded", { lat: coords.lat, lon: coords.lon, country: resolvedCountry, ms: Date.now() - streamStart });
      emit("destination", {
        destination: coords.displayName || destination,
        lat: coords.lat,
        lon: coords.lon,
        countryCode: resolvedCountry,
      });
      flush();

      // Phase 2: Weather
      const weatherStart = Date.now();
      const weather = await getWeatherForecastFn(coords.lat, coords.lon, resolvedCountry, startDate, endDate);
      rlog.info("stream: weather fetched", { ms: Date.now() - weatherStart });
      emit("weather", { weather });
      flush();

      // Phase 3: Trip plan + Packing list in parallel
      const aiStart = Date.now();
      rlog.info("stream: AI starting (trip + packing)");
      const tripPayload = {
        destination: coords.displayName || destination,
        startDate,
        endDate,
        activities: safeActivities,
        children,
        tripType,
        countryCode: resolvedCountry,
      };

      emit("itinerary-chunk", { status: "generating", message: "Crafting your itinerary…" });
      flush();

      const [tripPlan, packingList] = await Promise.all([
        generateTripPlanFn(tripPayload, weather),
        generatePackingListFn(tripPayload, weather),
      ]);
      rlog.info("stream: AI complete", { ms: Date.now() - aiStart });

      emit("itinerary-chunk", { status: "done", tripPlan });
      flush();

      emit("packing", { packingList });
      flush();

      const tripDuration = Math.ceil(
        (new Date(endDate) - new Date(startDate)) / (1000 * 60 * 60 * 24),
      );

      emit("done", {
        requestId,
        trip: {
          destination: coords.displayName || destination,
          jurisdictionCode: coords.stateCode || null,
          jurisdictionName: coords.stateName || null,
          startDate,
          endDate,
          duration: tripDuration,
          activities: safeActivities,
          children,
          countryCode: resolvedCountry,
          regionCode: coords.regionCode || null,
          lat: coords.lat,
          lon: coords.lon,
        },
        weather,
        tripPlan,
        packingList,
      });
      flush();

      rlog.info("stream: complete", { total: `${Date.now() - streamStart}ms` });
      res.end();
    } catch (error) {
      log.error("v1/trip/stream failed", { requestId, error: error.message });
      emit("error", {
        code: "STREAM_FAILED",
        message: error.message?.includes("Location not found")
          ? "Could not find that location. Please try a more specific address."
          : "Failed to generate trip plan. Please try again.",
        retryable: true,
        requestId,
      });
      flush();
      res.end();
    }
  });

  // POST /api/v1/trip/replan
  // Regenerates ONLY the trip itinerary (no geocoding or weather fetch).
  // Used when the user customizes activities after the initial plan is generated.
  // Requires: destination, startDate, endDate, activities, children, weather (cached).
  app.post("/api/v1/trip/replan", apiLimiter, async (req, res) => {
    const requestId = crypto.randomUUID();
    try {
      const sanitizedData = sanitizeTripData(req.body);
      const validationErrors = validateTripData(sanitizedData, { requireActivities: true });
      if (validationErrors.length > 0) {
        return v1Error(res, 400, {
          code: "VALIDATION_ERROR",
          message: validationErrors.join("; "),
          category: "validation",
          retryable: false,
          requestId,
        });
      }

      const { destination, startDate, endDate, activities, children } = sanitizedData;

      // weather must be provided by the client — we skip geocoding and weather fetch.
      const weather = req.body.weather;
      if (!weather || !Array.isArray(weather.forecast)) {
        return v1Error(res, 400, {
          code: "VALIDATION_ERROR",
          message: "weather object with forecast array is required for replan",
          category: "validation",
          retryable: false,
          requestId,
        });
      }

      devLog("v1/trip/replan: regenerating itinerary with activities:", activities);
      const tripPlan = await generateTripPlanFn(
        { destination, startDate, endDate, activities, children },
        weather,
      );

      return res.json({ requestId, tripPlan });
    } catch (error) {
      log.error("v1/trip/replan failed", { requestId, error: error.message });
      return v1Error(res, 500, {
        code: "REPLAN_FAILED",
        message: "Failed to regenerate trip plan. Please try again.",
        category: "server",
        retryable: true,
        requestId,
      });
    }
  });

  // POST /api/v1/trip/packing
  app.post("/api/v1/trip/packing", apiLimiter, async (req, res) => {
    const requestId = crypto.randomUUID();
    try {
      const sanitizedData = sanitizeTripData(req.body);
      const validationErrors = validateTripData(sanitizedData, { requireActivities: true });
      if (validationErrors.length > 0) {
        return v1Error(res, 400, {
          code: "VALIDATION_ERROR",
          message: validationErrors.join("; "),
          category: "validation",
          retryable: false,
          requestId,
        });
      }

      const { destination, startDate, endDate, activities, children } = sanitizedData;

      devLog("v1/trip/packing: geocoding...");
      const coords = await geocodeLocationFn(destination);
      const resolvedCountry = coords.countryCode || "US";
      const weather = await getWeatherForecastFn(coords.lat, coords.lon, resolvedCountry, startDate, endDate);
      const packingList = await generatePackingListFn(
        { destination, startDate, endDate, activities, children },
        weather,
      );

      const tripDuration = Math.ceil(
        (new Date(endDate) - new Date(startDate)) / (1000 * 60 * 60 * 24),
      );

      return res.json({
        requestId,
        trip: {
          destination: coords.displayName || destination,
          jurisdictionCode: coords.stateCode || null,
          jurisdictionName: coords.stateName || null,
          startDate,
          endDate,
          duration: tripDuration,
          activities,
          children,
          countryCode: resolvedCountry,
          regionCode: coords.regionCode || null,
          unitSystem: req.body?.unitSystem || "imperial",
          client: req.body?.client || "web",
          schemaVersion: req.body?.schemaVersion || "1",
        },
        weather,
        packingList,
      });
    } catch (error) {
      log.error("v1/trip/packing failed", { requestId, error: error.message });
      if (error.message?.includes("Location not found") || error.message?.includes("geocode")) {
        return v1Error(res, 422, {
          code: "LOCATION_NOT_FOUND",
          message: "Could not find that location. Please try a more specific address.",
          category: "geocoding",
          retryable: false,
          requestId,
        });
      }
      if (error.message?.includes("Weather service")) {
        return v1Error(res, 422, {
          code: "WEATHER_UNAVAILABLE",
          message: "Weather data is temporarily unavailable. Please try again in a moment.",
          category: "weather",
          retryable: true,
          requestId,
        });
      }
      return v1Error(res, 500, {
        code: "PACKING_FAILED",
        message: "Failed to generate packing list. Please try again.",
        category: "server",
        retryable: true,
        requestId,
      });
    }
  });

  // POST /api/v1/safety/car-seat-check
  app.post("/api/v1/safety/car-seat-check", apiLimiter, async (req, res) => {
    const requestId = crypto.randomUUID();
    try {
      const destination = sanitizeString(req.body?.destination || "", 120);
      const jurisdictionCode = sanitizeString(req.body?.jurisdictionCode || "", 2).toUpperCase();
      const tripDate = sanitizeString(req.body?.tripDate || "", 20);
      const countryCode = sanitizeString(req.body?.countryCode || "US", 2).toUpperCase();
      const children = sanitizeChildren(req.body?.children, 10);

      if (children.length === 0) {
        return v1Error(res, 400, {
          code: "MISSING_CHILDREN",
          message: "At least one child profile is required for car seat guidance.",
          category: "validation",
          retryable: false,
          requestId,
        });
      }

      const guidance = await Promise.resolve(
        getCarSeatGuidanceFn({ destination, jurisdictionCode, tripDate, children }),
      );

      // Ensure guidanceMode is always present in v1 responses
      const guidanceMode = guidance.guidanceMode ||
        (countryCode === "US" ? "us_state_law" : "country_general");

      return res.json({
        requestId,
        ...guidance,
        guidanceMode,
        // v1 required fields with defaults if not provided by service
        confidence: guidance.confidence || "medium",
        sourceAuthority: guidance.sourceAuthority || "Official state regulations",
        lastReviewed: guidance.lastReviewed || new Date().toISOString().split("T")[0],
      });
    } catch (error) {
      log.error("v1/safety/car-seat-check failed", { requestId, error: error.message });
      return v1Error(res, 500, {
        code: "SAFETY_CHECK_FAILED",
        message: "Failed to retrieve car seat guidance. Please try again.",
        category: "server",
        retryable: true,
        requestId,
      });
    }
  });

  // GET /api/v1/safety/travel-advisory/:countryCode
  // Returns US State Dept travel advisory for a country. Graceful: returns null if unavailable.
  app.get("/api/v1/safety/travel-advisory/:countryCode", async (req, res) => {
    const requestId = crypto.randomUUID();
    try {
      const countryCode = sanitizeString(req.params.countryCode || "", 3).toUpperCase();
      if (!countryCode || countryCode.length < 2) {
        return v1Error(res, 400, {
          code: "INVALID_COUNTRY_CODE",
          message: "A valid 2-letter country code is required.",
          category: "validation",
          retryable: false,
          requestId,
        });
      }

      const advisory = await getTravelAdvisoryFn(countryCode);
      return res.json({ requestId, advisory });
    } catch (error) {
      log.error("v1/safety/travel-advisory failed", { requestId, error: error.message });
      return v1Error(res, 500, {
        code: "ADVISORY_FAILED",
        message: "Failed to fetch travel advisory. Trip planning will continue without it.",
        category: "server",
        retryable: true,
        requestId,
      });
    }
  });

  // GET /api/v1/safety/neighborhood?lat=X&lon=Y
  // Returns Amadeus/GeoSure neighborhood safety scores. Graceful: returns null if unavailable.
  app.get("/api/v1/safety/neighborhood", async (req, res) => {
    const requestId = crypto.randomUUID();
    try {
      const lat = parseFloat(req.query?.lat);
      const lon = parseFloat(req.query?.lon);

      if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        return v1Error(res, 400, {
          code: "INVALID_COORDINATES",
          message: "Valid lat and lon query parameters are required.",
          category: "validation",
          retryable: false,
          requestId,
        });
      }

      const safety = await getNeighborhoodSafetyFn(lat, lon);
      return res.json({ requestId, safety });
    } catch (error) {
      log.error("v1/safety/neighborhood failed", { requestId, error: error.message });
      return v1Error(res, 500, {
        code: "SAFETY_FAILED",
        message: "Failed to fetch neighborhood safety data.",
        category: "server",
        retryable: true,
        requestId,
      });
    }
  });

  // ── Serve the built Vite frontend in production.
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const frontendDist = path.join(__dirname, "../frontend/dist");

  if (process.env.NODE_ENV === "production") {
    app.use(express.static(frontendDist));
    // SPA fallback: any non-API route returns index.html
    app.get("*", (req, res) => {
      res.sendFile(path.join(frontendDist, "index.html"));
    });
  } else {
    app.use((req, res) => {
      res.status(404).json({ error: "Endpoint not found" });
    });
  }

  return app;
}

export function startServer(port, deps = {}) {
  // Runtime entrypoint used by local dev/prod boot while reusing createApp().
  // Validate environment before attempting to start the app
  validateEnvironmentVariables();

  const app = createApp(deps);
  const PORT = Number(port ?? process.env.PORT ?? 8080);
  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server listening on port ${PORT}`);
  });
  return { app, server };
}

const modulePath = fileURLToPath(import.meta.url);
const isDirectRun = process.argv[1]
  ? path.resolve(process.argv[1]) === modulePath
  : false;

if (isDirectRun) {
  startServer();
}
