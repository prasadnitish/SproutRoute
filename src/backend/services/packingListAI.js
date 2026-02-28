// AI service: generates a structured packing list in JSON.
// Uses aiClient.js abstraction — supports Anthropic (Haiku) and DeepSeek V3 via AI_PROVIDER env var.
import { callModel } from "../utils/aiClient.js";
import { log } from "../utils/logger.js";
import { sanitizeDestination, sanitizeActivities, isAiResponseSafe } from "./inputSafety.js";
import { getPackingBaseTemplate, detectClimateZone } from "./ragTemplates.js";
import {
  MAX_RETRIES,
  requestWithRetry,
  extractJsonCandidates,
} from "../utils/aiHelpers.js";

const MAX_TOKENS = 4096;
const REPAIR_INPUT_MAX_CHARS = 24000;

function parsePackingListResponse(responseText) {
  // Attempts multiple parse strategies because LLM output may include wrappers/fences.
  const candidates = extractJsonCandidates(responseText);

  let lastError = null;
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && Array.isArray(parsed.categories)) {
        return parsed;
      }
      lastError = new Error("Missing categories array");
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("AI returned invalid format. Please try again.");
}

async function requestPackingList({ system, user }, deps, { cache = false } = {}) {
  // Single model call wrapper — delegates to aiClient for provider-agnostic model calls.
  // cache=true enables Anthropic prompt caching on the system message (first attempt only).
  return callModel({ system, user, maxTokens: MAX_TOKENS, temperature: 0, cacheSystemPrompt: cache }, deps);
}

function buildRepairPrompt(brokenText) {
  // Dedicated repair prompt improves recovery when first/second responses are malformed.
  const text = (brokenText || "").slice(0, REPAIR_INPUT_MAX_CHARS);
  return {
    system: `You are a JSON repair tool. Fix the malformed JSON and return ONLY valid JSON with this exact shape:
{
  "categories": [
    {
      "name": "string",
      "items": [
        {
          "name": "string",
          "quantity": "string",
          "reason": "string"
        }
      ]
    }
  ]
}

Rules:
- Preserve existing meaning as much as possible.
- Do not add markdown fences or commentary.
- If a field is missing, use a sensible short string value.
- Output valid minified or pretty JSON only.`,
    user: `Malformed JSON:\n${text}`,
  };
}

async function repairPackingListJson(brokenText, deps) {
  // Third-stage fallback — uses same aiClient abstraction for provider-agnostic repair.
  const { system, user } = buildRepairPrompt(brokenText);
  return callModel({ system, user, maxTokens: MAX_TOKENS, temperature: 0 }, deps);
}

export async function generatePackingList(tripData, weatherForecast, deps = {}) {
  // Orchestrates resilient generation: full prompt → compact retry → JSON repair fallback.
  // deps: passed through to callModel for dependency injection in tests.
  const {
    destination: rawDestination,
    startDate,
    endDate,
    activities: rawActivities,
    children,
    tripType = null,
  } = tripData;

  // Sanitize user-supplied fields before interpolating into AI prompts
  const destination = sanitizeDestination(rawDestination);
  const activities = sanitizeActivities(rawActivities);

  const primaryPrompt = buildPrompt(
    destination,
    startDate,
    endDate,
    activities,
    children,
    weatherForecast,
    { compact: false, tripType },
  );

  try {
    const firstAttempt = await requestWithRetry(
      () => requestPackingList(primaryPrompt, deps, { cache: true }),
      MAX_RETRIES,
    );

    if (!isAiResponseSafe(firstAttempt.responseText)) {
      throw new Error("AI response failed safety check. Please try again.");
    }

    try {
      return parsePackingListResponse(firstAttempt.responseText);
    } catch (firstParseError) {
      log.warn("Packing-list parse failed (attempt 1), retrying compact", { error: firstParseError.message });

      const retryPrompt = buildPrompt(
        destination,
        startDate,
        endDate,
        activities,
        children,
        weatherForecast,
        { compact: true, tripType },
      );

      const secondAttempt = await requestWithRetry(
        () => requestPackingList(retryPrompt, deps),
        MAX_RETRIES,
      );

      try {
        return parsePackingListResponse(secondAttempt.responseText);
      } catch (secondParseError) {
        log.warn("Packing-list parse failed (attempt 2), trying repair", { error: secondParseError.message });

        const repairSource = secondAttempt.responseText || firstAttempt.responseText;
        const repairAttempt = await repairPackingListJson(repairSource, deps);

        try {
          return parsePackingListResponse(repairAttempt.responseText);
        } catch (repairParseError) {
          log.error("Packing-list parse failed after all 3 attempts", {
            error: repairParseError.message,
            stopReasons: {
              first: firstAttempt.stopReason || "unknown",
              second: secondAttempt.stopReason || "unknown",
              repair: repairAttempt.stopReason || "unknown",
            },
          });
          throw new Error(
            "AI returned invalid packing-list JSON after retry and repair. Please try again.",
          );
        }
      }
    }
  } catch (error) {
    log.error("AI service error (packing list)", { error: error.message });
    if (error.message.includes("invalid packing-list JSON")) {
      throw error;
    }
    throw new Error("Failed to generate packing list: " + error.message);
  }
}

