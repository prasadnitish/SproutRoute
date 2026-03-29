/**
 * profileMerge.js — Merge saved profile + trip intent into planner context
 *
 * Merge precedence (PRD §8):
 *   1. safety/legal constraints (dietary restrictions, allergies)
 *   2. explicit trip hard constraints (mustHaves, avoidances)
 *   3. explicit trip soft preferences (pace, vibe, cuisine)
 *   4. saved profile high-confidence fields
 *   5. saved profile medium-confidence fields
 *   6. saved profile low-confidence fields
 *   7. model inference from destination/weather/activity context
 *
 * Output:
 *   - mergeProfileAndIntent() → structured merged object
 *   - buildPlannerSummary() → compact text string for AI prompt (target: 150-300 tokens, cap: 500)
 */

/**
 * Merge a saved user profile with current trip intent.
 * Either argument can be null (anonymous user or no trip context).
 *
 * @param {object|null} profile — UserTravelProfile from DB
 * @param {object|null} intent  — ParsedTripIntent from current request
 * @returns {object} merged context
 */
export function mergeProfileAndIntent(profile, intent) {
  const p = profile || {};
  const t = intent || {};

  // ── Food: safety-first merge ──────────────────────────────────────────────
  const profileDietary = p.food?.dietaryRestrictions || [];
  const tripDietary = t.foodPreferences?.dietary || [];
  // Safety/allergies always preserved, trip-specific diet added
  const dietaryRestrictions = [...new Set([...profileDietary, ...tripDietary])];

  const cuisinesLiked = [
    ...(t.foodPreferences?.cuisines || []),
    ...(p.food?.cuisinesLiked || []),
  ];
  const cuisinesDisliked = p.food?.cuisinesDisliked || [];
  const kidFoods = [
    ...(t.foodPreferences?.kidFoods || []),
    ...(p.food?.kidFoods || []),
  ];

  // ── Pace: trip overrides profile ──────────────────────────────────────────
  const pace = (t.pacePreference && t.pacePreference !== "unknown")
    ? t.pacePreference
    : (p.travelStyle?.pace || "unknown");

  // ── Activities ────────────────────────────────────────────────────────────
  const preferredActivities = p.activities?.preferredActivities || [];
  const activityAvoidances = [
    ...(p.activities?.dislikedActivities || []),
  ];

  // ── Must-haves and avoidances: combine both sources ───────────────────────
  const mustHaves = [
    ...(t.mustHaves || []),
    ...(p.priorities?.mustHaves || []),
  ];
  const avoidances = [
    ...(t.avoidances || []),
    ...(p.priorities?.avoidances || []),
    ...(p.activities?.dislikedActivities || []),
  ];

  // ── Constraints ───────────────────────────────────────────────────────────
  const budgetRange = t.budgetSignals?.length
    ? t.budgetSignals.join(", ")
    : (p.constraints?.budgetRange || "");
  const accessibilityNeeds = [
    ...(t.accessibilityNeeds || []),
    ...(p.constraints?.accessibilityNeeds ? [p.constraints.accessibilityNeeds] : []),
  ].filter(Boolean);

  // ── Accommodation + transport ─────────────────────────────────────────────
  const accommodationPreferences = [
    ...(t.accommodationPreferences || []),
    ...(p.travelStyle?.accommodationPreference ? [p.travelStyle.accommodationPreference] : []),
  ];
  const transportPreferences = [
    ...(t.transportPreferences || []),
    ...(p.travelStyle?.transportPreference ? [p.travelStyle.transportPreference] : []),
  ];

  // ── Trip-specific context ─────────────────────────────────────────────────
  const tripSpecific = {
    destination: t.destination || null,
    vibe: t.vibe || "",
    tripGoals: t.tripGoals || [],
    celebrationContext: t.celebrationContext || null,
    specialNotes: t.specialNotes || [],
    extraContext: t.extraContext || [],
    scheduleConstraints: t.scheduleConstraints || [],
  };

  // ── Family context ────────────────────────────────────────────────────────
  const family = {
    travelingWith: p.family?.travelingWith || "",
    kidsDetails: p.family?.kidsDetails || "",
    kidPreferences: p.family?.kidPreferences || "",
    childrenAges: t.childrenAges || [],
    pets: t.pets || [],
  };

  // ── Personality (from profile only) ───────────────────────────────────────
  const personality = {
    crowdTolerance: p.personality?.crowdTolerance || "unknown",
    foodAdventurousness: p.food?.foodAdventurousness || "unknown",
    planningStyle: p.travelStyle?.planningStyle || "unknown",
  };

  return {
    food: {
      dietaryRestrictions,
      cuisinesLiked: [...new Set(cuisinesLiked)],
      cuisinesDisliked,
      kidFoods: [...new Set(kidFoods)],
    },
    activities: { preferredActivities },
    activityAvoidances,
    pace,
    mustHaves: [...new Set(mustHaves)],
    avoidances: [...new Set(avoidances)],
    constraints: { budgetRange, accessibilityNeeds },
    accommodationPreferences,
    transportPreferences,
    tripSpecific,
    family,
    personality,
    profileSummary: p.profileSummary || "",
  };
}

