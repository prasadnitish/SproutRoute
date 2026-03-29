import { sanitizeFoodPreferences } from "./inputSafety.js";
import { sanitizeArray, sanitizeString } from "../utils/sanitize.js";

const VALID_PACES = new Set(["slow", "moderate", "fast"]);

function sanitizeProfileSectionMeta(meta = {}) {
  const confidence = ["high", "medium", "low"].includes(meta?.confidence)
    ? meta.confidence
    : "medium";
  const sourceBasis = sanitizeArray(meta?.sourceBasis || meta?.source_basis || [], 5);
  return {
    confidence,
    sourceBasis: sourceBasis.length > 0 ? sourceBasis : ["inference"],
  };
}

function sanitizeProfileSection(section = {}, fields = {}) {
  const safe = {};
  for (const [key, config] of Object.entries(fields)) {
    const value = section?.[key];
    if (config === "array") safe[key] = sanitizeArray(value, 8);
    else if (config === "string") safe[key] = sanitizeString(value || "", 200);
    else if (Array.isArray(config)) safe[key] = config.includes(value) ? value : "unknown";
    else safe[key] = value ?? null;
  }
  safe.meta = sanitizeProfileSectionMeta(section?.meta || {});
  return safe;
}

export function sanitizeProfileForPlanning(profile) {
  if (!profile || typeof profile !== "object") return null;

  return {
    food: sanitizeProfileSection(profile.food, {
      cuisinesLiked: "array",
      cuisinesDisliked: "array",
      dietaryRestrictions: "array",
      kidFoods: "array",
      foodAdventurousness: ["low", "medium", "high", "unknown"],
      notes: "string",
    }),
    travelStyle: sanitizeProfileSection(profile.travelStyle, {
      pace: ["slow", "moderate", "fast", "unknown"],
      planningStyle: ["structured", "flexible", "spontaneous", "unknown"],
      accommodationPreference: "string",
      transportPreference: "string",
      notes: "string",
    }),
    activities: sanitizeProfileSection(profile.activities, {
      preferredActivities: "array",
      dislikedActivities: "array",
      activityIntensity: ["relaxed", "moderate", "active", "unknown"],
      notes: "string",
    }),
    personality: sanitizeProfileSection(profile.personality, {
      travelerType: "string",
      crowdTolerance: ["low", "medium", "high", "unknown"],
      notes: "string",
    }),
    family: sanitizeProfileSection(profile.family, {
      travelingWith: "string",
      kidsDetails: "string",
      kidPreferences: "string",
      petContext: "string",
      notes: "string",
    }),
    constraints: sanitizeProfileSection(profile.constraints, {
      budgetRange: "string",
      timeConstraints: "string",
      accessibilityNeeds: "string",
      notes: "string",
    }),
    priorities: sanitizeProfileSection(profile.priorities, {
      mustHaves: "array",
      avoidances: "array",
      notes: "string",
    }),
    profileSummary: sanitizeString(profile.profileSummary || "", 500),
    unknowns: sanitizeArray(profile.unknowns || [], 8),
  };
}

export function sanitizeTripIntentFields(intent = {}) {
  return {
    destination: sanitizeString(intent.destination || "", 100) || null,
    vibe: sanitizeString(intent.vibe || "", 40),
    childrenAges: Array.isArray(intent.childrenAges)
      ? intent.childrenAges
        .map((age) => Number.parseInt(String(age), 10))
        .filter((age) => Number.isFinite(age) && age >= 0 && age <= 18)
        .slice(0, 10)
      : [],
    pets: Array.isArray(intent.pets) ? intent.pets.slice(0, 5) : [],
    foodPreferences: sanitizeFoodPreferences(intent.foodPreferences),
    tripGoals: sanitizeArray(intent.tripGoals, 6),
    mustHaves: sanitizeArray(intent.mustHaves, 8),
    avoidances: sanitizeArray(intent.avoidances, 8),
    pacePreference: VALID_PACES.has(intent.pacePreference) ? intent.pacePreference : "unknown",
    budgetSignals: sanitizeArray(intent.budgetSignals, 4),
    accommodationPreferences: sanitizeArray(intent.accommodationPreferences, 5),
    transportPreferences: sanitizeArray(intent.transportPreferences, 5),
    accessibilityNeeds: sanitizeArray(intent.accessibilityNeeds, 5),
    scheduleConstraints: sanitizeArray(intent.scheduleConstraints, 6),
    celebrationContext: sanitizeString(intent.celebrationContext || "", 120) || null,
    specialNotes: sanitizeArray(intent.specialNotes, 6),
    extraContext: sanitizeArray(intent.extraContext, 8),
  };
}
