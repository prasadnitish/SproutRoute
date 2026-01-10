import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import rateLimit from "express-rate-limit";
import { geocodeLocation } from "./services/geocoding.js";
import { getWeatherForecast } from "./services/weather.js";
import { generatePackingList } from "./services/packingListAI.js";
import { generateTripPlan } from "./services/tripPlanAI.js";
import { sanitizeTripData, validateTripData } from "./utils/sanitize.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

if (!process.env.ANTHROPIC_API_KEY) {
  console.warn("⚠️  WARNING: ANTHROPIC_API_KEY is not set in .env file");
}

// CORS configuration with allowed origins
const allowedOrigins =
  process.env.NODE_ENV === "production"
    ? (process.env.ALLOWED_ORIGINS || "").split(",").filter(Boolean)
    : [
        "http://localhost:5173",
        "http://localhost:3000",
        "http://127.0.0.1:5173",
      ];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, Postman, etc.)
      if (!origin) return callback(null, true);

      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
  }),
);

app.use(express.json());

// Security headers
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

// Request logging
app.use((req, res, next) => {
  if (process.env.NODE_ENV !== "production") {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  }
  next();
});

// Rate limiting for expensive API endpoints
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 requests per window per IP
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
  res.json({
    status: "ok",
    message: "StrollerScout API is running",
    timestamp: new Date().toISOString(),
  });
});

app.post("/api/trip-plan", apiLimiter, async (req, res) => {
  try {
    // Sanitize user input
    const sanitizedData = sanitizeTripData(req.body);

    // Validate input
    const validationErrors = validateTripData(sanitizedData);
    if (validationErrors.length > 0) {
      return res.status(400).json({
        error: validationErrors.join(", "),
      });
    }

    const { destination, startDate, endDate, activities, children } =
      sanitizedData;

    if (
      !process.env.ANTHROPIC_API_KEY ||
      process.env.ANTHROPIC_API_KEY === "your_api_key_here"
    ) {
      return res.status(500).json({
        error:
          "API key not configured. Please set ANTHROPIC_API_KEY in .env file.",
      });
    }

    console.log(`Generating trip plan for ${destination}...`);

    const coords = await geocodeLocation(destination);
    console.log(`Geocoded to: ${coords.lat}, ${coords.lon}`);

    const weather = await getWeatherForecast(coords.lat, coords.lon);
    console.log(`Weather fetched: ${weather.summary}`);

    const tripPlan = await generateTripPlan(
      { destination, startDate, endDate, activities, children },
      weather,
    );
    console.log(
      `Trip plan generated with ${tripPlan.suggestedActivities.length} activities`,
    );

    const tripDuration = Math.ceil(
      (new Date(endDate) - new Date(startDate)) / (1000 * 60 * 60 * 24),
    );

    res.json({
      trip: {
        destination: coords.displayName || destination,
        startDate,
        endDate,
        duration: tripDuration,
        activities,
        children,
      },
      weather,
      tripPlan,
    });
  } catch (error) {
    console.error("Error in /api/trip-plan:", error);

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
      details:
        process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
});

app.post("/api/generate", apiLimiter, async (req, res) => {
  try {
    // Sanitize user input
    const sanitizedData = sanitizeTripData(req.body);

    // Validate input
    const validationErrors = validateTripData(sanitizedData);
    if (validationErrors.length > 0) {
      return res.status(400).json({
        error: validationErrors.join(", "),
      });
    }

    const { destination, startDate, endDate, activities, children } =
      sanitizedData;

    if (
      !process.env.ANTHROPIC_API_KEY ||
      process.env.ANTHROPIC_API_KEY === "your_api_key_here"
    ) {
      return res.status(500).json({
        error:
          "API key not configured. Please set ANTHROPIC_API_KEY in .env file.",
      });
    }

    console.log(`Generating packing list for ${destination}...`);

    const coords = await geocodeLocation(destination);
    console.log(`Geocoded to: ${coords.lat}, ${coords.lon}`);

    const weather = await getWeatherForecast(coords.lat, coords.lon);
    console.log(`Weather fetched: ${weather.summary}`);

    const packingList = await generatePackingList(
      { destination, startDate, endDate, activities, children },
      weather,
    );
    console.log(
      `Packing list generated with ${packingList.categories.length} categories`,
    );

    const tripDuration = Math.ceil(
      (new Date(endDate) - new Date(startDate)) / (1000 * 60 * 60 * 24),
    );

    res.json({
      trip: {
        destination: coords.displayName || destination,
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
    console.error("Error in /api/generate:", error);

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
      details:
        process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
});

app.use((req, res) => {
  res.status(404).json({ error: "Endpoint not found" });
});

app.listen(PORT, () => {
  console.log(
    `🚀 StrollerScout API server running on http://localhost:${PORT}`,
  );
  console.log(`Environment: ${process.env.NODE_ENV || "development"}`);
  console.log(
    `API Key configured: ${process.env.ANTHROPIC_API_KEY ? "Yes" : "No"}`,
  );
});
