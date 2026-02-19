// Backend entry point: Express server that orchestrates location, weather, and AI calls.
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import rateLimit from "express-rate-limit";
import path from "path";
import { fileURLToPath } from "url";
import {
  geocodeLocation,
  resolveDestinationQuery,
} from "./services/geocoding.js";
import { getWeatherForecast } from "./services/weather.js";
import { generatePackingList } from "./services/packingListAI.js";
import { generateTripPlan } from "./services/tripPlanAI.js";
import { getCarSeatGuidance } from "./services/safetyRules.js";
import {
  sanitizeString,
  sanitizeChildren,
  sanitizeTripData,
  validateTripData,
} from "./utils/sanitize.js";

dotenv.config();

// Validate required environment variables at startup
function validateEnvironmentVariables() {
  if (!process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY === "your_api_key_here") {
    console.error("FATAL: ANTHROPIC_API_KEY must be set and valid in environment variables");
    console.error("Please set ANTHROPIC_API_KEY in your .env file or environment.");
    process.exit(1);
  }
}

function validateProductionEnvironment() {
  if (process.env.NODE_ENV !== "production") return;
  
  const allowedOrigins = (process.env.ALLOWED_ORIGINS || "").split(",").map(s => s.trim()).filter(Boolean);
  if (allowedOrigins.length === 0) {
    console.error("FATAL: ALLOWED_ORIGINS is empty in production mode.");
    console.error("Please set ALLOWED_ORIGINS to your frontend domain(s) in your deployment environment.");
    console.error("Example: ALLOWED_ORIGINS=https://myapp.cloudflare.app,https://www.myapp.com");
    process.exit(1);
  }
}

function buildAllowedOrigins() {
  // Keeps local dev friction low while enforcing explicit allow-lists in production.
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
    getWeatherForecastFn = getWeatherForecast,
    generatePackingListFn = generatePackingList,
    generateTripPlanFn = generateTripPlan,
    getCarSeatGuidanceFn = getCarSeatGuidance,
    enableRequestLogging = process.env.NODE_ENV !== "test",
  } = deps;

  const app = express();

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
      if (process.env.NODE_ENV !== "production") {
        console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
      }
      next();
    });
  }

  const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 30,  // Increased from 10 to 30: ~5 complete trip plans per window (resolve + plan + generate + car-seat = 4 calls/trip)
    message: {
      error: "Too many requests from this IP, please try again in 15 minutes.",
    },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      res.status(429).json({
        error: "Too many requests. Please try again in 15 minutes.",
        retryAfter: "15 minutes",
      });
    },
  });

  app.get("/api/health", (req, res) => {
    // Fast liveness probe for local dev and hosting health checks.
    res.json({
      status: "ok",
      message: "StrollerScout API is running",
      timestamp: new Date().toISOString(),
    });
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
      if (process.env.NODE_ENV !== "production") {
        console.error("Error in /api/resolve-destination:", error);
      }
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
      devLog(`Geocoded to: ${coords.lat}, ${coords.lon}`);

      const weather = await getWeatherForecastFn(coords.lat, coords.lon);
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
      if (process.env.NODE_ENV !== "production") {
        console.error("Error in /api/trip-plan:", error);
      }

      if (
        error.message.includes("Location not found") ||
        error.message.includes("geocode")
      ) {
        return res.status(422).json({
          error:
            "Could not find location. Please enter a valid US city or address.",
        });
      }

      if (error.message.includes("Weather service")) {
        return res.status(422).json({
          error:
            "Weather data unavailable for this location. Please try a US location.",
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

      const weather = await getWeatherForecastFn(coords.lat, coords.lon);
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
      if (process.env.NODE_ENV !== "production") {
        console.error("Error in /api/generate:", error);
      }

      if (
        error.message.includes("Location not found") ||
        error.message.includes("geocode")
      ) {
        return res.status(422).json({
          error:
            "Could not find location. Please enter a valid US city or address.",
        });
      }

      if (error.message.includes("Weather service")) {
        return res.status(422).json({
          error:
            "Weather data unavailable for this location. Please try a US location.",
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
        }),
      );

      return res.json(guidance);
    } catch (error) {
      if (process.env.NODE_ENV !== "production") {
        console.error("Error in /api/safety/car-seat-check:", error);
      }
      return res.status(500).json({
        error: "Failed to evaluate car seat guidance. Please try again.",
      });
    }
  });

  app.use((req, res) => {
    res.status(404).json({ error: "Endpoint not found" });
  });

  return app;
}

export function startServer(port, deps = {}) {
  // Runtime entrypoint used by local dev/prod boot while reusing createApp().
  // Validate environment before attempting to start the app
  validateEnvironmentVariables();
  validateProductionEnvironment();
  
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
