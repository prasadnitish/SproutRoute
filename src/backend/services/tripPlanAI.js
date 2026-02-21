// AI service: generates a structured trip itinerary in JSON.
// Uses aiClient.js abstraction — supports Anthropic (Haiku) and DeepSeek V3 via AI_PROVIDER env var.
import { callModel } from "../utils/aiClient.js";
import {
  MAX_RETRIES,
  requestWithRetry,
  extractJsonCandidates,
} from "../utils/aiHelpers.js";

const MAX_TOKENS = 4096;
const REPAIR_INPUT_MAX_CHARS = 28000;

function parseTripPlanResponse(responseText) {
  // Attempts tolerant parsing because model output may include markdown wrappers.
  const candidates = extractJsonCandidates(responseText);

  let lastError = null;
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (
        parsed &&
        Array.isArray(parsed.suggestedActivities) &&
        Array.isArray(parsed.dailyItinerary) &&
        Array.isArray(parsed.tips)
      ) {
        return parsed;
      }
      lastError = new Error("Missing required trip-plan arrays");
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("AI returned invalid format. Please try again.");
}

async function requestTripPlan({ system, user }, deps) {
  // Shared model-call wrapper — delegates to aiClient for provider-agnostic model calls.
  return callModel({ system, user, maxTokens: MAX_TOKENS, temperature: 0 }, deps);
}

function buildRepairPrompt(brokenText) {
  // Repair prompt constrains schema so downstream UI can trust required arrays.
  const text = (brokenText || "").slice(0, REPAIR_INPUT_MAX_CHARS);
  return {
    system: `You are a JSON repair tool. Fix the malformed JSON and return ONLY valid JSON with this exact shape:
{
  "overview": "string",
  "suggestedActivities": [
    {
      "id": "string",
      "name": "string",
      "category": "string",
      "description": "string",
      "duration": "string",
      "kidFriendly": true,
      "weatherDependent": false,
      "bestDays": ["string"],
      "reason": "string"
    }
  ],
  "dailyItinerary": [
    {
      "day": "string",
      "activities": ["string"],
      "meals": "string",
      "notes": "string"
    }
  ],
  "tips": ["string"]
}

Rules:
- Preserve existing meaning as much as possible.
- Do not add markdown fences or commentary.
- Ensure booleans remain booleans.
- If a field is missing, use short sensible defaults.
- Output valid JSON only.`,
    user: `Malformed JSON:\n${text}`,
  };
}

async function repairTripPlanJson(brokenText, deps) {
  // Last-resort recovery path — uses the same aiClient abstraction.
  const { system, user } = buildRepairPrompt(brokenText);
  return callModel({ system, user, maxTokens: MAX_TOKENS, temperature: 0 }, deps);
}

export async function generateTripPlan(tripData, weatherForecast, deps = {}) {
  // Resilient generation path: normal prompt → compact retry → repair fallback.
  // deps: passed through to callModel for dependency injection in tests.
  const { destination, startDate, endDate, activities, children } = tripData;

  const primaryPrompt = buildTripPlanPrompt(
    destination,
    startDate,
    endDate,
    activities,
    children,
    weatherForecast,
    { compact: false },
  );

  try {
    const firstAttempt = await requestWithRetry(
      () => requestTripPlan(primaryPrompt, deps),
      MAX_RETRIES,
    );

    try {
      return parseTripPlanResponse(firstAttempt.responseText);
    } catch (firstParseError) {
      if (process.env.NODE_ENV !== "production") {
        console.warn(
          "Trip-plan parse failed on first attempt; retrying with compact prompt:",
          firstParseError.message,
        );
      }

      const retryPrompt = buildTripPlanPrompt(
        destination,
        startDate,
        endDate,
        activities,
        children,
        weatherForecast,
        { compact: true },
      );

      const secondAttempt = await requestWithRetry(
        () => requestTripPlan(retryPrompt, deps),
        MAX_RETRIES,
      );

      try {
        return parseTripPlanResponse(secondAttempt.responseText);
      } catch (secondParseError) {
        if (process.env.NODE_ENV !== "production") {
          console.warn(
            "Trip-plan parse failed after retry; attempting JSON repair:",
            secondParseError.message,
          );
        }

        const repairSource = secondAttempt.responseText || firstAttempt.responseText;
        const repairAttempt = await repairTripPlanJson(repairSource, deps);

        try {
          return parseTripPlanResponse(repairAttempt.responseText);
        } catch (repairParseError) {
          if (process.env.NODE_ENV !== "production") {
            console.error("Trip-plan parse failed after retry and repair:", repairParseError);
            console.error(
              "Stop reasons:",
              JSON.stringify({
                firstAttempt: firstAttempt.stopReason || "unknown",
                secondAttempt: secondAttempt.stopReason || "unknown",
                repairAttempt: repairAttempt.stopReason || "unknown",
              }),
            );
          }
          throw new Error(
            "AI returned invalid trip-plan JSON after retry and repair. Please try again.",
          );
        }
      }
    }
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.error("AI service error (trip plan):", error);
    }
    if (error.message.includes("invalid trip-plan JSON")) {
      throw error;
    }
    throw new Error("Failed to generate trip plan: " + error.message);
  }
}

