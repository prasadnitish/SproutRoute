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
import { inclusiveDayCount } from "../utils/dateCalc.js";

const MAX_TOKENS = 16384;
const CHUNK_SIZE_DAYS = 7;
const REPAIR_INPUT_MAX_CHARS = 28000;
const MAX_QUALITY_ISSUES_IN_PROMPT = 8;

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

function analyzeTripPlanQuality(tripPlan) {
  const activityMap = new Map(
    toActivityArray(tripPlan?.suggestedActivities).map((activity) => [String(activity.id), activity]),
  );
  const duplicates = [];
  const seenByName = new Map();

  for (const day of tripPlan?.dailyItinerary || []) {
    for (const activityId of day.activities || []) {
      const activity = activityMap.get(String(activityId));
      const normalizedName = String(activity?.name || activityId || "").trim().toLowerCase();
      if (!normalizedName) continue;
      const seenOnDay = seenByName.get(normalizedName);
      if (seenOnDay && seenOnDay !== day.day) {
        duplicates.push({
          name: activity?.name || String(activityId),
          firstDay: seenOnDay,
          repeatedDay: day.day,
        });
      } else if (!seenOnDay) {
        seenByName.set(normalizedName, day.day);
      }
    }
  }

  return {
    duplicates,
  };
}

function toActivityArray(value) {
  return Array.isArray(value) ? value : [];
}

function assertTripPlanQuality(tripPlan) {
  const quality = analyzeTripPlanQuality(tripPlan);
  if (quality.duplicates.length > 0) {
    const issueSummary = quality.duplicates
      .slice(0, MAX_QUALITY_ISSUES_IN_PROMPT)
      .map((dup) => `${dup.name} appears on ${dup.firstDay} and ${dup.repeatedDay}`)
      .join("; ");
    const error = new Error(`Trip plan repeats activities across days: ${issueSummary}`);
    error.code = "TRIP_PLAN_REPEATS";
    error.quality = quality;
    throw error;
  }
  return tripPlan;
}

function getTripPlanMaxTokens(startDate, endDate, { compact = false } = {}) {
  const days = inclusiveDayCount(startDate, endDate);
  const base = compact ? 2000 : 3000;
  const perDay = compact ? 400 : 600;
  return Math.min(MAX_TOKENS, Math.max(3000, base + days * perDay));
}

