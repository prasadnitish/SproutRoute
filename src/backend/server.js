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
import { generatePackingList } from "./services/deterministicPacking.js";
import { generateTripPlan, generateTripPlanChunked, computeChunks } from "./services/tripPlanAI.js";
import { inclusiveDayCount } from "./utils/dateCalc.js";
import { getCarSeatGuidance } from "./services/safetyRules.js";
import { getTravelAdvisory } from "./services/travelAdvisory.js";
import { getNeighborhoodSafety } from "./services/neighborhoodSafety.js";
import { parseInput } from "./services/parseInput.js";
import { getTravelSafety } from "./services/travelSafety.js";
import { getPetTravelGuidance } from "./services/petSafety.js";
import { enrichActivity } from "./services/placesEnrich.js";
import { scheduleItinerary, batchEnrich } from "./services/itineraryScheduler.js";
import { mergeProfileAndIntent, buildPlannerSummary } from "./services/profileMerge.js";
import { sanitizeProfileForPlanning, sanitizeTripIntentFields } from "./services/profileContext.js";
import { createAttractionMemoryService } from "./services/attractionMemory.js";
import { createGroupTripStore } from "./services/groupTripStore.js";
import { ensureUserRecord } from "./services/userStore.js";
import {
  sanitizeString,
  sanitizeChildren,
  sanitizeTripData,
  validateTripData,
} from "./utils/sanitize.js";
import { buildShopLinks } from "./utils/affiliateLinks.js";
import { sanitizeDestination, sanitizeFoodPreferences, sanitizePets } from "./services/inputSafety.js";
import { log } from "./utils/logger.js";
import { requireAuth, optionalAuth } from "./middleware/auth.js";
import { getSupabaseAdmin, supabaseForUser } from "./utils/supabaseClient.js";
// NOTE: Only getSupabaseAdmin() (for admin ops) and supabaseForUser() (for user-scoped ops)
import { metrics } from "./services/metrics.js";
import { parsePastedProfileJson } from "./utils/profileImportJson.js";

dotenv.config();

// ── Ops Dashboard — served from dashboard.html ──────────────────────────────
import { readFileSync } from "fs";
const __dashboardDir = path.dirname(fileURLToPath(import.meta.url));
let OPS_DASHBOARD_HTML;
try {
  OPS_DASHBOARD_HTML = readFileSync(path.join(__dashboardDir, "dashboard.html"), "utf-8");
} catch {
  OPS_DASHBOARD_HTML = "<html><body><h1>Dashboard file not found</h1></body></html>";
}

/* eslint-disable-next-line no-unused-vars */
const _OLD_DASHBOARD_REMOVED = `
h1{font-size:24px;font-weight:800;color:#15803d;margin-bottom:16px}
h2{font-size:16px;font-weight:700;color:#166534;margin:20px 0 8px;border-bottom:2px solid #bbf7d0;padding-bottom:4px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px;margin-bottom:16px}
.card{background:#fff;border-radius:12px;padding:16px;border:1px solid #d1fae5}
.label{font-size:11px;text-transform:uppercase;color:#6b7280;letter-spacing:.5px;margin-bottom:4px}
.value{font-size:28px;font-weight:800;color:#15803d}
table{width:100%;border-collapse:collapse;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #d1fae5;margin-bottom:12px}
th{background:#f0fdf4;font-size:11px;text-transform:uppercase;color:#6b7280;padding:8px 12px;text-align:left}
td{padding:8px 12px;font-size:13px;border-top:1px solid #f3f3f3}
</style></head><body>
<h1>SproutRoute Ops Dashboard</h1>
<p id="loading">Loading metrics...</p>
<div id="app" style="display:none"></div>
<script>
async function load(){
  const params=new URLSearchParams(window.location.search);const key=params.get("key");const r=await fetch("/api/v1/ops/metrics",{headers:key?{"x-ops-secret":key}:{}});
  const d=await r.json();
  document.getElementById("loading").style.display="none";
  const app=document.getElementById("app");
  app.style.display="block";
  app.textContent="";
  buildDashboard(app,d);
}
function el(tag,text,cls){const e=document.createElement(tag);if(text)e.textContent=text;if(cls)e.className=cls;return e}
function buildDashboard(root,d){
  const s=d.summary||{};
  // Summary cards
  const grid=el("div","","grid");
  [["Trips",s.tripsGenerated],["Sessions",s.uniqueSessions],["AI Calls",s.totalAiCalls],["Errors",s.totalErrors],["Error Rate",s.errorRate],["Est Cost",s.estimatedCost]].forEach(([l,v])=>{
    const c=el("div","","card");c.appendChild(el("div",l,"label"));c.appendChild(el("div",String(v??"0"),"value"));grid.appendChild(c);
  });
  root.appendChild(grid);
  // Latency table
  root.appendChild(el("h2","Latency by Stage"));
  const lt=document.createElement("table");
  lt.appendChild(mkRow("thead",["Stage","p50","p95","Avg","Count"]));
  const ltb=document.createElement("tbody");
  Object.entries(d.latencyByStage||{}).forEach(([k,v])=>ltb.appendChild(mkRow("tbody",[k,fmt(v.p50),fmt(v.p95),fmt(v.avg),v.count])));
  lt.appendChild(ltb);root.appendChild(lt);
  // Recent trips
  root.appendChild(el("h2","Recent Trips"));
  const tt=document.createElement("table");
  tt.appendChild(mkRow("thead",["Time","Destination","Days","1st Chunk","AI Total","Total","Kids"]));
  const ttb=document.createElement("tbody");
  (d.recentTrips||[]).forEach(t=>{const tm=t.timing||{};ttb.appendChild(mkRow("tbody",[ago(t.ts),t.destination||"?",t.duration||"?",fmt(tm.firstChunk),fmt(tm.ai),fmt(tm.total),t.childCount||0]))});
  tt.appendChild(ttb);root.appendChild(tt);
  // Top destinations
  root.appendChild(el("h2","Top Destinations"));
  const dt=document.createElement("table");
  dt.appendChild(mkRow("thead",["Destination","Count"]));
  const dtb=document.createElement("tbody");
  (d.topDestinations||[]).forEach(dd=>dtb.appendChild(mkRow("tbody",[dd.name,dd.count])));
  dt.appendChild(dtb);root.appendChild(dt);
  // Model usage
  root.appendChild(el("h2","Model Usage"));
  const mt=document.createElement("table");
  mt.appendChild(mkRow("thead",["Provider/Model","Calls","Avg Latency","Errors","Est Cost"]));
  const mtb=document.createElement("tbody");
  Object.entries(d.modelUsage||{}).forEach(([k,v])=>mtb.appendChild(mkRow("tbody",[k,v.calls,fmt(v.calls?Math.round(v.totalMs/v.calls):0),v.errors||0,"$"+(v.estimatedCost?.toFixed(4)||"0")])));
  mt.appendChild(mtb);root.appendChild(mt);
  // Errors
  root.appendChild(el("h2","Recent Errors"));
  const et=document.createElement("table");
  et.appendChild(mkRow("thead",["Time","Path","Error"]));
  const etb=document.createElement("tbody");
  (d.recentErrors||[]).forEach(e=>etb.appendChild(mkRow("tbody",[ago(e.ts),e.path||"",String(e.error||"").slice(0,80)])));
  et.appendChild(etb);root.appendChild(et);
}
function mkRow(type,cells){const tr=document.createElement("tr");const tag=type==="thead"?"th":"td";cells.forEach(c=>{const cell=document.createElement(tag);cell.textContent=String(c??"");tr.appendChild(cell)});return tr}
function fmt(ms){if(!ms&&ms!==0)return"-";if(ms<1000)return ms+"ms";return(ms/1000).toFixed(1)+"s"}
function ago(ts){if(!ts)return"?";const d=Date.now()-new Date(ts).getTime();if(d<60000)return Math.round(d/1000)+"s ago";if(d<3600000)return Math.round(d/60000)+"m ago";return Math.round(d/3600000)+"h ago"}
load();setInterval(load,15000);
</script></body></html>`;

