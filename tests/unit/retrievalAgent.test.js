import test from "node:test";
import assert from "node:assert/strict";
import { runRetrievalAgent } from "../../src/backend/agents/retrievalAgent.js";

test("runRetrievalAgent geocodes, fetches weather, and returns cached attractions", async () => {
  const calls = { getPlanningCandidates: null };
  const deps = {
    geocodeLocationFn: async (destination) => {
      assert.equal(destination, "Portland, OR");
      return { lat: 45.5, lon: -122.6, displayName: "Portland, OR", countryCode: "US", stateCode: "OR" };
    },
    getWeatherForecastFn: async (lat, lon, countryCode, startDate, endDate) => {
      assert.equal(lat, 45.5);
      assert.equal(countryCode, "US");
      return { summary: "Mild", forecast: [] };
    },
    attractionMemoryService: {
      getPlanningCandidates: async (args) => {
        calls.getPlanningCandidates = args;
        return [{ canonical_name: "Powell's Books" }];
      },
    },
  };

  const result = await runRetrievalAgent(
    { destination: "Portland, OR", startDate: "2026-08-01", endDate: "2026-08-04", activities: ["parks"], children: [{ age: 5 }], pets: [] },
    deps,
  );

  assert.equal(result.coords.displayName, "Portland, OR");
  assert.equal(result.countryCode, "US");
  assert.equal(result.weather.summary, "Mild");
  assert.equal(result.cachedAttractions.length, 1);
  assert.deepEqual(calls.getPlanningCandidates.childrenAges, [5]);
  assert.equal(calls.getPlanningCandidates.destination, "Portland, OR");
  assert.ok(typeof result.plannerSummary === "string");
});

test("runRetrievalAgent computes maxResults from trip length, clamped 16-36", async () => {
  const deps = {
    geocodeLocationFn: async () => ({ lat: 1, lon: 1, countryCode: "US" }),
    getWeatherForecastFn: async () => ({ summary: "", forecast: [] }),
    attractionMemoryService: {
      getPlanningCandidates: async (args) => {
        assert.equal(args.maxResults, 36); // 21-day trip: min(36, max(16, 21*4+4=88)) = 36
        return [];
      },
    },
  };

  await runRetrievalAgent(
    { destination: "X", startDate: "2026-08-01", endDate: "2026-08-21", activities: [], children: [], pets: [] },
    deps,
  );
});

test("runRetrievalAgent defaults pace to empty string when unknown", async () => {
  const deps = {
    geocodeLocationFn: async () => ({ lat: 1, lon: 1, countryCode: "US" }),
    getWeatherForecastFn: async () => ({ summary: "", forecast: [] }),
    attractionMemoryService: {
      getPlanningCandidates: async (args) => {
        assert.equal(args.pace, "");
        return [];
      },
    },
  };

  await runRetrievalAgent(
    { destination: "X", startDate: "2026-08-01", endDate: "2026-08-02", activities: [], children: [], pets: [] },
    deps,
  );
});

test("runRetrievalAgent defaults requestedActivities when empty array is passed", async () => {
  const deps = {
    geocodeLocationFn: async () => ({ lat: 1, lon: 1, countryCode: "US" }),
    getWeatherForecastFn: async () => ({ summary: "", forecast: [] }),
    attractionMemoryService: {
      getPlanningCandidates: async (args) => {
        assert.deepEqual(args.requestedActivities, ["family-friendly", "parks", "city"]);
        return [];
      },
    },
  };

  await runRetrievalAgent(
    { destination: "X", startDate: "2026-08-01", endDate: "2026-08-02", activities: [], children: [], pets: [] },
    deps,
  );
});