function buildPrompt(
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
  const { compact = false, tripType = null } = options;
  const isCruise = tripType === "cruise";
  const childrenInfo =
    children.length > 0
      ? children.map((c) => `age ${c.age}`).join(", ")
      : "no children";

  const sizeGuardrail = compact
    ? `**Output Size Limits (strict):**
- Include exactly 6-8 categories.
- Include 3-5 items per category.
- Keep total items <= 30.
- Keep each reason <= 90 characters.`
    : `**Output Size Limits:**
- Include 6-8 categories.
- Include 3-6 items per category.
- Keep total items <= 36.
- Keep each reason concise.`;

  // Build strict age-based guardrails from actual child ages
  const childAges = children.map((c) => c.age);
  const hasInfant = childAges.some((a) => a < 1);
  const hasToddler = childAges.some((a) => a >= 1 && a < 3);
  const hasPreschooler = childAges.some((a) => a >= 3 && a < 5);
  const oldestAge = childAges.length > 0 ? Math.max(...childAges) : 0;

  const ageGuards = `**STRICT AGE-APPROPRIATE RULES (must follow exactly):**
- Diapers/pull-ups: ONLY if a child is under ${hasToddler ? "3" : "— NO children under 3, DO NOT include diapers"} years old
- Bottles/sippy cups: ONLY if a child is under 4 years old${oldestAge >= 4 ? " — DO NOT include, no child needs this" : ""}
- Pacifiers: ONLY if a child is under 2 years old${oldestAge >= 2 ? " — DO NOT include, no child needs this" : ""}
- Baby formula/nursing supplies: ONLY if an infant under 12 months is present${hasInfant ? "" : " — DO NOT include"}
- Stroller: ONLY if a child is under 4 years old${oldestAge >= 4 ? " — DO NOT include; children are too old for strollers" : ""}
- Baby monitor: ONLY for infants under 1 year${hasInfant ? "" : " — DO NOT include"}
- Entertainment/toys: scale complexity to the OLDEST child's age (${oldestAge} years old)${oldestAge >= 6 ? "; include books, games, tablets for school-age children, NOT baby toys" : ""}
- Swim diapers: ONLY if a child is under 3 years old and activities include water${hasToddler || hasInfant ? "" : " — DO NOT include"}`;

  const system = `You are a helpful travel planning assistant for parents. Generate packing lists as strict JSON only.

Generate a detailed packing list with the following structure:

{
  "categories": [
    {
      "name": "Category Name (e.g., Clothing, Toiletries, Gear)",
      "items": [
        {
          "name": "Item name",
          "quantity": "number or range like '2-3'",
          "reason": "Brief explanation (weather-based, activity-based, or child age-based)"
        }
      ]
    }
  ]
}

${ageGuards}

**Requirements:**
1. Include categories: Clothing, Toiletries, Gear/Equipment, Documents, Medications, Entertainment, Snacks${hasInfant || hasToddler || hasPreschooler ? ", Baby/Toddler Items" : ""}${isCruise ? ", Cruise Essentials" : ""}
2. Base clothing recommendations on weather forecast (rain gear if >40% rain, layers if cool, sun protection if hot)
3. Include only age-appropriate items — follow the strict age rules above without exception
4. Add activity-specific gear (beach toys, hiking boots, etc.)
5. Each item should have a practical quantity and a brief reason
6. Be specific and helpful but concise${isCruise ? `
7. **CRUISE-SPECIFIC ITEMS (required in "Cruise Essentials" category):**
   - Lanyard/card holder (for cruise key card access)
   - Motion sickness bands or medication (for sea days)
   - Power strip without surge protector (cruise ships restrict surge protectors)
   - Formal/smart-casual dinner attire (for specialty dining nights)
   - Waterproof bag or dry sack (for shore excursions near water)
   - Reusable water bottle (port stops — ship water not always available)
   - Sunscreen (SPF 50+ for poolside and beach port stops)
   - Small backpack or daypack (for shore excursions)
   - Do NOT include car seat, stroller, or booster unless children are under 3` : ""}
${sizeGuardrail}
Return ONLY the JSON, no additional text.`;

  // RAG base template: inject pre-built item suggestions for the detected climate+trip type.
  // AI uses this as a starting point, removing age-inappropriate items and adding specifics.
  const climateZone = detectClimateZone(weatherForecast.forecast);
  const ragBase = getPackingBaseTemplate(climateZone, tripType);
  const ragSection = ragBase
    ? `\n\n**Base Packing Reference — ${climateZone} climate, ${tripType || "general"} trip** (expand, personalise, and remove age-inappropriate items):\n${ragBase}`
    : "";

  const user = `Generate a comprehensive packing list for a ${isCruise ? "cruise trip" : "family trip"}.

**Trip Details:**
- Destination: ${destination}${isCruise ? " (cruise)" : ""}
- Trip Type: ${tripType || "general"}
- Dates: ${startDate} to ${endDate}
- Activities: ${activities.join(", ")}
- Children: ${children.length} child(ren) — ages: ${childrenInfo} (oldest is ${oldestAge} years old)

**Weather Forecast:**
${weatherForecast.summary}

${weatherForecast.forecast
  .slice(0, 7)
  .map(
    (f) =>
      `${f.name}: ${f.high}°F, ${f.condition}, ${f.precipitation}% rain chance`,
  )
  .join("\n")}${ragSection}`;

  return { system, user };
}