const AI_PROVIDER_ENV = {
  anthropic: "ANTHROPIC_API_KEY",
  gemini: "GOOGLE_GEMINI_API_KEY",
  openai: "OPENAI_API_KEY",
  deepseek: "DEEPSEEK_API_KEY",
};

function hasConfiguredSecret(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return false;
  if (trimmed === "replace_me") return false;
  if (trimmed.toLowerCase().startsWith("your_")) return false;
  if (trimmed.toLowerCase().includes("placeholder")) return false;
  return true;
}

function failEnvironmentValidation(message, exitOnFailure) {
  console.error(message);
  if (exitOnFailure) {
    process.exit(1);
  }
  throw new Error(message);
}

// Validate required environment variables at startup
export function validateEnvironmentVariables({ exitOnFailure = true } = {}) {
  const provider = String(process.env.AI_PROVIDER || "anthropic").toLowerCase().trim();
  const requiredKey = AI_PROVIDER_ENV[provider];

  if (!requiredKey) {
    return failEnvironmentValidation(
      `FATAL: AI_PROVIDER must be one of ${Object.keys(AI_PROVIDER_ENV).join(", ")}.`,
      exitOnFailure,
    );
  }

  if (!hasConfiguredSecret(process.env[requiredKey])) {
    return failEnvironmentValidation(
      `FATAL: ${requiredKey} must be set and valid when AI_PROVIDER=${provider}.`,
      exitOnFailure,
    );
  }

  return { aiProvider: provider, requiredEnvVar: requiredKey };
}

