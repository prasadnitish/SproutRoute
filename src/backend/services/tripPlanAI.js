// AI service: generates a structured trip itinerary in JSON.
// Uses aiClient.js abstraction — supports Anthropic (Haiku) and DeepSeek V3 via AI_PROVIDER env var.
import { callModel } from "../utils/aiClient.js";
import { log } from "../utils/logger.js";
import { sanitizeDestination, sanitizeActivities, isAiResponseSafe } from "./inputSafety.js";
import { buildCachedAttractionsSummary } from "./attractionMemory.js";
import {
  MAX_RETRIES,
  requestWithRetry,
  extractJsonCandidates,
} from "../utils/aiHelpers.js";

const MAX_TOKENS = 16384;
const CHUNK_SIZE_DAYS = 7;
const REPAIR_INPUT_MAX_CHARS = 28000;

function sanitizeBoolean(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const lower = value.trim().toLowerCase();
    if (lower === "true" || lower === "yes") return true;
    if (lower === "false" || lower === "no") return false;
  }
  return fallback;
}

function normalizeMealField(meals) {
  if (!meals) return "";
  if (typeof meals === "string") return meals.trim();
  if (typeof meals !== "object") return String(meals);

  const normalizeMeal = (value) => {
    if (!value) return "";
    if (typeof value === "string") return value.trim();
    if (typeof value !== "object") return String(value);
    return {
      name: String(value.name || value.title || "").trim(),
      cuisine: value.cuisine ? String(value.cuisine).trim() : undefined,
      note: value.note ? String(value.note).trim() : undefined,
    };
  };

  const normalized = {
    breakfast: normalizeMeal(meals.breakfast),
    lunch: normalizeMeal(meals.lunch),
    dinner: normalizeMeal(meals.dinner),
  };

  if (!normalized.breakfast && !normalized.lunch && !normalized.dinner) {
    return "";
  }

  return normalized;
}

