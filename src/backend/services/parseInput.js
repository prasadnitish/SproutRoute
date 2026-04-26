// src/backend/services/parseInput.js
import { callModel } from "../utils/aiClient.js";

const fmt = (d) => d.toISOString().split("T")[0];
const PARSE_MAX_TOKENS = 1200;

const VALID_PACES = new Set(["slow", "moderate", "fast"]);
const VALID_TRIP_SHAPES = new Set(["single_destination", "multi_stop", "country_tour"]);
const VALID_STOP_ROLES = new Set(["must_visit", "suggested", "transit"]);
const COUNTRY_TOUR_DEFAULTS = {
  europe: { country: "Europe", countryCode: null, stops: ["Amsterdam", "Berlin", "Budapest", "Prague", "Vienna", "Athens", "Barcelona", "Paris"] },
  "eastern europe": { country: "Eastern Europe", countryCode: null, stops: ["Prague", "Vienna", "Budapest", "Krakow", "Bratislava", "Ljubljana", "Zagreb", "Split"] },
  japan: { country: "Japan", countryCode: "JP", stops: ["Tokyo", "Kyoto", "Osaka", "Hakone"] },
  italy: { country: "Italy", countryCode: "IT", stops: ["Rome", "Florence", "Venice", "Milan"] },
  france: { country: "France", countryCode: "FR", stops: ["Paris", "Lyon", "Provence", "Nice"] },
  spain: { country: "Spain", countryCode: "ES", stops: ["Madrid", "Seville", "Granada", "Barcelona"] },
  greece: { country: "Greece", countryCode: "GR", stops: ["Athens", "Santorini", "Crete"] },
  usa: { country: "United States", countryCode: "US", stops: ["San Francisco", "Monterey", "Los Angeles", "San Diego"] },
  "united states": { country: "United States", countryCode: "US", stops: ["San Francisco", "Monterey", "Los Angeles", "San Diego"] },
  portugal: { country: "Portugal", countryCode: "PT", stops: ["Lisbon", "Porto", "Algarve"] },
  thailand: { country: "Thailand", countryCode: "TH", stops: ["Bangkok", "Chiang Mai", "Phuket"] },
};

const normalizeStringArray = (value, maxLength = 8) =>
  Array.isArray(value)
    ? value
      .map((item) => (typeof item === "string" ? item.trim() : String(item || "").trim()))
      .filter(Boolean)
      .slice(0, maxLength)
    : [];

const slugifyStopId = (value, index) => {
  const id = String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return id || `stop-${index + 1}`;
};

const normalizePlaceKey = (value) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b(japan|italy|france|spain|usa|united states|uk|united kingdom)\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