function buildAllowedOrigins() {
  // Production: always allow the custom domain + Railway domain.
  // ALLOWED_ORIGINS env var can add additional external callers.
  if (process.env.NODE_ENV === "production") {
    const extra = (process.env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
    return [
      "https://www.sproutroute.app",
      "https://sproutroute.app",
      "https://sproutroute-production.up.railway.app",
      ...extra,
    ];
  }
  return [
    "http://localhost:5173",
    "http://localhost:3000",
    "http://127.0.0.1:5173",
  ];
}

async function loadSavedProfileFromDb(req) {
  if (!req.user || !req.headers.authorization) return null;

  try {
    const db = supabaseForUser(req.headers.authorization);
    const { data, error } = await db
      .from("profiles")
      .select("profile_json")
      .eq("user_id", req.user.id)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    return sanitizeProfileForPlanning(data?.profile_json || null);
  } catch (error) {
    log.warn("profile:load-for-planning-failed", {
      userId: req.user?.id?.slice(0, 8),
      error: error.message,
    });
    return null;
  }
}

async function resolvePlanningContext(req, sanitizedTrip, foodPreferences) {
  const providedProfile = sanitizeProfileForPlanning(req.body?.savedProfile || null);
  const savedProfile = providedProfile || await loadSavedProfileFromDb(req);

  const tripIntent = sanitizeTripIntentFields({
    ...req.body,
    destination: sanitizedTrip.destination,
    childrenAges: sanitizedTrip.children.map((child) => child.age),
    pets: sanitizedTrip.pets,
    foodPreferences,
  });

  const merged = mergeProfileAndIntent(savedProfile, tripIntent);
  return {
    savedProfile,
    tripIntent,
    plannerSummary: buildPlannerSummary(merged),
  };
}

async function loadCachedAttractionsForTrip(attractionMemoryService, {
  destination,
  startDate,
  endDate,
  coords,
  countryCode,
  children,
  activities,
  pets,
  planningContext,
}) {
  if (!attractionMemoryService?.getPlanningCandidates) return [];

  const pacePreference = planningContext?.tripIntent?.pacePreference;
  const pace = typeof pacePreference === "string" && pacePreference !== "unknown"
    ? pacePreference
    : "";
  const tripIntent = planningContext?.tripIntent || {};
  const tripDays = inclusiveDayCount(startDate, endDate);
  const maxResults = Math.min(36, Math.max(16, tripDays * 4 + 4));

  return attractionMemoryService.getPlanningCandidates({
    destination,
    coords,
    countryCode,
    childrenAges: (children || []).map((child) => child.age).filter(Number.isFinite),
    requestedActivities: activities || [],
    tripGoals: tripIntent.tripGoals || [],
    mustHaves: tripIntent.mustHaves || [],
    avoidances: tripIntent.avoidances || [],
    transportPreferences: tripIntent.transportPreferences || [],
    accessibilityNeeds: tripIntent.accessibilityNeeds || [],
    scheduleConstraints: tripIntent.scheduleConstraints || [],
    pace,
    pets: pets || [],
    maxResults,
  });
}

function persistTripAttractionsInBackground(attractionMemoryService, payload) {
  if (!attractionMemoryService?.persistTripAttractions) return;

  Promise.resolve(attractionMemoryService.persistTripAttractions(payload)).catch((error) => {
    log.warn("attraction-memory:persist-failed", { error: error.message });
  });
}

export function createApp(deps = {}) {
  // App factory enables dependency injection for fast, isolated integration tests.
  const {
    geocodeLocationFn = geocodeLocation,
    resolveDestinationQueryFn = resolveDestinationQuery,
    getWeatherForecastFn = getWeatherForecast,
    generatePackingListFn = generatePackingList,
    generateTripPlanFn = generateTripPlan,
    generateTripPlanChunkedFn = generateTripPlanChunked,
    getCarSeatGuidanceFn = getCarSeatGuidance,
    getTravelAdvisoryFn = getTravelAdvisory,
    getNeighborhoodSafetyFn = getNeighborhoodSafety,
    enrichActivityFn = enrichActivity,
    getPetTravelGuidanceFn = getPetTravelGuidance,
    attractionMemoryService = createAttractionMemoryService(),
    groupTripStore = createGroupTripStore(),
    enableRequestLogging = process.env.NODE_ENV !== "test",
  } = deps;

  const app = express();

  // Railway (and most PaaS) sit behind a load balancer that sets X-Forwarded-For.
  // Without trust proxy, express-rate-limit throws ERR_ERL_UNEXPECTED_X_FORWARDED_FOR.
  if (process.env.NODE_ENV === "production") {
    app.set("trust proxy", 1);
  }

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
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self' 'unsafe-inline' https://us-assets.i.posthog.com https://static.cloudflareinsights.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: https://*.googleapis.com https://*.googleusercontent.com https://*.openstreetmap.org https://*.tile.openstreetmap.org; connect-src 'self' https://us.i.posthog.com https://us-assets.i.posthog.com https://cloudflareinsights.com; font-src 'self' https://fonts.gstatic.com; frame-src https://*.openstreetmap.org; frame-ancestors 'none';",
    );
    if (process.env.NODE_ENV === "production") {
      res.setHeader(
        "Strict-Transport-Security",
        "max-age=31536000; includeSubDomains",
      );
    }
    next();
  });

  // ─── Request logging middleware: logs every API request with duration ───
  app.use((req, res, next) => {
    if (!req.path.startsWith("/api")) return next();
    const start = Date.now();
    const reqId = crypto.randomUUID().slice(0, 8);
    req.reqId = reqId;
    log.info("req:start", { reqId, method: req.method, path: req.path });
    res.on("finish", () => {
      const ms = Date.now() - start;
      log.info("req:end", { reqId, method: req.method, path: req.path, status: res.statusCode, ms });
      metrics.recordRequest({ method: req.method, path: req.path, status: res.statusCode, ms, reqId });
    });
    next();
  });

  // AI-intensive limiter: stricter — these routes cost real money (Anthropic/DeepSeek calls)
  const aiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,  // 10 AI calls per 15 minutes per IP (~2-3 complete trip plans)
    message: { error: "Too many AI requests, please try again in 15 minutes." },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      const resetAt = Math.ceil(Date.now() / 1000) + 15 * 60;
      res.status(429).json({
        error: "Too many AI requests. Please try again in 15 minutes.",
        retryAfter: "15 minutes",
        rateLimitReset: resetAt,
      });
    },
  });

  // General API limiter: for lightweight routes (geocoding, places, photos, health)
  const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 60,  // 60 lightweight calls per 15 minutes per IP
    message: {
      error: "Too many requests from this IP, please try again in 15 minutes.",
    },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      const resetAt = Math.ceil(Date.now() / 1000) + 15 * 60;
      res.status(429).json({
        error: "Too many requests. Please try again in 15 minutes.",
        retryAfter: "15 minutes",
        rateLimitReset: resetAt,
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

  // ─── Ops Dashboard (protected — requires OPS_SECRET query param or env match) ─
  const opsGuard = (req, res, next) => {
    const secret = process.env.OPS_SECRET;
    if (!secret) return res.status(503).json({ error: "Ops dashboard not configured" });
    const headerSecret = req.get("x-ops-secret");
    const bearerSecret = req.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
    // Security: secret via headers only — never in query params (avoids log exposure)
    const providedSecret = headerSecret || bearerSecret;
    if (providedSecret !== secret) return res.status(403).json({ error: "Forbidden" });
    next();
  };

  app.get("/api/v1/ops/metrics", opsGuard, async (req, res) => {
    try {
      const snapshot = await metrics.getSnapshot();
      res.json(snapshot);
    } catch (err) {
      res.status(500).json({ error: "Failed to load metrics", message: err.message });
    }
  });

  // /ops page: allow query param for initial browser navigation only
  const opsPageGuard = (req, res, next) => {
    const secret = process.env.OPS_SECRET;
    if (!secret) return res.status(503).json({ error: "Ops dashboard not configured" });
    if (req.query.key !== secret) return res.status(403).send("Forbidden");
    next();
  };
  app.get("/ops", opsPageGuard, (req, res) => {
    res.setHeader("Content-Type", "text/html");
    // Override CSP for admin dashboard — allows inline script (auth-gated, not user-facing)
    res.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; frame-src https://us.posthog.com");
    res.send(OPS_DASHBOARD_HTML);
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

  app.post("/api/trip-plan", aiLimiter, async (req, res) => {
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

      const { destination, startDate, endDate, activities, children, pets } =
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

      const foodPreferences = sanitizeFoodPreferences(req.body?.foodPreferences);

      const tripPlan = await generateTripPlanFn(
        {
          destination,
          startDate,
          endDate,
          activities: safeActivities,
          children,
          pets,
          foodPreferences,
        },
        weather,
      );
      devLog(`Trip plan generated successfully`);

      // Enrichment deferred to frontend (usePlacesEnrich) for faster response.
      // Schedule itinerary using time-slot heuristics only (no Places data needed).
      let scheduledItinerary = null;
      try {
        scheduledItinerary = scheduleItinerary(tripPlan, {}, startDate);
      } catch (scheduleErr) {
        devLog(`Schedule failed (non-blocking): ${scheduleErr.message}`);
      }

      const tripDuration = inclusiveDayCount(startDate, endDate);
      if (new Date(endDate) < new Date(startDate)) {
        return res.status(400).json({ error: "End date must be after start date." });
      }

      res.json({
        trip: {
          destination: coords.displayName || destination,
          lat: coords.lat,
          lon: coords.lon,
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
        scheduledItinerary,
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

  app.post("/api/generate", aiLimiter, async (req, res) => {
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

      const { destination, startDate, endDate, activities, children, pets } =
        sanitizedData;

      // Note: API key validation is performed at startup via validateEnvironmentVariables()
      // This graceful check is for extra safety but should never be reached in production

      devLog(`Generating packing list...`);

      const coords = await geocodeLocationFn(destination);
      devLog(`Geocoded coordinates obtained`);

      const weather = await getWeatherForecastFn(coords.lat, coords.lon, coords.countryCode || "US", startDate, endDate);
      devLog(`Weather fetched successfully`);

      const packingList = await generatePackingListFn(
        { destination, startDate, endDate, activities, children, pets },
        weather,
      );
      devLog(
        `Packing list generated successfully`,
      );

      // Add shopLinks to each item in each category
      if (packingList?.categories) {
        for (const category of packingList.categories) {
          category.items = category.items.map(item => ({
            ...item,
            shopLinks: item.searchQuery ? buildShopLinks(item.searchQuery) : [],
          }));
        }
      }

      const tripDuration = inclusiveDayCount(startDate, endDate);
      if (new Date(endDate) < new Date(startDate)) {
        return res.status(400).json({ error: "End date must be after start date." });
      }

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
      if (process.env.NODE_ENV !== "production") {
        console.error("Error in /api/generate:", error);
      }

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

  // POST /api/safety/travel-tips — AI-generated travel safety for any destination
  app.post("/api/safety/travel-tips", apiLimiter, async (req, res) => {
    try {
      const destination = sanitizeString(req.body?.destination || "", 120);
      // Sanitize childrenAges to prevent prompt injection (only allow numbers 0-18)
      const rawAges = Array.isArray(req.body?.childrenAges) ? req.body.childrenAges : [];
      const childrenAges = rawAges.map(a => parseInt(String(a), 10)).filter(n => Number.isFinite(n) && n >= 0 && n <= 18);
      const countryCode = sanitizeString(req.body?.countryCode || "", 5);

      if (!destination) {
        return res.status(400).json({ error: "Destination is required." });
      }

      const tips = await getTravelSafety(destination, childrenAges, countryCode);
      return res.json(tips);
    } catch (error) {
      if (process.env.NODE_ENV !== "production") {
        console.error("Error in /api/safety/travel-tips:", error);
      }
      return res.status(500).json({
        error: "Failed to generate travel safety tips.",
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

  function groupTripError(res, statusCode, requestId, message, details) {
    const code = statusCode === 503
      ? "GROUP_TRIP_STORAGE_ERROR"
      : statusCode === 403
        ? "GROUP_TRIP_AUTH_ERROR"
        : statusCode === 404
          ? "GROUP_TRIP_NOT_FOUND"
          : "GROUP_TRIP_VALIDATION_ERROR";
    const category = statusCode === 503
      ? "dependency"
      : statusCode === 403
        ? "authentication"
        : statusCode === 404
          ? "not_found"
          : "validation";

    return v1Error(res, statusCode, {
      code,
      message,
      category,
      retryable: statusCode === 503,
      requestId,
      details: Array.isArray(details) ? { errors: details } : details,
    });
  }

  function groupTripStatus(result, fallbackStatus = 400) {
    if (result.storageError) return 503;
    if (result.unauthorized) return 403;
    if (result.notFound) return 404;
    return fallbackStatus;
  }

  app.post("/api/v1/group-trips", apiLimiter, async (req, res) => {
    const requestId = crypto.randomUUID();
    const result = await groupTripStore.createTrip(req.body || {});

    if (!result.ok) {
      return groupTripError(res, groupTripStatus(result), requestId, result.errors.join(" "), result.errors);
    }

    return res.status(201).json({ requestId, ...result });
  });

  app.post("/api/v1/group-trips/join", apiLimiter, async (req, res) => {
    const requestId = crypto.randomUUID();
    const result = await groupTripStore.joinTrip(req.body || {});

    if (!result.ok) {
      return groupTripError(
        res,
        groupTripStatus(result),
        requestId,
        result.errors.join(" "),
        result.errors,
      );
    }

    return res.json({ requestId, ...result });
  });

  app.post("/api/v1/group-trips/items", apiLimiter, async (req, res) => {
    const requestId = crypto.randomUUID();
    const result = await groupTripStore.addItem(req.body || {});

    if (!result.ok) {
      return groupTripError(
        res,
        groupTripStatus(result),
        requestId,
        result.errors.join(" "),
        result.errors,
      );
    }

    return res.status(201).json({ requestId, ...result });
  });

  app.post("/api/v1/group-trips/decisions", apiLimiter, async (req, res) => {
    const requestId = crypto.randomUUID();
    const result = await groupTripStore.createDecision(req.body || {});

    if (!result.ok) {
      return groupTripError(
        res,
        groupTripStatus(result),
        requestId,
        result.errors.join(" "),
        result.errors,
      );
    }

    return res.status(201).json({ requestId, ...result });
  });

  app.post("/api/v1/group-trips/decisions/vote", apiLimiter, async (req, res) => {
    const requestId = crypto.randomUUID();
    const result = await groupTripStore.voteDecision(req.body || {});

    if (!result.ok) {
      return groupTripError(
        res,
        groupTripStatus(result),
        requestId,
        result.errors.join(" "),
        result.errors,
      );
    }

    return res.json({ requestId, ...result });
  });

  app.post("/api/v1/group-trips/expenses", apiLimiter, async (req, res) => {
    const requestId = crypto.randomUUID();
    const result = await groupTripStore.createExpense(req.body || {});

    if (!result.ok) {
      return groupTripError(
        res,
        groupTripStatus(result),
        requestId,
        result.errors.join(" "),
        result.errors,
      );
    }

    return res.status(201).json({ requestId, ...result });
  });

  app.post("/api/v1/group-trips/location-sharing", apiLimiter, async (req, res) => {
    const requestId = crypto.randomUUID();
    const result = await groupTripStore.setLocationSharing(req.body || {});

    if (!result.ok) {
      return groupTripError(
        res,
        groupTripStatus(result),
        requestId,
        result.errors.join(" "),
        result.errors,
      );
    }

    return res.json({ requestId, ...result });
  });

  app.get("/api/v1/group-trips/snapshot", apiLimiter, async (req, res) => {
    const requestId = crypto.randomUUID();
    const participantAccessToken =
      req.get?.("x-group-trip-participant-token") ||
      req.headers?.["x-group-trip-participant-token"] ||
      req.headers?.["X-Group-Trip-Participant-Token"];
    const result = await groupTripStore.snapshot({
      ...(req.query || {}),
      ...(req.body || {}),
      ...(participantAccessToken ? { participantAccessToken } : {}),
    });

    if (!result.ok) {
      return groupTripError(
        res,
        groupTripStatus(result),
        requestId,
        result.errors.join(" "),
        result.errors,
      );
    }

    return res.json({ requestId, ...result });
  });

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
        shareLinks: true,
        customItems: true,
        darkMode: false,
        pwa: false,
        internationalSupport: true,
      },
    };

    // iOS-specific feature flags (Phase 3b)
    if (client === "ios") {
      payload.ios26Features = {
        liquidGlass: false,
        weatherKitFastPath: true,
        foundationModelRecap: true,
        appIntents: true,
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
      devLog("Error in /api/v1/trip/resolve:", error);
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
  app.post("/api/v1/trip/plan", optionalAuth, aiLimiter, async (req, res) => {
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

      const { destination, startDate, endDate, activities, children, pets } = sanitizedData;
      const safeActivities =
        Array.isArray(activities) && activities.length > 0
          ? activities
          : ["family-friendly", "parks", "city"];
      const foodPreferences = sanitizeFoodPreferences(req.body?.foodPreferences);
      const planningContext = await resolvePlanningContext(req, sanitizedData, foodPreferences);

      devLog("v1/trip/plan: geocoding...");
      const coords = await geocodeLocationFn(destination);
      const resolvedCountry = coords.countryCode || "US";
      const weather = await getWeatherForecastFn(coords.lat, coords.lon, resolvedCountry, startDate, endDate);
      const cachedAttractions = await loadCachedAttractionsForTrip(attractionMemoryService, {
        destination,
        startDate,
        endDate,
        coords,
        countryCode: resolvedCountry,
        children,
        activities: safeActivities,
        pets,
        planningContext,
      });
      const tripPlan = await generateTripPlanFn(
        {
          destination,
          startDate,
          endDate,
          activities: safeActivities,
          children,
          pets,
          foodPreferences,
          plannerSummary: planningContext.plannerSummary,
          cachedAttractions,
        },
        weather,
      );

      persistTripAttractionsInBackground(attractionMemoryService, {
        destination,
        coords,
        countryCode: resolvedCountry,
        tripPlan,
      });

      const tripDuration = inclusiveDayCount(startDate, endDate);
      if (new Date(endDate) < new Date(startDate)) {
        return res.status(400).json({ error: "End date must be after start date." });
      }

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
      devLog("Error in /api/v1/trip/plan:", error);
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
  app.post("/api/v1/trip/bundle", optionalAuth, aiLimiter, async (req, res) => {
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

      const { destination, startDate, endDate, activities, children, pets } = sanitizedData;
      const safeActivities =
        Array.isArray(activities) && activities.length > 0
          ? activities
          : ["family-friendly", "parks", "city"];
      const foodPreferences = sanitizeFoodPreferences(req.body?.foodPreferences);
      const planningContext = await resolvePlanningContext(req, sanitizedData, foodPreferences);

      // Phase 1: Geocode
      const geocodeStart = Date.now();
      devLog("v1/trip/bundle: geocoding...");
      const coords = await geocodeLocationFn(destination);
      const resolvedCountry = coords.countryCode || "US";
      timings.geocode = Date.now() - geocodeStart;

      // Phase 2: Weather
      const weatherStart = Date.now();
      devLog("v1/trip/bundle: fetching weather...");
      const weather = await getWeatherForecastFn(coords.lat, coords.lon, resolvedCountry, startDate, endDate);
      timings.weather = Date.now() - weatherStart;

      // Phase 3: Trip plan + Packing list in parallel
      const aiStart = Date.now();
      devLog("v1/trip/bundle: running AI (trip + packing) in parallel...");
      const cachedAttractions = await loadCachedAttractionsForTrip(attractionMemoryService, {
        destination,
        startDate,
        endDate,
        coords,
        countryCode: resolvedCountry,
        children,
        activities: safeActivities,
        pets,
        planningContext,
      });
      const tripPayload = {
        destination,
        startDate,
        endDate,
        activities: safeActivities,
        children,
        pets,
        foodPreferences,
        plannerSummary: planningContext.plannerSummary,
        cachedAttractions,
      };
      const [tripPlan, packingList] = await Promise.all([
        generateTripPlanFn(tripPayload, weather),
        generatePackingListFn(tripPayload, weather),
      ]);
      timings.ai = Date.now() - aiStart;
      timings.total = Date.now() - geocodeStart;

      // Add shopLinks to each item in each category
      if (packingList?.categories) {
        for (const category of packingList.categories) {
          category.items = category.items.map(item => ({
            ...item,
            shopLinks: item.searchQuery ? buildShopLinks(item.searchQuery) : [],
          }));
        }
      }

      persistTripAttractionsInBackground(attractionMemoryService, {
        destination,
        coords,
        countryCode: resolvedCountry,
        tripPlan,
      });

      devLog(`v1/trip/bundle timings: geocode=${timings.geocode}ms, weather=${timings.weather}ms, ai=${timings.ai}ms, total=${timings.total}ms`);

      const tripDuration = inclusiveDayCount(startDate, endDate);
      if (new Date(endDate) < new Date(startDate)) {
        return res.status(400).json({ error: "End date must be after start date." });
      }

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
      devLog("Error in /api/v1/trip/bundle:", error);
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
  // Server-Sent Events endpoint: streams trip results progressively.
  // Events: destination → weather → itinerary-chunk → done
  // Packing is loaded after the itinerary so the first useful result is not blocked.
  // No batch enrichment — frontend enriches on-demand via usePlacesEnrich.
  app.post("/api/v1/trip/stream", optionalAuth, aiLimiter, async (req, res) => {
    // SSE headers
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no"); // Disable nginx/proxy buffering

    const streamStart = Date.now();
    const reqId = req.reqId || crypto.randomUUID().slice(0, 8);
    const timing = {};
    let clientClosed = false;

    const markClosed = () => {
      clientClosed = true;
    };
    if (typeof req.on === "function") req.on("close", markClosed);
    if (typeof res.on === "function") res.on("close", markClosed);

    const isClientClosed = () => clientClosed || res.writableEnded || res.destroyed;
    const throwIfClientClosed = () => {
      if (!isClientClosed()) return;
      const err = new Error("Client disconnected");
      err.name = "AbortError";
      throw err;
    };
    const cleanupStreamListeners = () => {
      if (typeof req.off === "function") req.off("close", markClosed);
      if (typeof res.off === "function") res.off("close", markClosed);
    };

    const send = (event, data) => {
      if (isClientClosed()) return false;
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      return true;
    };

    try {
      const sanitizedData = sanitizeTripData(req.body);
      const validationErrors = validateTripData(sanitizedData, { requireActivities: false });
      if (validationErrors.length > 0) {
        send("error", { message: validationErrors.join("; ") });
        return res.end();
      }

      const { destination, startDate, endDate, activities, children, pets } = sanitizedData;

      // Early duration check — before any expensive calls
      const earlyDuration = new Date(endDate) < new Date(startDate) ? -1 : 1;
      if (earlyDuration < 0 || !destination) {
        send("error", { message: destination ? "End date must be after start date." : "Destination is required." });
        return res.end();
      }

      const safeActivities =
        Array.isArray(activities) && activities.length > 0
          ? activities
          : ["family-friendly", "parks", "city"];

      log.info("stream:input", { reqId, destination, startDate, endDate, childCount: children?.length || 0, petCount: pets?.length || 0 });

      // Phase 1: Geocode (~1-2s)
      let t0 = Date.now();
      const coords = await geocodeLocationFn(destination);
      throwIfClientClosed();
      timing.geocode = Date.now() - t0;
      const resolvedCountry = coords.countryCode || "US";
      const tripDuration = inclusiveDayCount(startDate, endDate);

      if (!send("destination", {
        destination: coords.displayName || destination,
        lat: coords.lat,
        lon: coords.lon,
        jurisdictionCode: coords.stateCode || null,
        jurisdictionName: coords.stateName || null,
        countryCode: resolvedCountry,
        regionCode: coords.regionCode || null,
        startDate,
        endDate,
        duration: tripDuration,
        activities: safeActivities,
        children,
      })) {
        throwIfClientClosed();
      }

      // Phase 2: Weather (~1-3s)
      t0 = Date.now();
      const weather = await getWeatherForecastFn(
        coords.lat, coords.lon, resolvedCountry, startDate, endDate,
      );
      throwIfClientClosed();
      timing.weather = Date.now() - t0;
      if (!send("weather", { weather })) {
        throwIfClientClosed();
      }

      // Phase 3: AI itinerary only on the hot path (~10-20s)
      const foodPreferences = sanitizeFoodPreferences(req.body?.foodPreferences);
      const planningContext = await resolvePlanningContext(req, sanitizedData, foodPreferences);
      const cachedAttractions = await loadCachedAttractionsForTrip(attractionMemoryService, {
        destination,
        startDate,
        endDate,
        coords,
        countryCode: resolvedCountry,
        children,
        activities: safeActivities,
        pets,
        planningContext,
      });
      throwIfClientClosed();
      log.info("stream:attractions", { reqId, cachedAttractionCount: cachedAttractions.length });
      const tripPayload = {
        destination, startDate, endDate,
        activities: safeActivities, children, pets, foodPreferences,
        plannerSummary: planningContext.plannerSummary,
        cachedAttractions,
      };

      // Determine if we need chunked generation (trips > 7 days)
      const chunks = computeChunks(startDate, endDate);
      const needsChunking = chunks.length > 1;

      t0 = Date.now();

      // Generate itinerary (chunked for long trips, single for short)
      let firstChunkSent = false;
      let fullTripPlan = null;

      try {
        fullTripPlan = await generateTripPlanChunkedFn(
          tripPayload, weather,
          (chunkResult, meta) => {
            if (isClientClosed()) return;
            // Send each chunk as it completes
            let scheduled = null;
            try {
              const chunkStartDate = chunks[meta.chunk - 1]?.startDate || startDate;
              scheduled = scheduleItinerary(chunkResult, {}, chunkStartDate);
            } catch { /* non-fatal */ }

            if (!send("itinerary-chunk", {
              tripPlan: chunkResult,
              scheduledItinerary: scheduled,
              chunk: meta.chunk,
              totalChunks: meta.totalChunks,
              dayOffset: meta.dayOffset,
            })) {
              throwIfClientClosed();
            }

            if (!firstChunkSent) {
              firstChunkSent = true;
              timing.firstChunk = Date.now() - t0;
            }
          },
          { shouldAbort: isClientClosed },
        );
      } catch (err) {
        if (err.name === "AbortError" || isClientClosed()) {
          return res.end();
        }
        log.error("stream:itinerary-fail", { reqId, error: err.message });
        send("error", { message: "Failed to generate itinerary. Please try again." });
        return res.end();
      }

      throwIfClientClosed();
      timing.ai = Date.now() - t0;

      timing.total = Date.now() - streamStart;
      log.info("stream:done", { reqId, destination, timing });
      metrics.recordTrip({
        destination, duration: tripDuration, timing,
        childCount: children?.length || 0,
        childAges: (children || []).map(c => c.age).filter(Boolean),
        petCount: pets?.length || 0,
        petTypes: (pets || []).map(p => p.type).filter(Boolean),
        vibe: safeActivities?.[0] || "",
        reqId,
      });

      persistTripAttractionsInBackground(attractionMemoryService, {
        destination,
        coords,
        countryCode: resolvedCountry,
        tripPlan: fullTripPlan,
      });

      send("done", {});
      res.end();
    } catch (error) {
      if (error.name === "AbortError" || isClientClosed()) {
        try { res.end(); } catch { /* ignore */ }
        return;
      }
      timing.total = Date.now() - streamStart;
      log.error("stream:error", { reqId, error: error.message, timing });
      try {
        if (error.message?.includes("Location not found") || error.message?.includes("geocode")) {
          send("error", { message: "Could not find that location. Please try a more specific address." });
        } else {
          send("error", { message: "Failed to generate trip plan. Please try again." });
        }
      } catch { /* response may already be closed */ }
      try { res.end(); } catch { /* ignore */ }
    } finally {
      cleanupStreamListeners();
    }
  });

  // POST /api/v1/trip/replan
  // Regenerates ONLY the trip itinerary (no geocoding or weather fetch).
  // Used when the user customizes activities after the initial plan is generated.
  // Requires: destination, startDate, endDate, activities, children, weather (cached).
  app.post("/api/v1/trip/replan", optionalAuth, aiLimiter, async (req, res) => {
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

      const { destination, startDate, endDate, activities, children, pets } = sanitizedData;

      // weather must be provided by the client — we skip geocoding and weather fetch.
      const rawWeather = req.body.weather;
      if (!rawWeather || !Array.isArray(rawWeather.forecast)) {
        return v1Error(res, 400, {
          code: "VALIDATION_ERROR",
          message: "weather object with forecast array is required for replan",
          category: "validation",
          retryable: false,
          requestId,
        });
      }
      // Sanitize client-supplied weather to prevent prompt injection via summary/condition fields
      const weather = {
        summary: sanitizeString(rawWeather.summary || "", 500),
        forecast: rawWeather.forecast.slice(0, 14).map((f) => ({
          name: sanitizeString(f.name || "", 50),
          high: Number.isFinite(Number(f.high)) ? Number(f.high) : null,
          low: Number.isFinite(Number(f.low)) ? Number(f.low) : null,
          condition: sanitizeString(f.condition || "", 100),
          precipitation: Math.max(0, Math.min(100, parseInt(f.precipitation) || 0)),
        })),
      };

      const foodPreferences = sanitizeFoodPreferences(req.body?.foodPreferences);
      const planningContext = await resolvePlanningContext(req, sanitizedData, foodPreferences);
      const cachedAttractions = await loadCachedAttractionsForTrip(attractionMemoryService, {
        destination,
        startDate,
        endDate,
        coords: {
          displayName: destination,
          countryCode: req.body?.countryCode || "US",
          regionCode: req.body?.regionCode || null,
        },
        countryCode: req.body?.countryCode || "US",
        children,
        activities,
        pets,
        planningContext,
      });

      devLog("v1/trip/replan: regenerating itinerary with activities:", activities);
      const tripPlan = await generateTripPlanFn(
        {
          destination,
          startDate,
          endDate,
          activities,
          children,
          pets,
          foodPreferences,
          plannerSummary: planningContext.plannerSummary,
          cachedAttractions,
        },
        weather,
      );

      persistTripAttractionsInBackground(attractionMemoryService, {
        destination,
        coords: {
          displayName: destination,
          countryCode: req.body?.countryCode || "US",
          regionCode: req.body?.regionCode || null,
        },
        countryCode: req.body?.countryCode || "US",
        tripPlan,
      });

      return res.json({ requestId, tripPlan });
    } catch (error) {
      devLog("Error in /api/v1/trip/replan:", error);
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
  app.post("/api/v1/trip/packing", optionalAuth, aiLimiter, async (req, res) => {
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

      const { destination, startDate, endDate, activities, children, pets } = sanitizedData;
      const foodPreferences = sanitizeFoodPreferences(req.body?.foodPreferences);
      const planningContext = await resolvePlanningContext(req, sanitizedData, foodPreferences);

      devLog("v1/trip/packing: geocoding...");
      const coords = await geocodeLocationFn(destination);
      const resolvedCountry = coords.countryCode || "US";
      const weather = await getWeatherForecastFn(coords.lat, coords.lon, resolvedCountry, startDate, endDate);
      const packingList = await generatePackingListFn(
        {
          destination,
          startDate,
          endDate,
          activities,
          children,
          pets,
          foodPreferences,
          plannerSummary: planningContext.plannerSummary,
        },
        weather,
      );

      // Add shopLinks to each item in each category
      if (packingList?.categories) {
        for (const category of packingList.categories) {
          category.items = category.items.map(item => ({
            ...item,
            shopLinks: item.searchQuery ? buildShopLinks(item.searchQuery) : [],
          }));
        }
      }

      const tripDuration = inclusiveDayCount(startDate, endDate);
      if (new Date(endDate) < new Date(startDate)) {
        return res.status(400).json({ error: "End date must be after start date." });
      }

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
      devLog("Error in /api/v1/trip/packing:", error);
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
      devLog("Error in /api/v1/safety/car-seat-check:", error);
      return v1Error(res, 500, {
        code: "SAFETY_CHECK_FAILED",
        message: "Failed to retrieve car seat guidance. Please try again.",
        category: "server",
        retryable: true,
        requestId,
      });
    }
  });

  // POST /api/v1/safety/pet-travel-check
  // Returns airline eligibility + international entry requirements for traveling with pets.
  app.post("/api/v1/safety/pet-travel-check", apiLimiter, async (req, res) => {
    const requestId = crypto.randomUUID();
    try {
      // Validate and sanitize pets array
      const rawPets = req.body?.pets;
      if (!Array.isArray(rawPets) || rawPets.length === 0) {
        return v1Error(res, 422, {
          code: "MISSING_PETS",
          message: "At least one pet is required for pet travel guidance.",
          category: "validation",
          retryable: false,
          requestId,
        });
      }

      const pets = sanitizePets(rawPets);
      if (pets.length === 0) {
        return v1Error(res, 422, {
          code: "INVALID_PETS",
          message: "No valid pets found after sanitization.",
          category: "validation",
          retryable: false,
          requestId,
        });
      }

      // Validate travelMode — default to "drive" if not provided
      const rawMode = req.body?.travelMode;
      const travelMode = ["fly", "drive"].includes(rawMode) ? rawMode : "drive";

      const destination = sanitizeString(req.body?.destination || "", 200);
      const countryCode = sanitizeString(req.body?.countryCode || "US", 2).toUpperCase();
      const startDate = sanitizeString(req.body?.startDate || "", 20);

      const guidance = await getPetTravelGuidanceFn(pets, {
        destination,
        travelMode,
        countryCode,
        startDate,
      });

      return res.json({
        requestId,
        ...guidance,
      });
    } catch (error) {
      devLog("Error in /api/v1/safety/pet-travel-check:", error);
      return v1Error(res, 500, {
        code: "PET_SAFETY_FAILED",
        message: "Failed to retrieve pet travel guidance. Please try again.",
        category: "server",
        retryable: true,
        requestId,
      });
    }
  });

  // GET /api/v1/safety/travel-advisory/:countryCode
  // Returns US State Dept travel advisory for a country. Graceful: returns null if unavailable.
  app.get("/api/v1/safety/travel-advisory/:countryCode", apiLimiter, async (req, res) => {
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
      devLog("Error in /api/v1/safety/travel-advisory:", error);
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
  app.get("/api/v1/safety/neighborhood", apiLimiter, async (req, res) => {
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
      devLog("Error in /api/v1/safety/neighborhood:", error);
      return v1Error(res, 500, {
        code: "SAFETY_FAILED",
        message: "Failed to fetch neighborhood safety data.",
        category: "server",
        retryable: true,
        requestId,
      });
    }
  });

  // ─── Parse natural language trip input ───
  app.post("/api/v1/trip/parse-input", aiLimiter, async (req, res) => {
    const t0 = Date.now();
    const reqId = req.reqId || crypto.randomUUID().slice(0, 8);
    try {
      const { text, detectedLat, detectedLon, clientDate } = req.body;
      if (!text || typeof text !== "string" || text.trim().length === 0) {
        return res.status(422).json({ error: "text is required" });
      }
      // SECURITY: Sanitize user text before AI prompt (prompt injection defense)
      const sanitizedText = sanitizeDestination(String(text).trim());
      if (!sanitizedText) return res.status(422).json({ error: "text is required" });

      log.info("parse-input:start", { reqId, textLen: sanitizedText.length, text: sanitizedText.slice(0, 100) });

      let detectedRegion = null;
      // SECURITY: Validate lat/lon as numeric to prevent SSRF via URL parameter injection
      const parsedLat = parseFloat(detectedLat);
      const parsedLon = parseFloat(detectedLon);
      if (Number.isFinite(parsedLat) && Number.isFinite(parsedLon)
          && parsedLat >= -90 && parsedLat <= 90
          && parsedLon >= -180 && parsedLon <= 180) {
        try {
          const geoT0 = Date.now();
          const params = new URLSearchParams({
            lat: parsedLat.toFixed(6),
            lon: parsedLon.toFixed(6),
            format: "json",
          });
          const geoRes = await fetch(
            `https://nominatim.openstreetmap.org/reverse?${params}`,
            { headers: { "User-Agent": "SproutRoute/1.0" } }
          );
          if (geoRes.ok) {
            const geoData = await geoRes.json();
            const addr = geoData.address || {};
            detectedRegion = [addr.city || addr.town, addr.state].filter(Boolean).join(", ");
          }
          log.info("parse-input:geo", { reqId, ms: Date.now() - geoT0, region: detectedRegion });
        } catch { /* silent — region is optional */ }
      }
      // Pass client's local date for timezone-correct relative date parsing
      const safeClientDate = /^\d{4}-\d{2}-\d{2}$/.test(clientDate) ? clientDate : null;
      const result = await parseInput(sanitizedText, { detectedRegion, clientDate: safeClientDate });
      const parseMs = Date.now() - t0;
      log.info("parse-input:done", { reqId, ms: parseMs, destination: result?.destination });
      metrics.recordSearch({
        text: sanitizedText.slice(0, 100),
        destination: result?.destination,
        vibe: result?.vibe,
        childCount: result?.childrenAges?.length || 0,
        petCount: result?.pets?.length || 0,
        ms: parseMs,
      });
      res.json(result);
    } catch (err) {
      log.error("parse-input:error", { reqId, error: err.message, ms: Date.now() - t0 });
      res.status(500).json({ error: "Failed to parse trip input" });
    }
  });

  // ─── Enrich activity with Google Places data ───
  app.post("/api/v1/places/enrich", apiLimiter, async (req, res) => {
    try {
      const activityName = sanitizeString(req.body?.activityName || "", 100);
      const enrichDest = sanitizeString(req.body?.destination || "", 120);
      const category = sanitizeString(req.body?.category || "", 50);
      if (!activityName || !enrichDest) {
        return res.status(422).json({ error: "activityName and destination required" });
      }
      const result = await enrichActivity(activityName, enrichDest, category);
      if (!result) return res.json(null);
      res.json(result);
    } catch (err) {
      log.error("places enrich error", { error: err.message });
      res.status(500).json({ error: "Failed to enrich activity" });
    }
  });

  // ─── Proxy Google Places photo (keeps API key server-side) ───
  app.get("/api/v1/places/photo", apiLimiter, async (req, res) => {
    try {
      const ref = req.query.ref;
      const apiKey = process.env.GOOGLE_PLACES_API_KEY;
      if (!ref || !apiKey) return res.status(400).send("Missing ref or API key");
      // SECURITY: Validate ref matches expected Google Places photo reference format
      if (!/^places\/[A-Za-z0-9_-]+\/photos\/[A-Za-z0-9_-]+$/.test(ref)) {
        return res.status(400).send("Invalid photo reference");
      }
      const photoUrl = `https://places.googleapis.com/v1/${ref}/media?maxWidthPx=800&key=${apiKey}`;
      const photoRes = await fetch(photoUrl);
      if (!photoRes.ok) return res.status(photoRes.status).send("Photo not found");
      res.set("Content-Type", photoRes.headers.get("content-type") || "image/jpeg");
      res.set("Cache-Control", "public, max-age=86400");
      const buffer = Buffer.from(await photoRes.arrayBuffer());
      res.send(buffer);
    } catch (err) {
      log.error("photo proxy error", { error: err.message });
      res.status(500).send("Photo proxy error");
    }
  });

  // ─── IP geolocation proxy (HTTPS — privacy-safe) ───
  app.get("/api/v1/geo/detect", apiLimiter, async (req, res) => {
    try {
      const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.ip;
      // Validate IP format before external call
      if (!/^[\d.:a-fA-F]+$/.test(ip)) {
        return res.json({ lat: null, lon: null, region: null });
      }
      const geoRes = await fetch(
        `https://ipapi.co/${encodeURIComponent(ip)}/json/`,
        { headers: { "User-Agent": "SproutRoute/1.0" }, signal: AbortSignal.timeout(3000) }
      );
      if (!geoRes.ok) return res.json({ lat: null, lon: null, region: null });
      const data = await geoRes.json();
      res.json({
        lat: data.latitude || null,
        lon: data.longitude || null,
        region: [data.city, data.region].filter(Boolean).join(", ") || null,
      });
    } catch {
      res.json({ lat: null, lon: null, region: null });
    }
  });

  // ─── Profile API routes ─────────────────────────────────────────────────────

  // GET /api/v1/profile/me — get current user's profile
  app.get("/api/v1/profile/me", requireAuth, async (req, res) => {
    try {
      const db = supabaseForUser(req.headers.authorization);
      const { data, error } = await db
        .from("profiles")
        .select("*")
        .eq("user_id", req.user.id)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      if (!data) return res.json({ profile: null });

      res.json({ profile: data.profile_json, summary: data.profile_summary, version: data.version });
    } catch (err) {
      log.error("profile:get-error", { error: err.message, userId: req.user.id?.slice(0, 8) });
      res.status(500).json({ error: "Failed to load profile" });
    }
  });

  // PUT /api/v1/profile/me — create or update profile
  app.put("/api/v1/profile/me", requireAuth, async (req, res) => {
    try {
      const { profile, summary } = req.body;
      if (!profile || typeof profile !== "object") {
        return res.status(422).json({ error: "profile object is required" });
      }

      const db = supabaseForUser(req.headers.authorization);
      const admin = getSupabaseAdmin();
      await ensureUserRecord(admin, req.user);

      // Get current version
      const { data: existing } = await db
        .from("profiles")
        .select("id, version")
        .eq("user_id", req.user.id)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle();

      const newVersion = (existing?.version || 0) + 1;

      if (existing) {
        // Update existing profile
        const { error } = await db
          .from("profiles")
          .update({
            version: newVersion,
            profile_json: profile,
            profile_summary: summary || "",
            updated_at: new Date().toISOString(),
          })
          .eq("id", existing.id);

        if (error) throw error;
      } else {
        // Create new profile
        const { error } = await db
          .from("profiles")
          .insert({
            user_id: req.user.id,
            version: newVersion,
            profile_json: profile,
            profile_summary: summary || "",
            source: "manual",
          });

        if (error) throw error;
      }

      // Save revision — validate change_source and cap changeSummary
      const VALID_CHANGE_SOURCES = new Set(["user_edit", "import", "feedback", "merge"]);
      const changeSource = VALID_CHANGE_SOURCES.has(req.body.source) ? req.body.source : "user_edit";
      const changeSummary = sanitizeString(req.body.changeSummary || "Profile updated", 200);

      // Fetch the profile ID (needed for first save where existing is null)
      let profileId = existing?.id;
      if (!profileId) {
        const { data: newProfile } = await db
          .from("profiles")
          .select("id")
          .eq("user_id", req.user.id)
          .order("version", { ascending: false })
          .limit(1)
          .maybeSingle();
        profileId = newProfile?.id;
      }

      if (profileId) {
        const { error: revisionError } = await admin
          .from("profile_revisions")
          .insert({
            profile_id: profileId,
            version: newVersion,
            change_source: changeSource,
            change_summary: changeSummary,
            profile_json: profile,
          });
        if (revisionError) throw revisionError;
      }

      log.info("profile:saved", { userId: req.user.id?.slice(0, 8), version: newVersion });
      res.json({ version: newVersion, saved: true });
    } catch (err) {
      log.error("profile:save-error", { error: err.message, userId: req.user.id?.slice(0, 8) });
      res.status(500).json({ error: "Failed to save profile" });
    }
  });

  // DELETE /api/v1/profile/me — delete profile
  app.delete("/api/v1/profile/me", requireAuth, async (req, res) => {
    try {
      const db = supabaseForUser(req.headers.authorization);
      const { error } = await db
        .from("profiles")
        .delete()
        .eq("user_id", req.user.id);

      if (error) throw error;
      log.info("profile:deleted", { userId: req.user.id?.slice(0, 8) });
      res.json({ deleted: true });
    } catch (err) {
      log.error("profile:delete-error", { error: err.message, userId: req.user.id?.slice(0, 8) });
      res.status(500).json({ error: "Failed to delete profile" });
    }
  });

  // POST /api/v1/profile/import/validate — validate pasted JSON (no auth required)
  app.post("/api/v1/profile/import/validate", apiLimiter, async (req, res) => {
    try {
      const { rawText } = req.body;
      if (!rawText || typeof rawText !== "string") {
        return res.status(422).json({ error: "rawText is required" });
      }
      if (rawText.length > 50000) {
        return res.status(413).json({ error: "rawText is too large" });
      }

      let parsed;
      try {
        parsed = parsePastedProfileJson(rawText);
      } catch {
        return res.json({
          valid: false,
          errors: ["Invalid JSON format. Please paste valid JSON."],
          warnings: [],
          detectedFormat: "unknown",
        });
      }

      // Basic validation — check if it has any recognizable profile fields
      const knownFields = ["food_preferences", "travel_style", "activity_preferences",
        "personality_profile", "family_context", "constraints", "trip_priorities",
        "food", "travelStyle", "activities", "personality", "family", "priorities"];

      const foundFields = Object.keys(parsed).filter(k => knownFields.includes(k));
      const warnings = [];

      if (foundFields.length === 0) {
        return res.json({
          valid: false,
          errors: ["No recognized profile fields found. Expected fields like food_preferences, travel_style, etc."],
          warnings: [],
          detectedFormat: "unknown",
        });
      }

      if (foundFields.length < 3) {
        warnings.push("Missing sections were filled with defaults during validation preview.");
      }

      res.json({
        valid: true,
        errors: [],
        warnings,
        detectedFormat: "external_profile_v1",
      });
    } catch (err) {
      log.error("profile:validate-error", { error: err.message });
      res.status(500).json({ error: "Validation failed" });
    }
  });

  // POST /api/v1/profile/import/normalize — normalize external JSON to internal schema
  app.post("/api/v1/profile/import/normalize", apiLimiter, async (req, res) => {
    try {
      const { providerHint, rawText } = req.body;
      if (!rawText || typeof rawText !== "string") {
        return res.status(422).json({ error: "rawText is required" });
      }
      if (rawText.length > 50000) {
        return res.status(413).json({ error: "rawText is too large" });
      }

      let parsed;
      try {
        parsed = parsePastedProfileJson(rawText);
      } catch {
        return res.status(422).json({ error: "Invalid JSON" });
      }

      // Normalize external format to internal UserTravelProfile shape
      const now = new Date().toISOString();
      const defaultMeta = (conf = "medium", src = ["inference"]) => ({
        confidence: conf,
        sourceBasis: src,
        updatedAt: now,
      });

      const fp = parsed.food_preferences || parsed.food || {};
      const ts = parsed.travel_style || parsed.travelStyle || {};
      const ap = parsed.activity_preferences || parsed.activities || {};
      const pp = parsed.personality_profile || parsed.personality || {};
      const fc = parsed.family_context || parsed.family || {};
      const cp = parsed.constraints || {};
      const tp = parsed.trip_priorities || parsed.priorities || {};

      const normalizedProfile = {
        food: {
          cuisinesLiked: fp.cuisines_liked || fp.cuisinesLiked || [],
          cuisinesDisliked: fp.cuisines_disliked || fp.cuisinesDisliked || [],
          dietaryRestrictions: fp.dietary_restrictions || fp.dietaryRestrictions || [],
          kidFoods: fp.kid_foods || fp.kidFoods || [],
          foodAdventurousness: fp.food_adventurousness || fp.foodAdventurousness || "unknown",
          notes: fp.notes || "",
          meta: defaultMeta(fp.confidence, fp.source_basis || fp.sourceBasis),
        },
        travelStyle: {
          pace: ts.pace || "unknown",
          planningStyle: ts.planning_style || ts.planningStyle || "unknown",
          accommodationPreference: ts.accommodation_preference || ts.accommodationPreference || "",
          transportPreference: ts.transport_preference || ts.transportPreference || "",
          notes: ts.notes || "",
          meta: defaultMeta(ts.confidence, ts.source_basis || ts.sourceBasis),
        },
        activities: {
          preferredActivities: ap.preferred_activities || ap.preferredActivities || [],
          dislikedActivities: ap.disliked_activities || ap.dislikedActivities || [],
          activityIntensity: ap.activity_intensity || ap.activityIntensity || "unknown",
          notes: ap.notes || "",
          meta: defaultMeta(ap.confidence, ap.source_basis || ap.sourceBasis),
        },
        personality: {
          travelerType: pp.traveler_type || pp.travelerType || "",
          noveltyVsComfort: pp.novelty_vs_comfort ?? pp.noveltyVsComfort ?? null,
          crowdTolerance: pp.crowd_tolerance || pp.crowdTolerance || "unknown",
          notes: pp.notes || "",
          meta: defaultMeta(pp.confidence, pp.source_basis || pp.sourceBasis),
        },
        family: {
          travelingWith: fc.traveling_with || fc.travelingWith || "",
          kidsDetails: fc.kids_details || fc.kidsDetails || "",
          kidPreferences: fc.kid_preferences || fc.kidPreferences || "",
          petContext: fc.pet_context || fc.petContext || "",
          notes: fc.notes || "",
          meta: defaultMeta(fc.confidence, fc.source_basis || fc.sourceBasis),
        },
        constraints: {
          budgetRange: cp.budget_range || cp.budgetRange || "",
          timeConstraints: cp.time_constraints || cp.timeConstraints || "",
          accessibilityNeeds: cp.accessibility_needs || cp.accessibilityNeeds || "",
          notes: cp.notes || "",
          meta: defaultMeta(cp.confidence, cp.source_basis || cp.sourceBasis),
        },
        priorities: {
          mustHaves: tp.must_haves || tp.mustHaves || [],
          avoidances: tp.avoidances || [],
          notes: tp.notes || "",
          meta: defaultMeta(tp.confidence, tp.source_basis || tp.sourceBasis),
        },
        profileSummary: parsed.profile_summary || parsed.profileSummary || "",
        unknowns: parsed.unknowns || [],
      };

      res.json({ normalizedProfile, providerHint: providerHint || "other" });
    } catch (err) {
      log.error("profile:normalize-error", { error: err.message });
      res.status(500).json({ error: "Normalization failed" });
    }
  });

  // ─── Feedback endpoint (Phase 7) ───────────────────────────────────────────

  // POST /api/v1/profile/me/feedback — store user feedback signal
  app.post("/api/v1/profile/me/feedback", requireAuth, async (req, res) => {
    try {
      const { tripRequestId, signalType, payload } = req.body;
      if (!signalType || !["more_like_this", "less_like_this", "save_as_preference"].includes(signalType)) {
        return res.status(422).json({ error: "signalType must be more_like_this, less_like_this, or save_as_preference" });
      }
      if (!tripRequestId) {
        return res.status(422).json({ error: "tripRequestId is required" });
      }

      const admin = getSupabaseAdmin();
      await ensureUserRecord(admin, req.user);
      const { error } = await admin
        .from("trip_feedback")
        .insert({
          user_id: req.user.id,
          trip_request_id: tripRequestId,
          signal_type: signalType,
          payload_json: payload || {},
        });

      if (error) throw error;

      log.info("feedback:saved", { userId: req.user.id?.slice(0, 8), signalType, tripRequestId });
      res.json({ saved: true });
    } catch (err) {
      log.error("feedback:save-error", { error: err.message, userId: req.user?.id?.slice(0, 8) });
      res.status(500).json({ error: "Failed to save feedback" });
    }
  });

  // ─── Attraction Intelligence endpoints (Phase 6) ──────────────────────────

  // POST /api/v1/attractions/rank — rank attractions for a city based on trip context
  app.post("/api/v1/attractions/rank", apiLimiter, async (req, res) => {
    try {
      const cityName = sanitizeString(req.body?.cityName || "", 100);
      if (!cityName) return res.status(422).json({ error: "cityName is required" });
      const safeCountryCode = sanitizeString(req.body?.countryCode || "US", 2).toUpperCase();
      const safePace = sanitizeString(req.body?.pace || "", 20);
      const safeVibe = sanitizeString(req.body?.vibe || "", 50);
      const safeLimit = Math.min(Math.max(1, parseInt(req.body?.limit) || 20), 50);
      const rawAges = Array.isArray(req.body?.childrenAges) ? req.body.childrenAges : [];
      const safeAges = rawAges.map(a => parseInt(String(a), 10)).filter(n => Number.isFinite(n) && n >= 0 && n <= 18);
      const attractions = await attractionMemoryService.getPlanningCandidates({
        destination: cityName,
        coords: { displayName: cityName, countryCode: safeCountryCode },
        countryCode: safeCountryCode,
        childrenAges: safeAges,
        requestedActivities: safeVibe ? [safeVibe] : [],
        pace: safePace,
        maxResults: safeLimit,
      });

      res.json({
        attractions: attractions || [],
        city: attractions?.length > 0 ? { name: cityName } : null,
        source: attractions?.length > 0 ? "attraction_memory" : "no_precomputed_data",
      });
    } catch (err) {
      log.error("attractions:rank-error", { error: err.message });
      res.status(500).json({ error: "Failed to rank attractions" });
    }
  });

  // GET /api/v1/attractions/city/:cityId — get all attractions for a city
  app.get("/api/v1/attractions/city/:cityId", apiLimiter, async (req, res) => {
    try {
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(req.params.cityId)) {
        return res.status(400).json({ error: "Invalid cityId format" });
      }
      const admin = getSupabaseAdmin();
      const { data, error } = await admin
        .from("city_attractions")
        .select("*, city_attraction_tags(*)")
        .eq("city_id", req.params.cityId)
        .order("kid_appeal_score", { ascending: false });

      if (error) throw error;
      // Strip internal scoring/operational fields before returning
      const publicAttractions = (data || []).map(({ llm_notes, confidence_score, times_seen, last_seen_at, source_type, why_recommended, timing_tip, ...pub }) => pub);
      res.json({ attractions: publicAttractions });
    } catch (err) {
      log.error("attractions:city-error", { error: err.message });
      res.status(500).json({ error: "Failed to fetch attractions" });
    }
  });

  // POST /api/v1/attractions/verify — verify an attraction via Google Places
  app.post("/api/v1/attractions/verify", requireAuth, apiLimiter, async (req, res) => {
    try {
      const { attractionId } = req.body;
      if (!attractionId) return res.status(422).json({ error: "attractionId is required" });
      res.status(501).json({
        error: "Attraction verification is not enabled until Google Places verification is implemented server-side.",
        attractionId,
      });
    } catch (err) {
      log.error("attractions:verify-error", { error: err.message });
      res.status(500).json({ error: "Failed to verify attraction" });
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
    if (!process.env.AMAZON_AFFILIATE_TAG) {
      console.warn("⚠️  AMAZON_AFFILIATE_TAG not set — affiliate links will work but won't earn commission");
    }
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
