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

  it("deduplicates destination suggestions returned by the parser", async () => {
    const result = await parseInput("relaxing city trip", {
      callAI: async () => JSON.stringify({
        destination: null,
        suggestedDestinations: [
          { name: "New York, NY", emoji: "🏙️", description: "Big city", season_note: "Good in spring" },
          { name: "Boston, MA", emoji: "🧭", description: "History", season_note: "Good in spring" },
          { name: "Boston, MA", emoji: "🧭", description: "History", season_note: "Good in spring" },
          { name: "Philadelphia, PA", emoji: "🔔", description: "Museums", season_note: "Good in spring" },
        ],
        adults: 2,
        childrenAges: [],
        vibe: "city",
      }),
    });

    assert.deepEqual(result.suggestedDestinations.map((s) => s.name), [
      "New York, NY",
      "Boston, MA",
      "Philadelphia, PA",
    ]);
  });

  it("rescues broad country prompts into country tour flow instead of duplicate city choices", async () => {
    const result = await parseInput("trip to japan", {
      callAI: async () => JSON.stringify({
        destination: null,
        suggestedDestinations: [
          { name: "Tokyo", emoji: "🏙️", description: "Big city", season_note: "Good in spring" },
          { name: "Osaka", emoji: "🍜", description: "Food hub", season_note: "Good in spring" },
          { name: "Osaka", emoji: "🍜", description: "Food hub", season_note: "Good in spring" },
        ],
        adults: 2,
        childrenAges: [],
        vibe: "international",
        tripShape: "single_destination",
        stops: [],
        countryTour: null,
      }),
    });

    assert.equal(result.destination, "Japan");
    assert.equal(result.tripShape, "country_tour");
    assert.equal(result.countryTour.country, "Japan");
    assert.equal(result.countryTour.countryCode, "JP");
    assert.deepEqual(result.suggestedDestinations, []);
    assert.deepEqual(result.stops.map((stop) => stop.name), ["Tokyo", "Kyoto", "Osaka", "Hakone"]);
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

  it("parses explicit multi-city prompt into ordered stops", async () => {
    const result = await parseInput("Europe trip with best friend, cover Amsterdam, Greece, Berlin, Budapest in 10 days", {
      callAI: async () => JSON.stringify({
        destination: "Europe multi-city trip",
        suggestedDestinations: [],
        startDate: "2026-06-01",
        endDate: "2026-06-10",
        adults: 2,
        childrenAges: [],
        vibe: "international",
        tripShape: "multi_stop",
        stops: [
          { id: "amsterdam", name: "Amsterdam", role: "must_visit", mustInclude: true },
          { id: "greece", name: "Greece", role: "must_visit", mustInclude: true, notes: ["Broad region; confirm city"] },
          { id: "berlin", name: "Berlin", role: "must_visit", mustInclude: true },
          { id: "budapest", name: "Budapest", role: "must_visit", mustInclude: true },
        ],
        countryTour: null,
      }),
    });

    assert.equal(result.tripShape, "multi_stop");
    assert.deepEqual(result.stops.map((stop) => stop.name), ["Amsterdam", "Greece", "Berlin", "Budapest"]);
    assert.equal(result.stops[1].role, "must_visit");
    assert.equal(result.stops[1].mustInclude, true);
    assert.deepEqual(result.stops[1].notes, ["Broad region; confirm city"]);
    assert.equal(result.countryTour, null);
  });

  it("parses whole-country prompt into country tour metadata and suggested stops", async () => {
    const result = await parseInput("2 weeks in Japan with food and trains", {
      callAI: async () => JSON.stringify({
        destination: "Japan",
        suggestedDestinations: [],
        startDate: "2026-11-01",
        endDate: "2026-11-14",
        adults: 2,
        childrenAges: [],
        vibe: "international",
        tripShape: "country_tour",
        stops: [
          { id: "tokyo", name: "Tokyo", role: "suggested" },
          { id: "kyoto", name: "Kyoto", role: "suggested" },
          { id: "osaka", name: "Osaka", role: "suggested" },
        ],
        countryTour: {
          country: "Japan",
          countryCode: "JP",
          requestedRegions: ["Tokyo", "Kyoto", "Osaka"],
          suggestedStopCount: 3,
        },
      }),
    });

    assert.equal(result.tripShape, "country_tour");
    assert.equal(result.countryTour.country, "Japan");
    assert.equal(result.countryTour.countryCode, "JP");
    assert.deepEqual(result.stops.map((stop) => stop.name), ["Tokyo", "Kyoto", "Osaka"]);
  });

  it("upgrades whole-USA prompt into a country tour with California family defaults", async () => {
    const result = await parseInput("USA road trip with my 5 year old", {
      clientDate: "2026-04-26",
      callAI: async () => JSON.stringify({
        destination: "United States",
        suggestedDestinations: [],
        startDate: "2026-07-01",
        endDate: "2026-07-12",
        adults: 2,
        childrenAges: [5],
        pets: [],
        vibe: "adventure",
        tripShape: "single_destination",
        stops: [],
        countryTour: null,
        foodPreferences: { dietary: [], cuisines: [], avoidances: [], kidFoods: [], budget: null },
      }),
    });

    assert.equal(result.tripShape, "country_tour");
    assert.equal(result.countryTour.countryCode, "US");
    assert.deepEqual(result.stops.map((stop) => stop.name), ["San Francisco", "Monterey", "Los Angeles", "San Diego"]);
  });

  it("dedupes repeated city stops from parser output", async () => {
    const result = await parseInput("Tokyo Osaka Osaka Kyoto", {
      clientDate: "2026-04-26",
      callAI: async () => JSON.stringify({
        destination: "Japan multi-city trip",
        suggestedDestinations: [],
        startDate: "2026-11-01",
        endDate: "2026-11-10",
        adults: 2,
        childrenAges: [],
        pets: [],
        vibe: "international",
        tripShape: "multi_stop",
        stops: [
          { id: "tokyo", name: "Tokyo", role: "must_visit" },
          { id: "osaka", name: "Osaka", role: "must_visit" },
          { id: "osaka-2", name: "Osaka", role: "must_visit" },
          { id: "kyoto", name: "Kyoto", role: "must_visit" },
        ],
        countryTour: null,
        foodPreferences: { dietary: [], cuisines: [], avoidances: [], kidFoods: [], budget: null },
      }),
    });

    assert.deepEqual(result.stops.map((stop) => stop.name), ["Tokyo", "Osaka", "Kyoto"]);
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
    assert.equal(result.tripShape, "single_destination");
    assert.deepEqual(result.stops, []);
    assert.equal(result.countryTour, null);
  });
});
