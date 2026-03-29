// tests/unit/parseInput.test.js
import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import { parseInput } from "../../src/backend/services/parseInput.js";

describe("parseInput", () => {
  const mockAI = async (prompt) => {
    if (prompt.includes("beach vacation")) {
      return JSON.stringify({
        destination: "Maui, Hawaii",
        startDate: "2026-04-12",
        endDate: "2026-04-19",
        adults: 2,
        childrenAges: [4, 8],
        vibe: "beach",
      });
    }
    if (prompt.includes("relaxing trip")) {
      return JSON.stringify({
        destination: null,
        suggestedDestinations: [
          { name: "Maui, Hawaii", emoji: "🌴", description: "Stunning beaches", season_note: "Perfect spring weather" },
          { name: "Cancun, Mexico", emoji: "🏖", description: "All-inclusive resorts", season_note: "Warm and sunny" },
          { name: "San Diego, CA", emoji: "☀️", description: "Family-friendly coast", season_note: "Mild spring temps" },
        ],
        adults: 2,
        childrenAges: [],
        vibe: "relaxing",
      });
    }
    return JSON.stringify({ destination: null, adults: 1, childrenAges: [], vibe: "general" });
  };

  it("parses specific input with destination", async () => {
    const result = await parseInput("beach vacation in Maui with two kids age 4 and 8", { callAI: mockAI });
    assert.equal(result.destination, "Maui, Hawaii");
    assert.deepEqual(result.childrenAges, [4, 8]);
    assert.equal(result.vibe, "beach");
  });

  it("returns suggestions for vague input", async () => {
    const result = await parseInput("relaxing trip for spring break", { callAI: mockAI });
    assert.equal(result.destination, null);
    assert.equal(result.suggestedDestinations.length, 3);
    assert.equal(result.suggestedDestinations[0].name, "Maui, Hawaii");
  });

  it("includes detectedRegion when provided", async () => {
    const result = await parseInput("beach vacation in Maui with two kids age 4 and 8", {
      callAI: mockAI,
      detectedRegion: "Chicago, IL",
    });
    assert.equal(result.detectedRegion, "Chicago, IL");
  });

  it("preserves expanded trip intent fields when the parser returns them", async () => {
    const result = await parseInput("anniversary trip with must-dos", {
      callAI: async () => JSON.stringify({
        destination: "San Diego, CA",
        startDate: "2026-05-10",
        endDate: "2026-05-14",
        adults: 2,
        childrenAges: [],
        vibe: "city",
        tripGoals: ["relax", "great food"],
        mustHaves: ["La Jolla Cove"],
        avoidances: ["crowded nightlife"],
        pacePreference: "slow",
        budgetSignals: ["moderate"],
        accommodationPreferences: ["walkable hotel"],
        transportPreferences: ["minimal driving"],
        accessibilityNeeds: ["step-free access"],
        scheduleConstraints: ["early dinners"],
        celebrationContext: "anniversary",
        specialNotes: ["sunset dinner"],
        extraContext: ["first time visiting"],
      }),
    });

    assert.deepEqual(result.tripGoals, ["relax", "great food"]);
    assert.deepEqual(result.mustHaves, ["La Jolla Cove"]);
    assert.deepEqual(result.avoidances, ["crowded nightlife"]);
    assert.equal(result.pacePreference, "slow");
    assert.deepEqual(result.budgetSignals, ["moderate"]);
    assert.deepEqual(result.accommodationPreferences, ["walkable hotel"]);
    assert.deepEqual(result.transportPreferences, ["minimal driving"]);
    assert.deepEqual(result.accessibilityNeeds, ["step-free access"]);
    assert.deepEqual(result.scheduleConstraints, ["early dinners"]);
    assert.equal(result.celebrationContext, "anniversary");
    assert.deepEqual(result.specialNotes, ["sunset dinner"]);
    assert.deepEqual(result.extraContext, ["first time visiting"]);
  });

  it("fills expanded trip intent fields with safe defaults when omitted", async () => {
    const result = await parseInput("simple beach vacation", { callAI: mockAI });

    assert.deepEqual(result.tripGoals, []);
    assert.deepEqual(result.mustHaves, []);
    assert.deepEqual(result.avoidances, []);
    assert.equal(result.pacePreference, "unknown");
    assert.deepEqual(result.budgetSignals, []);
    assert.deepEqual(result.accommodationPreferences, []);
    assert.deepEqual(result.transportPreferences, []);
    assert.deepEqual(result.accessibilityNeeds, []);
    assert.deepEqual(result.scheduleConstraints, []);
    assert.equal(result.celebrationContext, null);
    assert.deepEqual(result.specialNotes, []);
    assert.deepEqual(result.extraContext, []);
  });
});
