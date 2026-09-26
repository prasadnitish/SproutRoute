import test from "node:test";
import assert from "node:assert/strict";
import { median, scoreOutput, tripTokenBudget, runCase, CASES } from "../../scripts/benchmark-luna.mjs";

test("latency summary uses the conventional median", () => {
  assert.equal(median([4, 1, 3, 2]), 2.5);
  assert.equal(median([4, 1, 3]), 3);
});

test("trip benchmark uses the production two-day output cap", () => {
  assert.equal(tripTokenBudget(2), 4200);
  assert.ok(CASES.trip.some((testCase) => testCase.days === 5 && testCase.id === "tokyo-five-day"));
});

test("targeted benchmark can raise only the itinerary token cap", async () => {
  let observedCap;
  await runCase("trip", CASES.trip[0], "test-model", "low", async (_model, prompt) => {
    observedCap = prompt.maxTokens;
    return { text: "{}", ms: 1 };
  }, { tripMaxTokens: 8000 });
  assert.equal(observedCap, 8000);
});

test("parse scoring catches resolved destinations that still offer choices", () => {
  const good = scoreOutput("parse", {
    destination: "Las Vegas, Nevada",
    suggestedDestinations: [],
    childrenAges: [6],
  }, { destination: "las vegas", childAge: 6, resolved: true });
  assert.equal(good.pass, true);

  const bad = scoreOutput("parse", {
    destination: "Las Vegas, Nevada",
    suggestedDestinations: [{ name: "Las Vegas" }],
    childrenAges: [6],
  }, { destination: "las vegas", childAge: 6, resolved: true });
  assert.equal(bad.pass, false);
  assert.ok(bad.issues.includes("resolved_destination_has_suggestions"));
});

test("trip scoring checks day count, references, density, and repeats", () => {
  const activities = Array.from({ length: 8 }, (_, i) => ({ id: `a${i}`, name: `Place ${i}` }));
  const plan = {
    suggestedActivities: activities,
    dailyItinerary: [
      { day: "Day 1", activities: ["a0", "a1", "a2", "a3"], meals: { dinner: { name: "Cafe One" } } },
      { day: "Day 2", activities: ["a4", "a5", "a6", "a7"], meals: { dinner: { name: "Cafe Two" } } },
    ],
  };
  assert.equal(scoreOutput("trip", plan, { days: 2 }).pass, true);
  const duplicate = structuredClone(plan);
  duplicate.dailyItinerary[1].activities[0] = "a0";
  assert.ok(scoreOutput("trip", duplicate, { days: 2 }).issues.includes("repeated_activity"));
});

test("safety and legal scoring reject wrong anchored facts", () => {
  assert.equal(scoreOutput("safety", {
    emergencyNumber: "911", healthTips: ["Stay hydrated"], familyTips: ["Watch children"],
  }, { emergencyNumber: "911" }).pass, true);
  assert.equal(scoreOutput("safety", {
    emergencyNumber: "112", healthTips: ["Stay hydrated"], familyTips: ["Watch children"],
  }, { emergencyNumber: "911" }).pass, false);
  assert.equal(scoreOutput("law", {
    rules: [{ requiredRestraint: "rear_facing", maxAgeMonths: 23 }],
    citationSnippet: "Children under age 2 must ride rear-facing.",
  }, { requiredRestraint: "rear_facing", maxAgeMonths: 23, sourcePhrase: "under age 2" }).pass, true);
  assert.equal(scoreOutput("law", {
    rules: [{ requiredRestraint: "rear_facing", maxAgeMonths: 47 }],
    citationSnippet: "Children under age 2 must ride rear-facing.",
  }, { requiredRestraint: "rear_facing", maxAgeMonths: 23, sourcePhrase: "under age 2" }).pass, false);
});

test("repair and precompute scoring retain required structure", () => {
  assert.equal(scoreOutput("repair", {
    suggestedActivities: [{ id: "a1", name: "Springs Preserve" }],
    dailyItinerary: [{ day: "Day 1", activities: ["a1"] }],
  }, { preservedName: "Springs Preserve" }).pass, true);
  assert.equal(scoreOutput("precompute", { attractions: [
    { name: "San Diego Zoo", ageBands: [{ label: "toddler", suitability: "great" }], category: "wildlife" },
    { name: "Balboa Park", ageBands: [{ label: "teen", suitability: "great" }], category: "parks" },
  ] }, { minCount: 2 }).pass, true);
  assert.equal(scoreOutput("precompute", { attractions: [{ name: "San Diego Zoo" }] }, { minCount: 2 }).pass, false);
});
