/**
 * profileMerge.test.js — TDD Red for Phase 5: profile merge logic
 *
 * Tests the merge of saved profile + current trip intent into a compact
 * planner summary for AI prompt injection.
 *
 * Merge precedence (per PRD §8):
 *   1. safety/legal constraints
 *   2. explicit trip hard constraints
 *   3. explicit trip soft preferences
 *   4. saved profile high-confidence
 *   5. saved profile medium-confidence
 *   6. saved profile low-confidence
 *   7. model inference
 */

import test from "node:test";
import assert from "node:assert/strict";

// Will be implemented in src/backend/services/profileMerge.js
import { mergeProfileAndIntent, buildPlannerSummary } from "../../src/backend/services/profileMerge.js";

// ── Test fixtures ───────────────────────────────────────────────────────────

const MOCK_PROFILE = {
  food: {
    cuisinesLiked: ["mexican", "japanese"],
    cuisinesDisliked: ["fast food"],
    dietaryRestrictions: ["nut allergy"],
    kidFoods: ["mac and cheese", "chicken nuggets"],
    foodAdventurousness: "medium",
    notes: "",
    meta: { confidence: "high", sourceBasis: ["memory"] },
  },
  travelStyle: {
    pace: "moderate",
    planningStyle: "structured",
    accommodationPreference: "family-friendly hotels",
    transportPreference: "walkable areas",
    notes: "",
    meta: { confidence: "medium", sourceBasis: ["inference"] },
  },
  activities: {
    preferredActivities: ["aquariums", "parks", "beaches"],
    dislikedActivities: ["nightlife", "casinos"],
    activityIntensity: "moderate",
    notes: "",
    meta: { confidence: "medium", sourceBasis: ["memory"] },
  },
  personality: {
    travelerType: "family comfort planner",
    noveltyVsComfort: 3,
    crowdTolerance: "low",
    notes: "",
    meta: { confidence: "medium", sourceBasis: ["inference"] },
  },
  family: {
    travelingWith: "partner and 2 kids",
    kidsDetails: "ages 4 and 8",
    kidPreferences: "animals, playgrounds",
    notes: "",
    meta: { confidence: "high", sourceBasis: ["memory"] },
  },
  constraints: {
    budgetRange: "moderate",
    timeConstraints: "early dinners preferred",
    accessibilityNeeds: "",
    notes: "",
    meta: { confidence: "medium", sourceBasis: ["inference"] },
  },
  priorities: {
    mustHaves: ["kid-friendly food", "not too rushed"],
    avoidances: ["overcrowded attractions"],
    notes: "",
    meta: { confidence: "high", sourceBasis: ["memory"] },
  },
  profileSummary: "Moderate-paced family traveler who prefers kid-friendly, lower-stress trips.",
  unknowns: [],
};

const MOCK_TRIP_INTENT = {
  destination: "San Diego, CA",
  startDate: "2026-04-12",
  endDate: "2026-04-15",
  adults: 2,
  childrenAges: [4, 8],
  pets: [],
  vibe: "beach",
  foodPreferences: { dietary: ["vegan"], cuisines: ["seafood"], avoidances: [], kidFoods: [], budget: null },
  tripGoals: ["relax at the beach"],
  mustHaves: ["La Jolla Cove"],
  avoidances: ["downtown bar scene"],
  accommodationPreferences: [],
  transportPreferences: [],
  pacePreference: "slow",
  budgetSignals: [],
  accessibilityNeeds: [],
  scheduleConstraints: [],
  celebrationContext: null,
  specialNotes: [],
  extraContext: ["first time visiting San Diego"],
};

// ── mergeProfileAndIntent tests ─────────────────────────────────────────────

test("mergeProfileAndIntent returns merged object with all sections", () => {
  const merged = mergeProfileAndIntent(MOCK_PROFILE, MOCK_TRIP_INTENT);

  assert.ok(merged.food, "merged must have food section");
  assert.ok(merged.activities, "merged must have activities section");
  assert.ok(merged.constraints, "merged must have constraints section");
  assert.ok(merged.tripSpecific, "merged must have tripSpecific section");
});