function dedupeByName(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = normalizePlaceKey(item?.name || item);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeSuggestedDestinations(value) {
  if (!Array.isArray(value)) return [];
  return dedupeByName(value
    .map((suggestion) => {
      const source = suggestion && typeof suggestion === "object" ? suggestion : { name: suggestion };
      const name = typeof source.name === "string" ? source.name.trim() : String(source.name || "").trim();
      if (!name) return null;
      return {
        name,
        ...(source.emoji ? { emoji: String(source.emoji) } : {}),
        ...(source.description ? { description: String(source.description).trim() } : {}),
        ...(source.season_note ? { season_note: String(source.season_note).trim() } : {}),
      };
    })
    .filter(Boolean))
    .slice(0, 3);
}

function normalizeStops(value) {
  if (!Array.isArray(value)) return [];
  return dedupeByName(value
    .map((stop, index) => {
      const source = stop && typeof stop === "object" ? stop : { name: stop };
      const name = typeof source.name === "string" ? source.name.trim() : String(source.name || "").trim();
      if (!name) return null;
      const requestedNights = Number(source.requestedNights);
      return {
        id: typeof source.id === "string" && source.id.trim()
          ? slugifyStopId(source.id, index)
          : slugifyStopId(name, index),
        name,
        ...(source.countryCode ? { countryCode: String(source.countryCode).trim().toUpperCase() } : {}),
        role: VALID_STOP_ROLES.has(source.role) ? source.role : "must_visit",
        requestedNights: Number.isFinite(requestedNights) && requestedNights > 0
          ? Math.floor(requestedNights)
          : null,
        mustInclude: source.mustInclude ?? source.role === "must_visit",
        notes: normalizeStringArray(source.notes, 4),
      };
    })
    .filter(Boolean))
    .slice(0, 8);
}

function detectKnownCountryIntent(text, parsed) {
  const destination = String(parsed?.destination || "").trim().toLowerCase();
  const input = String(text || "").toLowerCase();
  const matched = Object.entries(COUNTRY_TOUR_DEFAULTS)
    .sort(([a], [b]) => b.length - a.length)
    .find(([key, config]) => {
    const countryMentioned = destination === key || input.match(new RegExp(`\\b${key}\\b`));
    if (!countryMentioned) return false;
    return !config.stops.some((stop) => input.match(new RegExp(`\\b${stop.toLowerCase()}\\b`)));
  });
  return matched?.[1] || null;
}

function buildCountryTourStops(countryConfig) {
  return countryConfig.stops.map((name, index) => ({
    id: slugifyStopId(name, index),
    name,
    countryCode: countryConfig.countryCode,
    role: "suggested",
    requestedNights: null,
    mustInclude: false,
    notes: [],
  }));
}

function normalizeCountryTour(value) {
  if (!value || typeof value !== "object") return null;
  const country = typeof value.country === "string" ? value.country.trim() : "";
  if (!country) return null;
  const suggestedStopCount = Number(value.suggestedStopCount);
  return {
    country,
    countryCode: value.countryCode ? String(value.countryCode).trim().toUpperCase() : null,
    requestedRegions: normalizeStringArray(value.requestedRegions, 8),
    suggestedStopCount: Number.isFinite(suggestedStopCount) && suggestedStopCount > 0
      ? Math.min(8, Math.floor(suggestedStopCount))
      : null,
  };
}

function defaultDates() {
  const start = new Date();
  start.setDate(start.getDate() + 14);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  return { startDate: fmt(start), endDate: fmt(end) };
}

const PARSE_PROMPT = (userText, region, clientDate = null) => `You are a trip planner assistant. Parse this trip request into structured JSON.

User input: "${userText}"
${region ? `User is located near: ${region}` : ""}
Current date: ${clientDate || new Date().toISOString().split("T")[0]}

Return ONLY valid JSON with these fields:
{
  "destination": "City, State/Country" or null if ambiguous/missing,
  "suggestedDestinations": [] or if destination is null, array of 3 suggestions: [{"name":"City, State","emoji":"🌴","description":"One line","season_note":"Weather note"}],
  "startDate": "YYYY-MM-DD" or null (guess from context like "spring break" → mid-April),
  "endDate": "YYYY-MM-DD" or null,
  "adults": number (default 2),
  "childrenAges": [numbers] or [],
  "vibe": one of "beach","adventure","theme_parks","international","cruise","camping","city","relaxing","general",
  "tripGoals": ["short strings about what this trip should achieve"] or [],
  "mustHaves": ["hard requirements or places to include"] or [],
  "avoidances": ["things to avoid"] or [],
  "pacePreference": "slow" | "moderate" | "fast" | "unknown",
  "budgetSignals": ["budget cues like budget, moderate, splurge"] or [],
  "accommodationPreferences": ["short phrases"] or [],
  "transportPreferences": ["short phrases"] or [],
  "accessibilityNeeds": ["short phrases"] or [],
  "scheduleConstraints": ["short phrases"] or [],
  "celebrationContext": "birthday | anniversary | reunion | etc" or null,
  "specialNotes": ["important notes"] or [],
  "extraContext": ["any additional useful context not captured above"] or [],
  "pets": [{"type":"dog"|"cat"|"bird"|"other","breed":"string or null","ageMonths":number or null,"weightLb":number or null,"name":"string or null"}] or [],
  "foodPreferences": {
    "dietary": [] (e.g. ["vegetarian","gluten-free","halal","kosher","vegan","dairy-free","nut-free"]),
    "cuisines": [] (e.g. ["italian","mexican","thai","seafood","local","bbq","sushi"]),
    "avoidances": [] (e.g. ["no spicy","no seafood","no pork"]),
    "kidFoods": [] (e.g. ["pizza","pasta","chicken nuggets","mac and cheese"]),
    "budget": "budget" | "moderate" | "fine_dining" | null
  },
  "tripShape": "single_destination" | "multi_stop" | "country_tour",
  "stops": [{"id":"slug","name":"City or region","countryCode":"ISO country code or null","role":"must_visit"|"suggested"|"transit","requestedNights":number or null,"mustInclude":true,"notes":["short warnings or clarifications"]}] or [],
  "countryTour": {"country":"Country name","countryCode":"ISO country code or null","requestedRegions":["regions or cities"],"suggestedStopCount":number or null} or null
}

Pet extraction rules:
- "with my dog" or "bringing our dog" → pets: [{"type":"dog"}]
- "3 month maltipoo" → pets: [{"type":"dog","breed":"Maltipoo","ageMonths":3}]
- "golden retriever puppy named Max, 20 lbs" → pets: [{"type":"dog","breed":"Golden Retriever","ageMonths":null,"weightLb":20,"name":"Max"}]
- "traveling with our cat" → pets: [{"type":"cat"}]
- "two dogs" → pets: [{"type":"dog"},{"type":"dog"}]
- If no pets mentioned, pets should be [].

Food preference extraction rules:
- "we're vegetarian" → dietary: ["vegetarian"]
- "kids love pizza" → kidFoods: ["pizza"]
- "no seafood" → avoidances: ["no seafood"]
- "looking for good sushi" → cuisines: ["sushi"]
- "budget-friendly food" → budget: "budget"
- "nice restaurants" or "fine dining" → budget: "fine_dining"
- If no food preferences mentioned, return foodPreferences with all empty arrays and null budget.

Route shape rules:
- Default tripShape to "single_destination" for normal one-place trips.
- If the user names 2+ stops/cities/regions to cover, set tripShape to "multi_stop" and preserve every named stop in user order.
- For "cover Amsterdam, Greece, Berlin, Budapest", return four stops in exactly that order. If a named place is broad like "Greece", keep it as a stop and add a note such as "Broad region; confirm exact city".
- If the user asks for a whole country trip such as "2 weeks in Japan", set tripShape to "country_tour", countryTour.country to "Japan", and suggest 3-5 realistic stops in stops.
- Do not drop a user-named place just because it is broad or ambiguous; preserve it and explain the uncertainty in notes.

Date interpretation rules:
- If the user says "in september" or "in June" without specific dates, default to a 7-day trip starting on the 1st of that month.
- If "spring break" → April 12-19 of the current year.
- If "next weekend" → the upcoming Saturday-Sunday (2 days).
- If "this summer" → July 1-8 of the current year.
- If "day trip" or "roadtrip" or "2-3 hour" → startDate = next Saturday, endDate = same day or next day (1-2 day trip).
- If no dates at all, default to 2 weeks from today for 5 days.
- CRITICAL: endDate must ALWAYS be after startDate. Never return an endDate before startDate.
- Match trip duration to the user's intent: day trips = 1-2 days, weekends = 2-3 days, vacations = 5-14 days.

Vibe interpretation rules:
- "mountain", "hiking", "trail", "nature" → vibe: "adventure"
- "beach", "ocean", "coast" → vibe: "beach"
- "city", "urban", "downtown" → vibe: "city"
- "theme park", "amusement", "disney" → vibe: "theme_parks"
- "roadtrip", "road trip", "drive" → vibe: "adventure"

Location-aware destination rules:
- If the user says "near me", "close by", "nearby", or "X hours away", use the detectedRegion to suggest 3 destinations within that radius.
- For "mountain near me" from Bellevue, WA → suggest Mt. Rainier, Snoqualmie Pass, North Cascades.
- For "beach near me" from Chicago → suggest Indiana Dunes, Saugatuck, Lake Geneva.
- ALWAYS provide 3 suggestedDestinations with emojis, descriptions, and season notes when destination is vague or relative.
- The suggestedDestinations MUST be real places reachable within the user's stated travel time from their location.

If "kids" or "children" mentioned without specific ages, default to childrenAges: [5] (one child, age 5).
If "toddler" mentioned without age, use age 2. If "baby" or "infant", use age 1. If "teenager" or "teen", use age 14.
If no kids or children mentioned at all, childrenAges should be [].
If the user explicitly names a destination like "San Diego", "Maui", or "Paris", destination must NOT be null.
If destination is vague ("beach trip", "somewhere warm", "near me", "mountain nearby"), set destination to null and provide 3 suggestedDestinations based on the user's location and season.`;

export async function parseInput(text, deps = {}) {
  const callAI = deps.callAI || (async (promptText) => {
    const { responseText } = await callModel({
      system: "You are a trip planner assistant. Return ONLY valid JSON, no markdown or explanation.",
      user: promptText,
      caller: "parseInput",
      provider: "openai",
      model: "gpt-5.4-nano",
      maxTokens: PARSE_MAX_TOKENS,
      temperature: 0,
    });
    return responseText;
  });
  const detectedRegion = deps.detectedRegion || null;
  const clientDate = deps.clientDate || null;

  const prompt = PARSE_PROMPT(text, detectedRegion, clientDate);
  const raw = await callAI(prompt);

  const defaults = defaultDates();
  const emptyFood = { dietary: [], cuisines: [], avoidances: [], kidFoods: [], budget: null };

  let parsed;
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    parsed = JSON.parse(jsonMatch ? jsonMatch[0] : raw);
  } catch {
    return {
      destination: null,
      suggestedDestinations: [],
      ...defaults,
      adults: 2,
      childrenAges: [],
      pets: [],
      vibe: "general",
      tripGoals: [],
      mustHaves: [],
      avoidances: [],
      pacePreference: "unknown",
      budgetSignals: [],
      accommodationPreferences: [],
      transportPreferences: [],
      accessibilityNeeds: [],
      scheduleConstraints: [],
      celebrationContext: null,
      specialNotes: [],
      extraContext: [],
      foodPreferences: emptyFood,
      detectedRegion,
      tripShape: "single_destination",
      stops: [],
      countryTour: null,
    };
  }

  const fp = parsed.foodPreferences || {};

  // ── Post-parse date correction ──────────────────────────────────────────
  let startDate = parsed.startDate || defaults.startDate;
  let endDate = parsed.endDate || defaults.endDate;

  const startMs = new Date(startDate).getTime();
  const endMs = new Date(endDate).getTime();

  // Fix: endDate before startDate
  if (Number.isFinite(startMs) && Number.isFinite(endMs) && endMs <= startMs) {
    endDate = new Date(startMs + 7 * 86400000).toISOString().split("T")[0];
  }

  // Fix: duration too long (>21 days) — cap at 7 days
  if (Number.isFinite(startMs) && Number.isFinite(endMs)) {
    const days = (new Date(endDate).getTime() - new Date(startDate).getTime()) / 86400000;
    if (days > 21) {
      endDate = new Date(new Date(startDate).getTime() + 7 * 86400000).toISOString().split("T")[0];
    }
  }

  const suggestedDestinations = normalizeSuggestedDestinations(parsed.suggestedDestinations);
  let stops = normalizeStops(parsed.stops);
  let countryTour = normalizeCountryTour(parsed.countryTour);
  let destination = parsed.destination || null;
  const parsedTripShape = VALID_TRIP_SHAPES.has(parsed.tripShape) ? parsed.tripShape : null;
  let tripShape = parsedTripShape
    || (countryTour ? "country_tour" : stops.length > 1 ? "multi_stop" : "single_destination");

  const countryIntent = detectKnownCountryIntent(text, parsed);
  if (
    countryIntent
    && (!countryTour || stops.length < 2)
    && (!destination || normalizePlaceKey(destination) === normalizePlaceKey(countryIntent.country))
  ) {
    destination = countryIntent.country;
    tripShape = "country_tour";
    countryTour = {
      country: countryIntent.country,
      countryCode: countryIntent.countryCode,
      requestedRegions: countryIntent.stops,
      suggestedStopCount: countryIntent.stops.length,
    };
    stops = buildCountryTourStops(countryIntent);
  }

  return {
    destination,
    suggestedDestinations: tripShape === "country_tour" ? [] : suggestedDestinations,
    startDate,
    endDate,
    adults: parsed.adults || 2,
    childrenAges: Array.isArray(parsed.childrenAges) ? parsed.childrenAges : [],
    pets: Array.isArray(parsed.pets) ? parsed.pets : [],
    vibe: parsed.vibe || "general",
    tripGoals: normalizeStringArray(parsed.tripGoals, 6),
    mustHaves: normalizeStringArray(parsed.mustHaves, 8),
    avoidances: normalizeStringArray(parsed.avoidances, 8),
    pacePreference: VALID_PACES.has(parsed.pacePreference) ? parsed.pacePreference : "unknown",
    budgetSignals: normalizeStringArray(parsed.budgetSignals, 4),
    accommodationPreferences: normalizeStringArray(parsed.accommodationPreferences, 5),
    transportPreferences: normalizeStringArray(parsed.transportPreferences, 5),
    accessibilityNeeds: normalizeStringArray(parsed.accessibilityNeeds, 5),
    scheduleConstraints: normalizeStringArray(parsed.scheduleConstraints, 6),
    celebrationContext: typeof parsed.celebrationContext === "string" && parsed.celebrationContext.trim()
      ? parsed.celebrationContext.trim()
      : null,
    specialNotes: normalizeStringArray(parsed.specialNotes, 6),
    extraContext: normalizeStringArray(parsed.extraContext, 8),
    foodPreferences: {
      dietary: Array.isArray(fp.dietary) ? fp.dietary : [],
      cuisines: Array.isArray(fp.cuisines) ? fp.cuisines : [],
      avoidances: Array.isArray(fp.avoidances) ? fp.avoidances : [],
      kidFoods: Array.isArray(fp.kidFoods) ? fp.kidFoods : [],
      budget: fp.budget || null,
    },
    detectedRegion,
    tripShape,
    stops: tripShape === "single_destination" ? [] : stops,
    countryTour: tripShape === "country_tour" ? countryTour : null,
  };
}