function normalizeTripPlanShape(parsed, { expectedDays = null, maxActivities = null } = {}) {
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Trip plan response was not an object");
  }

  const rawActivities = Array.isArray(parsed.suggestedActivities)
    ? parsed.suggestedActivities
    : Array.isArray(parsed.activities)
      ? parsed.activities
      : [];

  const suggestedActivities = rawActivities
    .map((activity, index) => {
      const safe = typeof activity === "string" ? { name: activity } : (activity || {});
      const fallbackName = String(safe.name || safe.title || `Activity ${index + 1}`).trim();
      return {
        id: String(safe.id || `act-${index + 1}`),
        name: fallbackName,
        category: String(safe.category || "general").trim().toLowerCase().replace(/\s+/g, "_"),
        description: String(safe.description || safe.reason || "").trim(),
        whatItIs: String(safe.whatItIs || safe.description || safe.summary || "").trim(),
        whyRecommended: String(safe.whyRecommended || safe.reason || "").trim(),
        timingTip: String(safe.timingTip || safe.bestTime || "").trim(),
        duration: String(safe.duration || "2 hours").trim(),
        kidFriendly: sanitizeBoolean(safe.kidFriendly, true),
        weatherDependent: sanitizeBoolean(safe.weatherDependent, false),
        ...(safe.petFriendly !== undefined ? { petFriendly: sanitizeBoolean(safe.petFriendly, false) } : {}),
      };
    })
    .filter((activity) => activity.name);

  const trimmedActivities = maxActivities
    ? suggestedActivities.slice(0, maxActivities)
    : suggestedActivities;
  const validIds = new Set(trimmedActivities.map((activity) => activity.id));

  const rawDays = Array.isArray(parsed.dailyItinerary)
    ? parsed.dailyItinerary
    : Array.isArray(parsed.itinerary)
      ? parsed.itinerary
      : [];

  const dailyItinerary = rawDays
    .map((day, index) => {
      const safe = day && typeof day === "object" ? day : { day: `Day ${index + 1}`, activities: [] };
      const rawDayActivities = Array.isArray(safe.activities)
        ? safe.activities
        : Array.isArray(safe.items)
          ? safe.items
          : [];

      const activities = rawDayActivities
        .map((entry, entryIndex) => {
          if (typeof entry === "string") return entry;
          if (entry && typeof entry === "object") {
            if (entry.id && validIds.has(String(entry.id))) return String(entry.id);
            if (entry.name) {
              const match = trimmedActivities.find((activity) => activity.name === entry.name);
              if (match) return match.id;
              const fallbackId = `day-${index + 1}-activity-${entryIndex + 1}`;
              if (!validIds.has(fallbackId)) {
                trimmedActivities.push({
                  id: fallbackId,
                  name: String(entry.name).trim(),
                  category: String(entry.category || "general").trim().toLowerCase().replace(/\s+/g, "_"),
                  description: String(entry.description || "").trim(),
                  whatItIs: String(entry.whatItIs || entry.description || "").trim(),
                  whyRecommended: String(entry.whyRecommended || entry.reason || "").trim(),
                  timingTip: String(entry.timingTip || entry.bestTime || "").trim(),
                  duration: String(entry.duration || "2 hours").trim(),
                  kidFriendly: sanitizeBoolean(entry.kidFriendly, true),
                  weatherDependent: sanitizeBoolean(entry.weatherDependent, false),
                  ...(entry.petFriendly !== undefined ? { petFriendly: sanitizeBoolean(entry.petFriendly, false) } : {}),
                });
                validIds.add(fallbackId);
              }
              return fallbackId;
            }
          }
          return null;
        })
        .filter(Boolean);

      return {
        day: String(safe.day || safe.date || `Day ${index + 1}`).trim(),
        activities,
        meals: normalizeMealField(safe.meals),
        notes: String(safe.notes || "").trim(),
      };
    })
    .filter((day) => day.activities.length > 0 || day.meals || day.notes);

  if (trimmedActivities.length === 0 || dailyItinerary.length === 0) {
    throw new Error("Missing required trip-plan arrays");
  }

  return {
    overview: String(parsed.overview || parsed.summary || "").trim(),
    suggestedActivities: trimmedActivities,
    dailyItinerary: expectedDays ? dailyItinerary.slice(0, expectedDays) : dailyItinerary,
    tips: Array.isArray(parsed.tips)
      ? parsed.tips.map((tip) => String(tip).trim()).filter(Boolean).slice(0, 5)
      : [],
  };
}

function parseTripPlanResponse(responseText, options = {}) {
  // Attempts tolerant parsing because model output may include markdown wrappers.
  const candidates = extractJsonCandidates(responseText);

  let lastError = null;
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      return normalizeTripPlanShape(parsed, options);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("AI returned invalid format. Please try again.");
}

function getTripPlanMaxTokens(startDate, endDate, { compact = false } = {}) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const days = Math.max(1, Math.ceil((end - start) / (1000 * 60 * 60 * 24)));
  const base = compact ? 2000 : 3000;
  const perDay = compact ? 400 : 600;
  return Math.min(MAX_TOKENS, Math.max(3000, base + days * perDay));
}

async function requestTripPlan({ system, user, maxTokens }, deps, { cache = false } = {}) {
  // Shared model-call wrapper — delegates to aiClient for provider-agnostic model calls.
  // cache=true enables Anthropic prompt caching on the system message (first attempt only).
  // Haiku 4.5 for trip planning — 2x faster than Sonnet 4.6 (104 t/s vs 51 t/s)
  return callModel({ system, user, maxTokens, temperature: 0, cacheSystemPrompt: cache, caller: "tripPlan", provider: "anthropic", model: "claude-haiku-4-5-20251001" }, deps);
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
      "whatItIs": "string",
      "whyRecommended": "string",
      "timingTip": "string",
      "duration": "string",
      "kidFriendly": true,
      "weatherDependent": false
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
  return callModel({ system, user, maxTokens: MAX_TOKENS, temperature: 0, caller: "tripPlan:repair" }, deps);
}

