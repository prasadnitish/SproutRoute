// src/backend/services/parseInput.js
import { callModel } from "../utils/aiClient.js";

const fmt = (d) => d.toISOString().split("T")[0];
const PARSE_MAX_TOKENS = 1200;

const VALID_PACES = new Set(["slow", "moderate", "fast"]);

const normalizeStringArray = (value, maxLength = 8) =>
  Array.isArray(value)
    ? value
      .map((item) => (typeof item === "string" ? item.trim() : String(item || "").trim()))
      .filter(Boolean)
      .slice(0, maxLength)
    : [];

function defaultDates() {
  const start = new Date();
  start.setDate(start.getDate() + 14);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  return { startDate: fmt(start), endDate: fmt(end) };
}

const PARSE_PROMPT = (userText, region) => `You are a trip planner assistant. Parse this trip request into structured JSON.

User input: "${userText}"
${region ? `User is located near: ${region}` : ""}
Current date: ${new Date().toISOString().split("T")[0]}

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
  }
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
      provider: "anthropic",
      maxTokens: PARSE_MAX_TOKENS,
      temperature: 0,
    });
    return responseText;
  });
  const detectedRegion = deps.detectedRegion || null;

  const prompt = PARSE_PROMPT(text, detectedRegion);
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

  return {
    destination: parsed.destination || null,
    suggestedDestinations: parsed.suggestedDestinations || [],
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
  };
}
