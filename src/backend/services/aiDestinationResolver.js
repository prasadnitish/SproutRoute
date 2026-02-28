/**
 * AI-powered destination resolver.
 *
 * Converts natural-language trip queries into structured destination data.
 * Two modes:
 *   "direct"      — input is a specific named place → single resolved destination
 *   "suggestions" — input is vague/descriptive → up to 3 specific options with why-blurbs
 *
 * Examples:
 *   "Orlando, FL"              → direct: { destination: "Orlando, FL", ... }
 *   "beach 3hr from Seattle"   → suggestions: [{ name: "Cannon Beach, OR", why: "..." }, ...]
 *   "Caribbean cruise"         → direct: { destination: "Miami, FL", tripType: "cruise", ... }
 */
import { callModel } from "../utils/aiClient.js";
import { geocodeLocation } from "./geocoding.js";
import { sanitizeDestination } from "./inputSafety.js";

const MAX_TOKENS = 512;

/**
 * Map AI-returned tripType strings to canonical values.
 * @param {string} raw
 * @returns {string}
 */
function normalizeTripType(raw) {
  const map = {
    beach: "beach",
    cruise: "cruise",
    city: "city",
    adventure: "adventure",
    mountains: "adventure",
    hiking: "adventure",
    camping: "adventure",
    international: "international",
    theme_park: "city",
    "theme park": "city",
    ski: "adventure",
    snow: "adventure",
    rural: "adventure",
    resort: "beach",
  };
  const key = (raw || "").toLowerCase().trim();
  return map[key] || "city";
}

/**
 * Build the AI prompt for destination resolution.
 * @param {string} query - Raw user input
 * @returns {{ system: string, user: string }}
 */
function buildResolverPrompt(query) {
  const system = `You are a travel destination resolver for a family trip planning app.
Given a user's trip description, return ONLY a JSON object with this exact structure:

For a SPECIFIC named location (city, park, resort, country):
{
  "mode": "direct",
  "destination": "Canonical city/place name, State/Country",
  "tripType": "beach|city|adventure|cruise|international",
  "vibeDescription": "One sentence describing the trip vibe",
  "suggestedActivities": ["activity1", "activity2", "activity3"]
}

For a VAGUE or DESCRIPTIVE query (e.g. "beach 3 hours from Seattle", "mountains for skiing"):
{
  "mode": "suggestions",
  "suggestions": [
    {
      "name": "Specific Place, State",
      "why": "One sentence why this fits (include travel time/distance if relevant)",
      "tripType": "beach|city|adventure|cruise|international"
    }
  ]
}

RULES:
- Provide 2-3 suggestions max for vague queries (never more than 3).
- For cruise queries: mode is "direct", destination is the primary departure port city, tripType is "cruise".
- Suggestions must be REAL, SPECIFIC places (not generic like "a beach town").
- suggestedActivities: 3-5 activity keywords like "beach", "hiking", "museums", "theme parks", "dining".
- vibeDescription: max 12 words, friendly tone.
- Return ONLY valid JSON, no markdown, no explanation.`;

  return { system, user: `Trip query: "${query}"` };
}

/**
 * Parse and validate the AI resolver response.
 * @param {string} responseText
 * @returns {object}
 */
function parseResolverResponse(responseText) {
  // Strip markdown fences if present
  const cleaned = responseText
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();

  const parsed = JSON.parse(cleaned);

  if (parsed.mode === "direct") {
    if (!parsed.destination || typeof parsed.destination !== "string") {
      throw new Error("Missing destination in direct mode");
    }
    return {
      mode: "direct",
      destination: parsed.destination,
      tripType: normalizeTripType(parsed.tripType),
      vibeDescription: parsed.vibeDescription || null,
      suggestedActivities: Array.isArray(parsed.suggestedActivities)
        ? parsed.suggestedActivities.slice(0, 6)
        : [],
    };
  }

  if (parsed.mode === "suggestions") {
    const suggestions = Array.isArray(parsed.suggestions)
      ? parsed.suggestions.slice(0, 3).map((s) => ({
          name: String(s.name || "").trim(),
          why: String(s.why || "").trim(),
          tripType: normalizeTripType(s.tripType),
        }))
      : [];
    if (suggestions.length === 0) {
      throw new Error("No suggestions returned");
    }
    return { mode: "suggestions", suggestions };
  }

  throw new Error(`Unknown mode: ${parsed.mode}`);
}

/**
 * Resolve a natural-language trip query into structured destination data.
 * Geocodes the resolved destination(s) to get lat/lon/countryCode.
 *
 * @param {string} rawQuery - User's free-text input
 * @param {object} [deps] - Dependency injection (for tests)
 * @returns {Promise<object>} Resolution result with mode, destination or suggestions
 */
export async function resolveAiDestination(rawQuery, deps = {}) {
  const query = sanitizeDestination(rawQuery);
  if (!query || query.trim().length < 2) {
    throw new Error("Please enter a destination or trip description.");
  }

  const geocodeFn = deps.geocodeLocation || geocodeLocation;
  const modelFn = deps.callModel || callModel;

  const { system, user } = buildResolverPrompt(query);

  let parsed;
  try {
    const result = await modelFn(
      { system, user, maxTokens: MAX_TOKENS, temperature: 0.2 },
      deps,
    );
    parsed = parseResolverResponse(result.responseText);
  } catch (err) {
    // If AI parse fails, fall back to geocode-only resolution (existing behavior)
    if (process.env.NODE_ENV !== "production") {
      console.warn("[aiDestinationResolver] AI parse failed, falling back:", err.message);
    }
    const coords = await geocodeFn(query);
    return {
      mode: "direct",
      destination: coords.displayName || query,
      tripType: "city",
      vibeDescription: null,
      suggestedActivities: ["city exploration", "dining", "museums"],
      coords,
    };
  }

  // Geocode resolved destination(s) to get coordinates
  if (parsed.mode === "direct") {
    try {
      const coords = await geocodeFn(parsed.destination);
      return { ...parsed, coords };
    } catch {
      // Return without coords — caller can display destination without map features
      return { ...parsed, coords: null };
    }
  }

  // For suggestions: geocode each one in parallel (best-effort — skip failures)
  if (parsed.mode === "suggestions") {
    const geocoded = await Promise.allSettled(
      parsed.suggestions.map(async (s) => {
        try {
          const coords = await geocodeFn(s.name);
          return { ...s, coords };
        } catch {
          return { ...s, coords: null };
        }
      }),
    );

    const suggestions = geocoded
      .filter((r) => r.status === "fulfilled")
      .map((r) => r.value);

    return { mode: "suggestions", suggestions };
  }

  return parsed;
}