/**
 * Build a compact planner summary string from merged context.
 * Target: 150-300 tokens. Hard cap: 500 tokens (~2000 chars).
 *
 * This string gets injected into the AI itinerary/packing prompts.
 *
 * @param {object} merged — output of mergeProfileAndIntent
 * @returns {string} compact planner summary
 */
export function buildPlannerSummary(merged) {
  const lines = [];

  // Profile baseline
  if (merged.profileSummary) {
    lines.push(`Traveler: ${merged.profileSummary}`);
  }

  // Pace
  if (merged.pace && merged.pace !== "unknown") {
    lines.push(`Pace: ${merged.pace}`);
  }

  // Dietary (safety-critical — always include)
  if (merged.food.dietaryRestrictions.length > 0) {
    lines.push(`Dietary restrictions: ${merged.food.dietaryRestrictions.join(", ")}`);
  }

  // Food preferences
  if (merged.food.cuisinesLiked.length > 0) {
    lines.push(`Preferred cuisines: ${merged.food.cuisinesLiked.slice(0, 5).join(", ")}`);
  }
  if (merged.food.kidFoods.length > 0) {
    lines.push(`Kid-friendly foods: ${merged.food.kidFoods.slice(0, 4).join(", ")}`);
  }

  // Must-haves
  if (merged.mustHaves.length > 0) {
    lines.push(`Must include: ${merged.mustHaves.slice(0, 5).join(", ")}`);
  }

  // Avoidances (stronger than preferences)
  if (merged.avoidances.length > 0) {
    lines.push(`Avoid: ${merged.avoidances.slice(0, 5).join(", ")}`);
  }

  // Activity preferences
  if (merged.activities.preferredActivities.length > 0) {
    lines.push(`Preferred activities: ${merged.activities.preferredActivities.slice(0, 5).join(", ")}`);
  }

  // Crowd tolerance
  if (merged.personality.crowdTolerance && merged.personality.crowdTolerance !== "unknown") {
    lines.push(`Crowd tolerance: ${merged.personality.crowdTolerance}`);
  }

  // Trip-specific goals
  if (merged.tripSpecific.tripGoals.length > 0) {
    lines.push(`Trip goals: ${merged.tripSpecific.tripGoals.slice(0, 3).join(", ")}`);
  }

  // Celebration context
  if (merged.tripSpecific.celebrationContext) {
    lines.push(`Special occasion: ${merged.tripSpecific.celebrationContext}`);
  }

  // Extra context (preserved from parsing)
  if (merged.tripSpecific.extraContext.length > 0) {
    lines.push(`Note: ${merged.tripSpecific.extraContext.slice(0, 3).join("; ")}`);
  }

  // Accommodation
  if (merged.accommodationPreferences.length > 0) {
    lines.push(`Accommodation: ${merged.accommodationPreferences.slice(0, 2).join(", ")}`);
  }

  // Budget
  if (merged.constraints.budgetRange) {
    lines.push(`Budget: ${merged.constraints.budgetRange}`);
  }

  // Accessibility
  if (merged.constraints.accessibilityNeeds.length > 0) {
    lines.push(`Accessibility: ${merged.constraints.accessibilityNeeds.join(", ")}`);
  }

  // Schedule constraints
  if (merged.tripSpecific.scheduleConstraints.length > 0) {
    lines.push(`Schedule: ${merged.tripSpecific.scheduleConstraints.slice(0, 3).join(", ")}`);
  }

  const summary = lines.join("\n");

  // Hard cap: truncate to ~2000 chars (~500 tokens)
  if (summary.length > 2000) {
    return summary.slice(0, 2000) + "\n[Profile truncated]";
  }

  return summary;
}