async function requestTripPlan({ system, user, maxTokens }, deps, { cache = false } = {}) {
  // Shared model-call wrapper — delegates to aiClient for provider-agnostic model calls.
  // cache=true enables Anthropic prompt caching on the system message (first attempt only).
  // GPT-5.4 nano — 200 t/s, native JSON, $0.003/trip. Fallback: Anthropic.
  return callModel({ system, user, maxTokens, temperature: 0, caller: "tripPlan", provider: "openai", model: "gpt-5.4-nano" }, deps);
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

function buildQualityRetryPrompt(basePrompt, qualityError) {
  const duplicateLines = qualityError?.quality?.duplicates?.slice(0, MAX_QUALITY_ISSUES_IN_PROMPT)
    .map((dup) => `- ${dup.name}: ${dup.firstDay} and ${dup.repeatedDay}`)
    .join("\n");

  return {
    system: `${basePrompt.system}

QUALITY FAILURE FROM PRIOR ATTEMPT:
- The previous itinerary reused the same attractions on multiple days.
- This is invalid. Regenerate the ENTIRE itinerary so every activity appears on only one day.
- If you need variety, choose different real attractions in the same destination.
- Do not recycle attractions just to fill the day count.`,
    user: `${basePrompt.user}

The last attempt failed quality checks because these activities were repeated across different days:
${duplicateLines || "- repeated activities were detected"}

Regenerate the full trip plan as strict JSON. Every day must be distinct and no activity may appear on multiple days.`,
  };
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
  const expectedDays = inclusiveDayCount(startDate, endDate);
  const maxActivities = Math.max(expectedDays * 6, 10);

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
      const firstParsed = parseTripPlanResponse(firstAttempt.responseText, { expectedDays, maxActivities });
      return assertTripPlanQuality(firstParsed);
    } catch (firstParseError) {
      const isQualityFailure = firstParseError.code === "TRIP_PLAN_REPEATS";
      log.warn(
        isQualityFailure
          ? "Trip-plan quality failed (attempt 1), retrying with stronger anti-repeat guidance"
          : "Trip-plan parse failed (attempt 1), retrying compact",
        { error: firstParseError.message },
      );

      const retryPrompt = isQualityFailure
        ? buildQualityRetryPrompt(primaryPrompt, firstParseError)
        : buildTripPlanPrompt(
          destination,
          startDate,
          endDate,
          activities,
          children,
          weatherForecast,
          { compact: true, tripType, countryCode, foodPreferences, pets, plannerSummary, cachedAttractions },
        );
      const retryMaxTokens = isQualityFailure
        ? primaryMaxTokens
        : getTripPlanMaxTokens(startDate, endDate, { compact: true });

      const secondAttempt = await requestWithRetry(
        () => requestTripPlan({ ...retryPrompt, maxTokens: retryMaxTokens }, deps),
        MAX_RETRIES,
      );

      try {
        const secondParsed = parseTripPlanResponse(secondAttempt.responseText, { expectedDays, maxActivities });
        try {
          return assertTripPlanQuality(secondParsed);
        } catch (secondQualityError) {
          if (secondQualityError.code === "TRIP_PLAN_REPEATS") {
            log.warn("Trip-plan quality still repetitive after retry; returning best-effort plan", {
              error: secondQualityError.message,
            });
            return secondParsed;
          }
          throw secondQualityError;
        }
      } catch (secondParseError) {
        if (secondParseError.code === "TRIP_PLAN_REPEATS") {
          throw secondParseError;
        }

        log.warn("Trip-plan parse failed (attempt 2), trying repair", { error: secondParseError.message });

        const repairSource = secondAttempt.responseText || firstAttempt.responseText;
        const repairAttempt = await repairTripPlanJson(repairSource, deps);

        try {
          const repaired = parseTripPlanResponse(repairAttempt.responseText, { expectedDays, maxActivities });
          try {
            return assertTripPlanQuality(repaired);
          } catch (repairQualityError) {
            if (repairQualityError.code === "TRIP_PLAN_REPEATS") {
              log.warn("Trip-plan quality still repetitive after repair; returning best-effort plan", {
                error: repairQualityError.message,
              });
              return repaired;
            }
            throw repairQualityError;
          }
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
  const totalDays = inclusiveDayCount(startDate, endDate);

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
  const generateTripPlanFn = deps.generateTripPlanFn || generateTripPlan;
  const throwIfAborted = () => {
    if (!deps?.shouldAbort?.()) return;
    const err = new Error("Trip generation aborted");
    err.name = "AbortError";
    throw err;
  };
  const chunks = computeChunks(tripData.startDate, tripData.endDate);

  if (chunks.length === 1) {
    throwIfAborted();
    // Short trip — single generation
    const result = await generateTripPlanFn(tripData, weather, deps);
    throwIfAborted();
    onChunk(result, { chunk: 1, totalChunks: 1, dayOffset: 0 });
    return result;
  }

  // Multi-chunk generation
  const chunkResults = [];
  for (const chunk of chunks) {
    throwIfAborted();
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

    const result = await generateTripPlanFn(chunkData, weather, deps);
    throwIfAborted();
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
**USER'S SAVED TRAVEL PROFILE (MUST respect — this is personalized data):**
- These preferences are from the user's imported travel profile. They STRONGLY influence the trip.
- Dietary restrictions: apply to ALL dinner recommendations.
- Activity preferences and avoidances: prioritize what they like, AVOID what they don't.
- Pace preference: controls how many activities per day and travel gaps.
- If they avoid crowds, don't suggest peak-hour attractions.
- If they prefer budget options, include free/cheap activities and mention costs.`
    : "";

  const attractionMemoryContext = hasShortlist
    ? `
**MANDATORY ATTRACTION LIST — USE THESE (do not invent replacements):**
${buildCachedAttractionsSummary(cachedAttractions, {
  maxItems: Math.min(cachedAttractions.length, 32),
  compact: true,
})}

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
        "dinner": { "name": "A must-visit, highly recommended restaurant", "cuisine": "Type", "note": "Why it's special — not a chain" }
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
6. EVERY DAY must have 4-6 activities (NOT counting meals). Activities should include: major attractions, walking/city tours, parks, museums, neighborhoods to explore, viewpoints, shopping areas, etc.
7. **ABSOLUTE RULE — DAY COUNT**: The number of day objects in dailyItinerary MUST EXACTLY EQUAL the number of days in the trip. Dates ${startDate} to ${endDate} = you must return exactly that many day objects.
8. For city trips of 1-3 days: include at least one "City Walking Tour" or "Hop-On Hop-Off Bus Tour" that covers 4-5 landmarks as a single activity.
9. **ABSOLUTE RULE — NO REPEATS**: NEVER use the same activity on multiple days. Each activity ID must appear in ONLY ONE day's activities array. Before returning JSON, CHECK every day — if any activity name appears in more than one day, REPLACE the duplicate with a different attraction. Going to the same beach/park/museum twice across the trip is INVALID.
10. **SCHEDULING**: Start activities in the MORNING (9 AM). All activities must finish by 7 PM. A family day: activity 9AM → activity 11AM → activity 1PM → activity 3PM → activity 5PM → dinner 7PM. NO activities after 7 PM for trips with children.
11. **VARIETY**: Each day MUST have a DIFFERENT theme/area. Day 1: downtown/waterfront. Day 2: theme park/zoo. Day 3: beaches/nature. Day 4: museums/culture. Cover the FULL breadth — not the same neighborhood repeated.
12. For every activity, include a short "whatItIs" and "whyRecommended".
13. **DINNER ONLY**: Suggest ONLY dinner (no breakfast or lunch). The dinner must be a highly-rated, locally famous restaurant — NOT a chain like Olive Garden, Denny's, IHOP, or California Pizza Kitchen. Match the user's dietary preferences. One dinner per day as {"name": "Famous Local Restaurant", "cuisine": "Type", "note": "Why it's a must-visit"}.
14. Only suggest currently operating places and restaurants.
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
- Dates: ${startDate} to ${endDate} (${(() => {
    const s = new Date(startDate + "T12:00:00Z");
    const e = new Date(endDate + "T12:00:00Z");
    const days = Math.max(1, Math.ceil((e - s) / 86400000) + 1); // Inclusive: Apr 4-5 = 2 days
    const dates = [];
    for (let i = 0; i < days; i++) {
      const d = new Date(s);
      d.setUTCDate(d.getUTCDate() + i);
      dates.push(d.toISOString().split("T")[0]);
    }
    return `${days} days: ${dates.join(", ")}`;
  })()})
- **YOU MUST RETURN EXACTLY ${Math.max(1, Math.ceil((new Date(endDate + "T12:00:00Z") - new Date(startDate + "T12:00:00Z")) / 86400000) + 1)} DAY OBJECTS in dailyItinerary. One for each date listed above.**
- Interested Activities: ${activities.join(", ")}
- ${isAdultsOnly ? "Travelers: Adults only (no children)" : `Children: ${children.length} child(ren) - ${childrenInfo}`}
${plannerSummary ? `

**Known Traveler Preferences:**
${plannerSummary}` : ""}
${Array.isArray(cachedAttractions) && cachedAttractions.length > 0 ? `
- Verified attraction candidates already provided in the system shortlist: ${cachedAttractions.length}` : ""}

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
