/**
 * Family-fit judgment for an attraction, from Claude.
 *
 * Google Places says whether a place exists, where it is, and its rating, hours and price. It cannot say
 * whether a toddler will like it. That judgment is the only thing Claude is asked for here, and the model
 * is given only facts that came from Google, never asked for hours or ratings.
 */
import { callModel } from "../utils/aiClient.js";

export const FAMILY_FIT_VERSION = "family-fit-v1";
export const FAMILY_FIT_MODEL = process.env.ATTRACTION_FIT_MODEL || "claude-haiku-5-5";

const AGE_BANDS = ["infant", "toddler", "preschool", "elementary", "tween", "teen"];
const INDOOR_OUTDOOR = ["indoor", "outdoor", "both"];
const CATEGORIES = [
  "museum", "zoo_aquarium", "park_playground", "beach_water", "nature_trail", "theme_park",
  "landmark", "market_shopping", "show_entertainment", "restaurant", "tour_activity", "other",
];

const SYSTEM = `You judge how well a place suits a family trip with children.
You are given facts about one place from Google Maps. Use only those facts and general knowledge of the place type.
Do not state opening hours, ticket prices, ratings or addresses, and do not invent details.
Reply with one JSON object and nothing else, with exactly these keys:
kidAppeal (integer 1-10), parentAppeal (integer 1-10),
ageBands (array of any of: ${AGE_BANDS.join(", ")}), indoorOutdoor (${INDOOR_OUTDOOR.join(" | ")}),
strollerFriendly (boolean), typicalDurationMinutes (integer, a typical family visit),
category (one of: ${CATEGORIES.join(", ")}),
fineDining (boolean, true only for formal fine-dining restaurants),
adultsOnly (boolean, true for bars, nightclubs, casinos, adult venues),
bookingLikelyNeeded (boolean), reason (one sentence, under 160 characters).`;

function userPrompt(place) {
  const lines = [
    `Name: ${place.name}`,
    `City: ${place.city}`,
    place.primaryType && `Main type: ${place.primaryType}`,
    place.types?.length && `All types: ${place.types.join(", ")}`,
    Number.isFinite(place.priceLevel) && `Price level (0 free to 4 very expensive): ${place.priceLevel}`,
  ].filter(Boolean);
  return lines.join("\n");
}

function extractJson(text) {
  const trimmed = String(text || "").trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start === -1 || end <= start) throw new Error("reply had no JSON object");
    return JSON.parse(trimmed.slice(start, end + 1));
  }
}

function score(value, key) {
  if (!Number.isInteger(value) || value < 1 || value > 10) throw new Error(`${key} must be an integer 1-10`);
  return value;
}

function validate(raw) {
  if (!raw || typeof raw !== "object") throw new Error("reply was not an object");
  if (!Array.isArray(raw.ageBands) || !raw.ageBands.length || raw.ageBands.some((b) => !AGE_BANDS.includes(b))) {
    throw new Error("ageBands has an unknown value");
  }
  if (!INDOOR_OUTDOOR.includes(raw.indoorOutdoor)) throw new Error("indoorOutdoor has an unknown value");
  if (!CATEGORIES.includes(raw.category)) throw new Error("category has an unknown value");
  for (const key of ["strollerFriendly", "fineDining", "adultsOnly", "bookingLikelyNeeded"]) {
    if (typeof raw[key] !== "boolean") throw new Error(`${key} must be a boolean`);
  }
  if (!Number.isFinite(raw.typicalDurationMinutes)) throw new Error("typicalDurationMinutes must be a number");
  return {
    kidAppeal: score(raw.kidAppeal, "kidAppeal"),
    parentAppeal: score(raw.parentAppeal, "parentAppeal"),
    ageBands: [...new Set(raw.ageBands)],
    indoorOutdoor: raw.indoorOutdoor,
    strollerFriendly: raw.strollerFriendly,
    typicalDurationMinutes: Math.min(480, Math.max(30, Math.round(raw.typicalDurationMinutes))),
    category: raw.category,
    fineDining: raw.fineDining,
    adultsOnly: raw.adultsOnly,
    bookingLikelyNeeded: raw.bookingLikelyNeeded,
    reason: String(raw.reason || "").slice(0, 160),
  };
}

/** @returns {Promise<{ok: true, fit: object, usage?: object} | {ok: false, error: string}>} */
export async function assessFamilyFit(place, { callModelFn = callModel, model = FAMILY_FIT_MODEL } = {}) {
  try {
    const response = await callModelFn({
      system: SYSTEM,
      user: userPrompt(place),
      provider: "anthropic",
      model,
      effort: "low",
      maxTokens: 1500,
      caller: "attractionFit",
    });
    return { ok: true, fit: validate(extractJson(response.responseText)), usage: response.aiUsage };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

function durationBucket(minutes) {
  if (minutes < 60) return "under_1h";
  if (minutes <= 120) return "1_2h";
  if (minutes <= 240) return "2_4h";
  if (minutes < 480) return "half_day";
  return "full_day";
}

/** The city_attractions columns a family-fit assessment fills in. */
export function fitToRowUpdate(fit, { model = FAMILY_FIT_MODEL, now = new Date().toISOString() } = {}) {
  return {
    kid_appeal_score: fit.kidAppeal,
    parent_appeal_score: fit.parentAppeal,
    age_bands_json: fit.ageBands,
    indoor_outdoor: fit.indoorOutdoor,
    stroller_friendly: fit.strollerFriendly,
    duration_bucket: durationBucket(fit.typicalDurationMinutes),
    booking_needed: fit.bookingLikelyNeeded,
    family_fit_json: {
      version: FAMILY_FIT_VERSION,
      model,
      assessedAt: now,
      typicalDurationMinutes: fit.typicalDurationMinutes,
      category: fit.category,
      fineDining: fit.fineDining,
      adultsOnly: fit.adultsOnly,
      reason: fit.reason,
    },
  };
}