export async function generateTripPlan(tripData, weatherForecast, deps = {}) {
  // Resilient generation path: normal prompt → compact retry → repair fallback.
  // deps: passed through to callModel for dependency injection in tests.
  const {
    destination: rawDestination,
    startDate,
    endDate,
    activities: rawActivities,
    children,
    tripType = null,
    countryCode = "US",
    foodPreferences = null,
    pets = [],
    plannerSummary = "",
    cachedAttractions = [],
  } = tripData;
  const expectedDays = Math.max(1, Math.ceil((new Date(endDate) - new Date(startDate)) / (1000 * 60 * 60 * 24)));
  const maxActivities = Math.min(Math.max(expectedDays * 2, 4), 10);

  // Sanitize user-supplied fields before interpolating into AI prompts
  const destination = sanitizeDestination(rawDestination);
  const activities = sanitizeActivities(rawActivities);

  const primaryPrompt = buildTripPlanPrompt(
    destination,
    startDate,
    endDate,
      activities,
      children,
      weatherForecast,
      { compact: false, tripType, countryCode, foodPreferences, pets, plannerSummary, cachedAttractions },
    );
  const primaryMaxTokens = getTripPlanMaxTokens(startDate, endDate, { compact: false });

  try {
      const firstAttempt = await requestWithRetry(
      () => requestTripPlan({ ...primaryPrompt, maxTokens: primaryMaxTokens }, deps, { cache: true }),
      MAX_RETRIES,
    );

    // Reject responses that look like successful prompt injection attempts
    if (!isAiResponseSafe(firstAttempt.responseText)) {
      throw new Error("AI response failed safety check. Please try again.");
    }

    try {
      return parseTripPlanResponse(firstAttempt.responseText, { expectedDays, maxActivities });
    } catch (firstParseError) {
      log.warn("Trip-plan parse failed (attempt 1), retrying compact", { error: firstParseError.message });

      const retryPrompt = buildTripPlanPrompt(
        destination,
        startDate,
        endDate,
        activities,
        children,
        weatherForecast,
        { compact: true, tripType, countryCode, foodPreferences, pets, plannerSummary, cachedAttractions },
      );
      const retryMaxTokens = getTripPlanMaxTokens(startDate, endDate, { compact: true });

      const secondAttempt = await requestWithRetry(
        () => requestTripPlan({ ...retryPrompt, maxTokens: retryMaxTokens }, deps),
        MAX_RETRIES,
      );

      try {
        return parseTripPlanResponse(secondAttempt.responseText, { expectedDays, maxActivities });
      } catch (secondParseError) {
        log.warn("Trip-plan parse failed (attempt 2), trying repair", { error: secondParseError.message });

        const repairSource = secondAttempt.responseText || firstAttempt.responseText;
        const repairAttempt = await repairTripPlanJson(repairSource, deps);

        try {
          return parseTripPlanResponse(repairAttempt.responseText, { expectedDays, maxActivities });
        } catch (repairParseError) {
          log.error("Trip-plan parse failed after all 3 attempts", {
            error: repairParseError.message,
            stopReasons: {
              first: firstAttempt.stopReason || "unknown",
              second: secondAttempt.stopReason || "unknown",
              repair: repairAttempt.stopReason || "unknown",
            },
          });
          throw new Error(
            "AI returned invalid trip-plan JSON after retry and repair. Please try again.",
          );
        }
      }
    }
  } catch (error) {
    log.error("AI service error (trip plan)", { error: error.message });
    if (error.message.includes("invalid trip-plan JSON")) {
      throw error;
    }
    throw new Error("Failed to generate trip plan: " + error.message);
  }
}

