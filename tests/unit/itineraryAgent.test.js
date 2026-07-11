import test from "node:test";
import assert from "node:assert/strict";
import { runItineraryAgent } from "../../src/backend/agents/itineraryAgent.js";

const retrieval = {
  coords: { lat: 45.5, lon: -122.6 },
  countryCode: "US",
  weather: { summary: "Mild", forecast: [] },
  cachedAttractions: [{ canonical_name: "Powell's Books" }],
  plannerSummary: "Family trip, moderate pace.",
};

test("runItineraryAgent generates and schedules a trip plan", async () => {
  const deps = {
    generateTripPlanChunkedFn: async (tripPayload, weather, onChunk) => {
      assert.equal(tripPayload.destination, "Portland, OR");
      assert.equal(tripPayload.cachedAttractions.length, 1);
      onChunk({ overview: "x", suggestedActivities: [], dailyItinerary: [], tips: [] }, { chunk: 1, totalChunks: 1, dayOffset: 0 });
      return { overview: "A great trip", suggestedActivities: [], dailyItinerary: [{ day: "Day 1", activities: [] }], tips: [] };
    },
    scheduleItineraryFn: (tripPlan, enrichedMap, startDate, options) => {
      assert.equal(startDate, "2026-08-01");
      assert.equal(options.hasChildren, true);
      return [{ day: 1, date: startDate, scheduled: [] }];
    },
  };

  const result = await runItineraryAgent(
    { destination: "Portland, OR", startDate: "2026-08-01", endDate: "2026-08-04", activities: ["parks"], children: [{ age: 5 }], pets: [] },
    retrieval,
    deps,
  );

  assert.equal(result.tripPlan.overview, "A great trip");
  assert.equal(result.scheduledItinerary.length, 1);
});

test("runItineraryAgent persists generated attractions in the background without blocking", async () => {
  let persistedPayload = null;
  const deps = {
    generateTripPlanChunkedFn: async (_tripPayload, _weather, onChunk) => {
      onChunk({}, { chunk: 1, totalChunks: 1, dayOffset: 0 });
      return { overview: "x", suggestedActivities: [], dailyItinerary: [], tips: [] };
    },
    scheduleItineraryFn: () => [],
    attractionMemoryService: {
      persistTripAttractions: async (payload) => {
        persistedPayload = payload;
      },
    },
  };

  await runItineraryAgent(
    { destination: "Portland, OR", startDate: "2026-08-01", endDate: "2026-08-02", activities: [], children: [], pets: [] },
    retrieval,
    deps,
  );

  // Fire-and-forget: give the microtask queue one tick to run the persist call.
  await new Promise((resolve) => setImmediate(resolve));
  assert.ok(persistedPayload, "persistTripAttractions should have been called");
  assert.equal(persistedPayload.destination, "Portland, OR");
});

test("runItineraryAgent defaults activities when none are provided", async () => {
  const deps = {
    generateTripPlanChunkedFn: async (tripPayload) => {
      assert.deepEqual(tripPayload.activities, ["family-friendly", "parks", "city"]);
      return { overview: "x", suggestedActivities: [], dailyItinerary: [], tips: [] };
    },
    scheduleItineraryFn: () => [],
  };

  await runItineraryAgent(
    { destination: "Portland, OR", startDate: "2026-08-01", endDate: "2026-08-02", activities: [], children: [], pets: [] },
    retrieval,
    deps,
  );
});