function buildTripPlanPrompt(
  destination,
  startDate,
  endDate,
  activities,
  children,
  weatherForecast,
  options = {},
) {
  // Returns { system, user } so static instructions are isolated from user-controlled data,
  // which prevents injected content in trip fields from overriding model instructions.
  const { compact = false } = options;

  const childrenInfo =
    children.length > 0
      ? children.map((c) => `age ${c.age}`).join(", ")
      : "no children";

  const sizeGuardrail = compact
    ? `**Output Size Limits (strict):**
1. Suggest exactly 6-8 activities.
2. Keep dailyItinerary to max 5 day objects.
3. Keep each description/reason <= 120 characters.
4. Keep tips to max 5 items.`
    : `**Output Size Limits:**
1. Suggest 8-10 activities.
2. Keep dailyItinerary to max 7 day objects.
3. Keep all text concise.`;

  const system = `You are a helpful travel planning assistant specialising in family trips. Generate trip itineraries as strict JSON only.

Generate a trip plan with the following structure:

{
  "overview": "Brief 2-3 sentence overview of the trip",
  "suggestedActivities": [
    {
      "id": "unique-id",
      "name": "Activity Name",
      "category": "one of: beach, hiking, city, museums, parks, dining, shopping, sports, water, wildlife, theme_park, camping",
      "description": "Brief description of the activity (1-2 sentences)",
      "duration": "Estimated duration (e.g., '2-3 hours', 'half day', 'full day')",
      "kidFriendly": true,
      "weatherDependent": false,
      "bestDays": ["Day names from forecast when this activity is recommended"],
      "reason": "Why this activity is recommended (weather, season, family-friendly, etc.)"
    }
  ],
  "dailyItinerary": [
    {
      "day": "Day 1 (date)",
      "activities": ["activity-id-1", "activity-id-2"],
      "meals": "Meal suggestions",
      "notes": "Any special notes (weather warnings, booking recommendations, etc.)"
    }
  ],
  "tips": [
    "Helpful tips for the trip (booking advice, timing, local insights)"
  ]
}

**Requirements:**
1. Include a mix of indoor and outdoor activities based on weather
2. Consider children's ages when recommending activities
3. Prioritise activities that match their stated interests
4. Include weather-appropriate suggestions (rainy day alternatives, sun protection needs)
5. Be specific to the destination (not generic advice)
6. Create a balanced daily itinerary that's not too packed
${sizeGuardrail}
Return ONLY the JSON, no additional text.`;

  const user = `Generate a detailed trip itinerary for a family trip.

**Trip Details:**
- Destination: ${destination}
- Dates: ${startDate} to ${endDate}
- Interested Activities: ${activities.join(", ")}
- Children: ${children.length} child(ren) - ${childrenInfo}

**Weather Forecast:**
${weatherForecast.summary}

${weatherForecast.forecast
  .slice(0, 7)
  .map(
    (f) =>
      `${f.name}: ${f.high}°F, ${f.condition}, ${f.precipitation}% rain chance`,
  )
  .join("\n")}`;

  return { system, user };
}