test("trip-specific dietary restrictions override profile defaults", () => {
  const merged = mergeProfileAndIntent(MOCK_PROFILE, MOCK_TRIP_INTENT);

  // Trip says "vegan" — this should appear in merged dietary
  assert.ok(
    merged.food.dietaryRestrictions.includes("vegan"),
    "Trip-specific vegan must be in merged dietary restrictions",
  );
  // Profile's nut allergy should ALSO be preserved (safety constraint)
  assert.ok(
    merged.food.dietaryRestrictions.includes("nut allergy"),
    "Profile nut allergy must be preserved (safety constraint)",
  );
});

test("trip-specific pace overrides profile pace", () => {
  const merged = mergeProfileAndIntent(MOCK_PROFILE, MOCK_TRIP_INTENT);

  // Trip says "slow", profile says "moderate" — trip wins
  assert.strictEqual(merged.pace, "slow", "Trip pace should override profile pace");
});

test("trip mustHaves override profile mustHaves", () => {
  const merged = mergeProfileAndIntent(MOCK_PROFILE, MOCK_TRIP_INTENT);

  assert.ok(
    merged.mustHaves.includes("La Jolla Cove"),
    "Trip-specific mustHave must appear",
  );
});

test("avoidances from both profile and trip are combined", () => {
  const merged = mergeProfileAndIntent(MOCK_PROFILE, MOCK_TRIP_INTENT);

  assert.ok(merged.avoidances.includes("overcrowded attractions"), "Profile avoidance preserved");
  assert.ok(merged.avoidances.includes("downtown bar scene"), "Trip avoidance included");
});

test("mergeProfileAndIntent works with null profile", () => {
  const merged = mergeProfileAndIntent(null, MOCK_TRIP_INTENT);

  assert.ok(merged, "Should return a valid merged object even with null profile");
  assert.strictEqual(merged.pace, "slow", "Should use trip pace when no profile");
});

test("mergeProfileAndIntent works with null trip intent", () => {
  const merged = mergeProfileAndIntent(MOCK_PROFILE, null);

  assert.ok(merged, "Should return a valid merged object even with null trip intent");
  assert.strictEqual(merged.pace, "moderate", "Should use profile pace when no trip intent");
});

test("profile disliked activities are preserved in avoidances", () => {
  const merged = mergeProfileAndIntent(MOCK_PROFILE, MOCK_TRIP_INTENT);

  assert.ok(
    merged.activityAvoidances.includes("nightlife") || merged.avoidances.includes("nightlife"),
    "Disliked activities should appear in avoidances",
  );
});

// ── buildPlannerSummary tests ───────────────────────────────────────────────

test("buildPlannerSummary returns a string under 500 tokens", () => {
  const merged = mergeProfileAndIntent(MOCK_PROFILE, MOCK_TRIP_INTENT);
  const summary = buildPlannerSummary(merged);

  assert.ok(typeof summary === "string", "Summary must be a string");
  // Rough token estimate: 1 token ≈ 4 chars, 500 tokens ≈ 2000 chars
  assert.ok(summary.length < 2500, `Summary must be under ~500 tokens (got ${summary.length} chars)`);
  assert.ok(summary.length > 50, "Summary must have meaningful content");
});

test("buildPlannerSummary includes dietary restrictions", () => {
  const merged = mergeProfileAndIntent(MOCK_PROFILE, MOCK_TRIP_INTENT);
  const summary = buildPlannerSummary(merged);

  assert.ok(
    summary.toLowerCase().includes("nut allergy") || summary.toLowerCase().includes("vegan"),
    "Summary must mention dietary restrictions",
  );
});

test("buildPlannerSummary includes avoidances", () => {
  const merged = mergeProfileAndIntent(MOCK_PROFILE, MOCK_TRIP_INTENT);
  const summary = buildPlannerSummary(merged);

  assert.ok(
    summary.toLowerCase().includes("avoid") || summary.toLowerCase().includes("nightlife"),
    "Summary must mention avoidances",
  );
});

test("buildPlannerSummary includes trip-specific context", () => {
  const merged = mergeProfileAndIntent(MOCK_PROFILE, MOCK_TRIP_INTENT);
  const summary = buildPlannerSummary(merged);

  assert.ok(
    summary.includes("La Jolla Cove") || summary.includes("first time"),
    "Summary must include trip-specific context",
  );
});

test("buildPlannerSummary works with no profile (anonymous user)", () => {
  const merged = mergeProfileAndIntent(null, MOCK_TRIP_INTENT);
  const summary = buildPlannerSummary(merged);

  assert.ok(typeof summary === "string", "Summary must be a string");
  assert.ok(summary.length > 10, "Summary must have content even without profile");
});
