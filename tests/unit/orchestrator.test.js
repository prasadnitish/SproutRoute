import test from "node:test";
import assert from "node:assert/strict";
import { runOrchestrator } from "../../src/backend/agents/orchestrator.js";

const baseInput = { destination: "Portland, OR", startDate: "2026-08-01", endDate: "2026-08-04", activities: ["parks"], children: [], pets: [] };

function happyDeps(spans) {
  return {
    geocodeLocationFn: async () => ({ lat: 45.5, lon: -122.6, countryCode: "US", stateCode: "OR" }),
    getWeatherForecastFn: async () => ({ summary: "Mild", forecast: [] }),
    attractionMemoryService: { getPlanningCandidates: async () => [], persistTripAttractions: async () => {} },
    generateTripPlanChunkedFn: async (_p, _w, onChunk) => {
      onChunk({}, { chunk: 1, totalChunks: 1, dayOffset: 0 });
      return { overview: "Trip", suggestedActivities: [], dailyItinerary: [], tips: [] };
    },
    scheduleItineraryFn: () => [{ day: 1 }],
    getCarSeatGuidanceFn: async () => ({ status: "Verified", results: [] }),
    getPetTravelGuidanceFn: async () => ({ airlineGuidance: null, entryRequirements: null }),
    getTravelAdvisoryFn: async () => null,
    getNeighborhoodSafetyFn: async () => null,
    generatePackingListFn: async () => ({ categories: [] }),
    logAgentSpanFn: async (span) => spans.push(span),
  };
}

test("runOrchestrator runs all 4 agents and logs 4 ok spans on the happy path", async () => {
  const spans = [];
  const result = await runOrchestrator(baseInput, happyDeps(spans));

  assert.ok(result.runId);
  assert.equal(result.trip.overview, "Trip");
  assert.ok(result.packingList);
  assert.ok(result.safety);
  assert.equal(spans.length, 4);
  assert.deepEqual(spans.map((s) => s.childAgent).sort(), ["itinerary", "packing", "retrieval", "safety"]);
  assert.ok(spans.every((s) => s.status === "ok"));
  assert.ok(spans.every((s) => s.runId === result.runId));
});

test("runOrchestrator degrades gracefully when safetyAgent fails, packing still runs", async () => {
  const spans = [];
  const deps = happyDeps(spans);
  deps.getTravelAdvisoryFn = async () => { throw new Error("advisory service down"); };

  const result = await runOrchestrator(baseInput, deps);

  assert.ok(result.trip, "itinerary should still succeed");
  assert.ok(result.packingList, "packing should still succeed");
  assert.equal(result.safety.status, "unavailable");
  assert.equal(result.safety.reason, "advisory service down");

  const safetySpan = spans.find((s) => s.childAgent === "safety");
  assert.equal(safetySpan.status, "error");
  const packingSpan = spans.find((s) => s.childAgent === "packing");
  assert.equal(packingSpan.status, "ok", "packing does not depend on safety's output, only retrieval's");
});

test("runOrchestrator marks all downstream agents skipped when retrieval fails", async () => {
  const spans = [];
  const deps = happyDeps(spans);
  deps.geocodeLocationFn = async () => { throw new Error("Location not found"); };

  const result = await runOrchestrator(baseInput, deps);

  assert.equal(result.trip, null);
  assert.equal(result.packingList, null);
  const retrievalSpan = spans.find((s) => s.childAgent === "retrieval");
  assert.equal(retrievalSpan.status, "error");
  for (const agent of ["itinerary", "safety", "packing"]) {
    const span = spans.find((s) => s.childAgent === agent);
    assert.equal(span.status, "skipped", `${agent} should be skipped when retrieval fails`);
  }
});

test("runOrchestrator runs itinerary and safety concurrently, not sequentially", async () => {
  const spans = [];
  const events = [];
  const deps = happyDeps(spans);
  deps.generateTripPlanChunkedFn = async (_tripPayload, _weather, onChunk) => {
    events.push("itinerary:start");
    await new Promise((resolve) => setTimeout(resolve, 30));
    onChunk({}, { chunk: 1, totalChunks: 1, dayOffset: 0 });
    events.push("itinerary:end");
    return { overview: "Trip", suggestedActivities: [], dailyItinerary: [], tips: [] };
  };
  deps.getTravelAdvisoryFn = async () => {
    events.push("safety:advisory:start");
    return null;
  };

  await runOrchestrator(baseInput, deps);

  const itineraryEndIndex = events.indexOf("itinerary:end");
  const safetyStartIndex = events.indexOf("safety:advisory:start");
  assert.ok(
    safetyStartIndex !== -1 && safetyStartIndex < itineraryEndIndex,
    `expected safety's advisory call to start before itinerary finished (proves parallelism); got order: ${events.join(", ")}`,
  );
});

test("runOrchestrator rejects when the graph exceeds the configured timeout", async () => {
  const deps = happyDeps([]);
  deps.geocodeLocationFn = () => new Promise(() => {}); // never resolves
  deps.timeoutMs = 50;

  await assert.rejects(
    runOrchestrator(baseInput, deps),
    /timed out after/,
  );
});