// ── Chunked generation for trips > 7 days ───────────────────────────────────

/**
 * Split a date range into 7-day chunks.
 * @param {string} startDate — YYYY-MM-DD
 * @param {string} endDate — YYYY-MM-DD
 * @returns {Array<{startDate, endDate, dayOffset, chunkIndex, totalChunks}>}
 */
export function computeChunks(startDate, endDate) {
  const start = new Date(startDate + "T12:00:00Z");
  const end = new Date(endDate + "T12:00:00Z");
  const totalDays = Math.ceil((end - start) / (1000 * 60 * 60 * 24));

  if (totalDays <= CHUNK_SIZE_DAYS) {
    return [{ startDate, endDate, dayOffset: 0, chunkIndex: 0, totalChunks: 1 }];
  }

  const chunks = [];
  let cursor = new Date(start);
  let offset = 0;

  while (cursor < end) {
    const chunkEnd = new Date(cursor);
    chunkEnd.setUTCDate(chunkEnd.getUTCDate() + CHUNK_SIZE_DAYS);
    const actualEnd = chunkEnd > end ? end : chunkEnd;

    chunks.push({
      startDate: cursor.toISOString().split("T")[0],
      endDate: actualEnd.toISOString().split("T")[0],
      dayOffset: offset,
      chunkIndex: chunks.length,
      totalChunks: 0, // filled below
    });

    offset += CHUNK_SIZE_DAYS;
    cursor = new Date(actualEnd);
  }

  // Fill totalChunks
  for (const c of chunks) c.totalChunks = chunks.length;
  return chunks;
}

/**
 * Merge multiple chunk results into a single tripPlan.
 * @param {Array<object>} chunkResults — array of parseTripPlanResponse outputs
 * @returns {object} merged tripPlan with combined dailyItinerary, activities, tips
 */
export function mergeTripPlanChunks(chunkResults) {
  if (chunkResults.length === 1) return chunkResults[0];

  const merged = {
    overview: chunkResults[0].overview || "",
    suggestedActivities: [],
    dailyItinerary: [],
    tips: [],
  };

  const seenActivityIds = new Set();

  for (const chunk of chunkResults) {
    // Merge activities (deduplicate by id)
    for (const act of (chunk.suggestedActivities || [])) {
      if (!seenActivityIds.has(act.id)) {
        seenActivityIds.add(act.id);
        merged.suggestedActivities.push(act);
      }
    }

    // Append daily itinerary
    merged.dailyItinerary.push(...(chunk.dailyItinerary || []));

    // Collect tips
    merged.tips.push(...(chunk.tips || []));
  }

  // Deduplicate tips
  merged.tips = [...new Set(merged.tips)];

  return merged;
}

/**
 * Generate a trip plan in chunks for trips > 7 days.
 * Returns results one chunk at a time via the onChunk callback.
 *
 * @param {object} tripData — full trip data
 * @param {object} weather — weather forecast
 * @param {function} onChunk — called with (chunkTripPlan, chunkMeta) for each chunk
 * @param {object} deps — DI for testing
 */
