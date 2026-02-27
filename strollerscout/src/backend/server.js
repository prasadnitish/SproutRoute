// Backend entry point: Express server that orchestrates location, weather, and AI calls.
import path from "path";
import { fileURLToPath } from "url";
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import rateLimit from "express-rate-limit";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import {
  geocodeLocation,
  resolveDestinationQuery,
} from "./services/geocoding.js";
import { getWeatherForecast } from "./services/weather.js";
import { generatePackingList } from "./services/packingListAI.js";
import { generateTripPlan } from "./services/tripPlanAI.js";
import nodemailer from "nodemailer";
import {
  sanitizeString,
  sanitizeTripData,
  validateTripData,
} from "./utils/sanitize.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

if (!process.env.ANTHROPIC_API_KEY) {
  console.warn("⚠️  WARNING: ANTHROPIC_API_KEY is not set in .env file");
}

// Pipeline-step logs are dev-only; avoids noise in production.
const devLog = (...args) => {
  if (process.env.NODE_ENV !== "production") console.log(...args);
};

// CORS configuration: allow same-origin and configured origins.
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
      // No-origin requests come from direct navigation, same-origin fetch,
      // or server-to-server calls — always allow them.
      if (!origin) {
        return callback(null, true);
      }

      // In production with no ALLOWED_ORIGINS set, allow any origin
      // (the app serves its own frontend, so all requests are same-origin).
      if (
        allowedOrigins.length === 0 ||
        allowedOrigins.includes(origin)
      ) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
  }),
);

app.use(express.json());

// Basic security headers for common browser hardening.
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

// Request logging (dev only) for easier debugging.
app.use((req, res, next) => {
  if (process.env.NODE_ENV !== "production") {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  }
  next();
});

// Rate limiting to protect external API usage (Claude + Weather).
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
    message: "SproutRoute API is running",
    timestamp: new Date().toISOString(),
  });
});

app.post("/api/resolve-destination", apiLimiter, async (req, res) => {
  try {
    const rawQuery = sanitizeString(req.body?.query || "", 120);
    if (!rawQuery) {
      return res.status(400).json({ error: "Destination query is required" });
    }

    const result = await resolveDestinationQuery(rawQuery);
    return res.json(result);
  } catch (error) {
    console.error("Error in /api/resolve-destination:", error);
    return res.status(500).json({
      error: "Failed to resolve destination. Please try again.",
      details:
        process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
});

app.post("/api/trip-plan", apiLimiter, async (req, res) => {
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
    // If user hasn't picked activities yet, use neutral defaults for the plan.
    const safeActivities =
      Array.isArray(activities) && activities.length > 0
        ? activities
        : ["family-friendly", "parks", "city"];

    if (
      !process.env.ANTHROPIC_API_KEY ||
      process.env.ANTHROPIC_API_KEY === "your_api_key_here"
    ) {
      return res.status(500).json({
        error:
          "API key not configured. Please set ANTHROPIC_API_KEY in .env file.",
      });
    }

    devLog(`Generating trip plan for ${destination}...`);

    const coords = await geocodeLocation(destination);
    devLog(`Geocoded to: ${coords.lat}, ${coords.lon}`);

    const weather = await getWeatherForecast(coords.lat, coords.lon);
    devLog(`Weather fetched: ${weather.summary}`);

    const tripPlan = await generateTripPlan(
      { destination, startDate, endDate, activities: safeActivities, children },
      weather,
    );
    devLog(
      `Trip plan generated with ${
        tripPlan?.suggestedActivities?.length ?? 0
      } activities`,
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
        activities: safeActivities,
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

    if (
      !process.env.ANTHROPIC_API_KEY ||
      process.env.ANTHROPIC_API_KEY === "your_api_key_here"
    ) {
      return res.status(500).json({
        error:
          "API key not configured. Please set ANTHROPIC_API_KEY in .env file.",
      });
    }

    devLog(`Generating packing list for ${destination}...`);

    const coords = await geocodeLocation(destination);
    devLog(`Geocoded to: ${coords.lat}, ${coords.lon}`);

    const weather = await getWeatherForecast(coords.lat, coords.lon);
    devLog(`Weather fetched: ${weather.summary}`);

    const packingList = await generatePackingList(
      { destination, startDate, endDate, activities, children },
      weather,
    );
    devLog(
      `Packing list generated with ${
        packingList?.categories?.length ?? 0
      } categories`,
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

// Feedback rate limiter (tighter: 3 per 15 min to prevent spam).
const feedbackLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 3,
  message: { error: "Too many feedback submissions. Please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

// Build SMTP transporter lazily — only if env vars are configured.
let mailTransporter = null;
function getMailTransporter() {
  if (mailTransporter) return mailTransporter;

  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || "587", 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) return null;

  mailTransporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
  return mailTransporter;
}

app.post("/api/feedback", feedbackLimiter, async (req, res) => {
  try {
    const category = sanitizeString(req.body?.category || "", 50);
    const message = sanitizeString(req.body?.message || "", 2000);
    const email = sanitizeString(req.body?.email || "", 200);

    if (!message || message.length < 5) {
      return res
        .status(400)
        .json({ error: "Please provide a message (at least 5 characters)." });
    }

    const validCategories = ["bug", "feature", "general"];
    const safeCategory = validCategories.includes(category)
      ? category
      : "general";

    const feedbackEntry = {
      category: safeCategory,
      message,
      email: email || null,
      timestamp: new Date().toISOString(),
      ip: req.ip,
    };

    // Always log feedback server-side so nothing is lost.
    console.log("[FEEDBACK]", JSON.stringify(feedbackEntry));

    // Send email if SMTP is configured; skip gracefully if not.
    const transporter = getMailTransporter();
    const recipient = process.env.FEEDBACK_TO_EMAIL;

    if (transporter && recipient) {
      const categoryLabel = {
        bug: "Bug Report",
        feature: "Feature Request",
        general: "General Feedback",
      }[safeCategory];

      await transporter.sendMail({
        from: process.env.SMTP_USER,
        to: recipient,
        subject: `[SproutRoute] ${categoryLabel}`,
        text: [
          `Category: ${categoryLabel}`,
          `From: ${email || "(no email provided)"}`,
          `Time: ${feedbackEntry.timestamp}`,
          "",
          message,
        ].join("\n"),
      });

      devLog("Feedback email sent successfully");
    } else {
      devLog(
        "SMTP not configured — feedback logged to console only. Set SMTP_HOST, SMTP_USER, SMTP_PASS, and FEEDBACK_TO_EMAIL to enable email delivery.",
      );
    }

    res.json({ success: true, message: "Thank you for your feedback!" });
  } catch (error) {
    console.error("Error in /api/feedback:", error);
    res.status(500).json({
      error: "Failed to submit feedback. Please try again.",
    });
  }
});

// Serve the built frontend in production.
const distPath = path.join(__dirname, "../frontend/dist");
app.use(express.static(distPath));

// SPA fallback: any non-API route serves index.html so React Router can handle it.
app.get("*", (req, res) => {
  res.sendFile(path.join(distPath, "index.html"));
});

app.listen(PORT, () => {
  console.log(
    `🚀 SproutRoute API server running on http://localhost:${PORT}`,
  );
  console.log(`Environment: ${process.env.NODE_ENV || "development"}`);
  console.log(
    `API Key configured: ${process.env.ANTHROPIC_API_KEY ? "Yes" : "No"}`,
  );
});