export async function generateTripPlanChunked(tripData, weather, onChunk, deps = {}) {
  const chunks = computeChunks(tripData.startDate, tripData.endDate);

  if (chunks.length === 1) {
    // Short trip — single generation
    const result = await generateTripPlan(tripData, weather, deps);
    onChunk(result, { chunk: 1, totalChunks: 1, dayOffset: 0 });
    return result;
  }

  // Multi-chunk generation
  const chunkResults = [];
  for (const chunk of chunks) {
    const chunkData = {
      ...tripData,
      startDate: chunk.startDate,
      endDate: chunk.endDate,
    };

    // For chunk 2+, add continuation context
    if (chunk.chunkIndex > 0 && chunkResults.length > 0) {
      const prevDays = chunkResults.flatMap(r => r.dailyItinerary || []);
      const prevActivities = chunkResults.flatMap(r => (r.suggestedActivities || []).map(a => a.name));
      chunkData._continuationContext = `This is days ${chunk.dayOffset + 1}-${chunk.dayOffset + 7} of a ${chunks[0].totalChunks * CHUNK_SIZE_DAYS}-day trip. Previous days already planned: ${prevDays.map(d => d.day).join(", ")}. Activities already suggested: ${prevActivities.slice(0, 10).join(", ")}. Avoid repeating the same activities. Continue with new experiences.`;
    }

    const result = await generateTripPlan(chunkData, weather, deps);
    chunkResults.push(result);

    onChunk(result, {
      chunk: chunk.chunkIndex + 1,
      totalChunks: chunk.totalChunks,
      dayOffset: chunk.dayOffset,
    });
  }

  return mergeTripPlanChunks(chunkResults);
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
  const {
    compact = false,
    tripType = null,
    countryCode = "US",
    foodPreferences = null,
    pets = [],
    plannerSummary = "",
    cachedAttractions = [],
  } = options;

  const isCruise = tripType === "cruise";
  const isInternational = countryCode && countryCode !== "US" && countryCode !== "CA";
  const isAdultsOnly = children.length === 0;
  const hasShortlist = Array.isArray(cachedAttractions) && cachedAttractions.length > 0;
  const childrenInfo = isAdultsOnly
    ? "Adults-only trip, no children"
    : children.map((c) => `age ${c.age}`).join(", ");

  const sizeGuardrail = compact
    ? `**Output Size Limits (strict):**
1. Suggest 4-6 activities total.
2. Keep dailyItinerary to max 5 day objects.
3. Keep each activity description <= 80 characters.
4. Keep tips to max 4 items.`
    : `**Output Rules:**
1. Suggest 4-6 activities per day (NOT including meals). Activities should include sightseeing, tours, outdoor, cultural, and entertainment.
2. For short city trips (2-3 days), MUST include a half-day walking/city tour as one activity that covers 4-5 landmarks in one go (e.g., "Downtown Walking Tour covering Times Square, Rockefeller Center, Grand Central, Bryant Park, and the Public Library"). This is how real families explore cities.
3. Keep dailyItinerary to max 7 day objects.
4. Activity descriptions: 1-2 sentences.${hasShortlist ? " For shortlisted attractions, keep descriptions brief." : ""}
5. Meals: SPECIFIC real restaurant as {name, cuisine, note}.
6. Include 5-8 practical tips including money-saving hacks (CityPASS, free days, combo tickets).
7. Keep JSON compact.${hasShortlist && cachedAttractions.length >= 5 ? "\n8. Use verified shortlist attractions — do not re-discover what's already provided." : ""}`;

  // Cruise-specific itinerary format instructions
  const cruiseInstructions = isCruise ? `
**CRUISE FORMAT RULES (strictly required):**
- Day 1 is embarkation day at the departure port. Label: "Day 1: Embarkation"
- Sea days (no port): Label as "Day N: Sea Day"
- Port days: Label as "Day N: Port — [Port City, Country]"
- Disembarkation is the final day. Label: "Day N: Disembarkation"
- For port days, suggest 2-3 shore excursions and note they require booking ahead
- For sea days, suggest onboard activities: pool, spa, entertainment, specialty dining
- Note tender ports (smaller ships required) when applicable
- Include advice about staying near the ship for shorter port stops` : "";

  // Pet-aware planning context
  const hasPets = Array.isArray(pets) && pets.length > 0;
  const petContext = hasPets ? `
**PETS TRAVELING:**
${pets.map((p) => `- ${p.name || "Unnamed pet"}: ${p.breed || p.type}, ${p.weightLb || p.weightLbs || "unknown"} lbs${p.specialNeeds ? ", " + p.specialNeeds : ""}`).join("\n")}

**PET-AWARE PLANNING RULES:**
1. All restaurant suggestions MUST be pet-friendly (outdoor seating or explicitly pet-welcoming)
2. Include at least 2 off-leash dog parks or pet exercise areas per day for dogs
3. For cats/small animals: suggest activities where pet stays safely at accommodation
4. Suggest one pet daycare/boarding option per day for activities that don't allow pets
5. Never suggest leaving pets in vehicles
6. Note pet-restricted venues clearly with a warning
7. Consider pet anxiety/energy levels when planning activity density
8. Include pet supply stores near accommodation for emergencies` : "";

  // International context additions
  const internationalContext = isInternational ? `
**INTERNATIONAL TRAVEL CONTEXT:**
- Mention local currency and rough USD equivalents where helpful
- Note any entry requirements or useful language phrases if destination is non-English-speaking
- Include a tip about local emergency number (e.g., EU 112, UK 999) in the tips array
- Consider time zone adjustment in the first-day itinerary if cross-continental travel` : "";

  const profileContext = plannerSummary
    ? `
**PROFILE-AWARE PLANNING (must respect):**
- Treat these preferences as the default travel style unless they conflict with explicit trip constraints.
- Prioritize must-haves and avoidances when choosing activities and meal pacing.
- Use dietary/accessibility context to filter recommendations.
- If a preference conflicts with destination reality or weather, adapt gracefully and explain in notes.`
    : "";

  const attractionMemoryContext = hasShortlist
    ? `
**MANDATORY ATTRACTION LIST — USE THESE (do not invent replacements):**
${buildCachedAttractionsSummary(cachedAttractions, { maxItems: 12 })}

CRITICAL RULES FOR ATTRACTIONS:
- You MUST use attractions from this list for your suggestedActivities. These are VERIFIED REAL PLACES.
- Do NOT invent or hallucinate attraction names. If you need more variety, pick from different categories above.
- You may add at most 1 new discovery per day that is NOT on this list — but it must be a real, well-known place.
- Keep each attraction name EXACTLY as shown above (do not rename, abbreviate, or paraphrase).
- This saves significant processing time — the places are already researched and verified.`
    : "";

  const system = `You are a helpful travel planning assistant${isAdultsOnly ? "" : " specialising in family trips"}. Generate trip itineraries as strict JSON only.

Generate a trip plan with the following structure:

{
  "overview": "Brief 2-3 sentence overview of the trip",
  "suggestedActivities": [
    {
      "id": "unique-id",
      "name": "Activity Name",
      "category": "one of: beach, hiking, city, museums, parks, dining, shopping, sports, water, wildlife, theme_park, camping${isCruise ? ", cruise, shore_excursion" : ""}",
      "description": "Very short description",
      "whatItIs": "Short factual explainer of the attraction",
      "whyRecommended": "Short reason this fits this specific trip",
      "timingTip": "Short timing advice like best time to go",
      "duration": "Estimated duration (e.g., '2-3 hours', 'half day', 'full day')",
      "kidFriendly": true,${hasPets ? `
      "petFriendly": true,` : ""}
      "weatherDependent": false
    }
  ],
  "dailyItinerary": [
    {
      "day": "${isCruise ? "Day 1: Embarkation" : "Day 1 (date)"}",
      "activities": ["activity-id-1", "activity-id-2", "activity-id-3"],
      "meals": {
        "breakfast": { "name": "Specific REAL restaurant name", "cuisine": "American", "note": "Why this restaurant" },
        "lunch": { "name": "Specific REAL restaurant name", "cuisine": "Seafood", "note": "Why this restaurant" },
        "dinner": { "name": "Specific REAL restaurant name", "cuisine": "Italian", "note": "Why this restaurant" }
      },
      "notes": "Short note"
    }
  ],
  "tips": [
    "Include 6-10 practical tips covering: booking advice, timing tips, money-saving hacks (city passes, free days at museums, combo tickets, happy hour deals, free activities), local customs, safety, transportation, and family-specific advice"
  ]
}
${cruiseInstructions}
${internationalContext}
${petContext}
${profileContext}
${attractionMemoryContext}
**CRITICAL Requirements (MUST follow ALL of these):**
1. Include a mix of indoor and outdoor activities based on weather.
2. ${isAdultsOnly ? "This is an adults-only trip — recommend activities suited for adults, including dining, nightlife, cultural experiences, and local attractions" : "Consider children's ages when recommending activities"}
3. Prioritise activities that match their stated interests.
4. Include weather-appropriate suggestions (rainy day alternatives, sun protection needs).
5. Be specific to the destination — only suggest REAL places that actually exist and are currently open.
6. EVERY DAY must have 4-6 activities (NOT counting meals). Activities should include: major attractions, walking/city tours, parks, museums, neighborhoods to explore, viewpoints, shopping areas, etc. A family in a city for 2-3 days will visit 10-15+ places total.
7. **ABSOLUTE RULE — DAY COUNT**: The number of day objects in dailyItinerary MUST EXACTLY EQUAL the number of days in the trip. Dates ${startDate} to ${endDate} = you must return exactly that many day objects. If you return fewer days than requested, the response is INVALID. Count the days: Apr 15-17 = Day 1 (Apr 15), Day 2 (Apr 16), Day 3 (Apr 17) = 3 days.
8. For city trips of 1-3 days: include at least one "City Walking Tour" or "Hop-On Hop-Off Bus Tour" that covers 4-5 landmarks as a single activity. This is how tourists actually explore cities.
8. For every activity, include a short factual "whatItIs" and a short personalized "whyRecommended".
9. MEALS ARE CRITICAL: For EVERY meal (breakfast, lunch, dinner) in EVERY day, suggest a SPECIFIC REAL restaurant name as an object: {"name": "Real Restaurant Name", "cuisine": "Type", "note": "Brief reason"}. NEVER use generic labels like "Breakfast" or "local restaurant". Vary restaurants across days — do NOT repeat the same restaurant on multiple days.
10. Only suggest restaurants that are currently operating. Do not suggest permanently closed restaurants.
${foodPreferences ? `8. FOOD PREFERENCES (must respect):
   - Dietary: ${foodPreferences.dietary?.length ? foodPreferences.dietary.join(", ") : "none specified"}
   - Preferred cuisines: ${foodPreferences.cuisines?.length ? foodPreferences.cuisines.join(", ") : "open to all"}
   - Avoidances: ${foodPreferences.avoidances?.length ? foodPreferences.avoidances.join(", ") : "none"}
   - Kid-friendly foods: ${foodPreferences.kidFoods?.length ? foodPreferences.kidFoods.join(", ") : "standard kid options"}
   - Budget: ${foodPreferences.budget || "moderate"}
   All restaurant suggestions MUST accommodate these dietary needs.` : ""}
${sizeGuardrail}
Return ONLY the JSON, no additional text.`;

  const user = `Generate a detailed trip itinerary for ${isCruise ? "a cruise trip" : isAdultsOnly ? "an adults-only trip" : "a family trip"}.

**Trip Details:**
- Destination: ${destination}${isCruise ? " (cruise itinerary)" : ""}
- Trip Type: ${tripType || "general"}
- Dates: ${startDate} to ${endDate}
- Interested Activities: ${activities.join(", ")}
- ${isAdultsOnly ? "Travelers: Adults only (no children)" : `Children: ${children.length} child(ren) - ${childrenInfo}`}
${plannerSummary ? `

**Known Traveler Preferences:**
${plannerSummary}` : ""}
${Array.isArray(cachedAttractions) && cachedAttractions.length > 0 ? `

**Vetted attraction candidates for this destination:**
${buildCachedAttractionsSummary(cachedAttractions)}` : ""}

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
