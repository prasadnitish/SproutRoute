import test from "node:test";
import assert from "node:assert/strict";
import { runSafetyAgent } from "../../src/backend/agents/safetyAgent.js";

const retrieval = { coords: { lat: 45.5, lon: -122.6, stateCode: "OR" }, countryCode: "US" };

test("runSafetyAgent runs car-seat check when children present, skips when absent", async () => {
  let carSeatArgs = null;
  const deps = {
    getCarSeatGuidanceFn: async (args) => {
      carSeatArgs = args;
      return { status: "Verified", results: [] };
    },
    getPetTravelGuidanceFn: async () => ({ airlineGuidance: null, entryRequirements: null }),
    getTravelAdvisoryFn: async () => null,
    getNeighborhoodSafetyFn: async () => null,
  };

  const withKids = await runSafetyAgent(
    { destination: "Portland, OR", startDate: "2026-08-01", children: [{ age: 5 }], pets: [] },
    retrieval,
    deps,
  );
  assert.equal(withKids.edgeSummary.carSeatCheck, "ran");
  assert.equal(carSeatArgs.jurisdictionCode, "OR");
  assert.equal(carSeatArgs.countryCode, undefined, "must omit countryCode, matching the real route's call site");
  assert.ok(withKids.carSeatGuidance);

  const withoutKids = await runSafetyAgent(
    { destination: "Portland, OR", startDate: "2026-08-01", children: [], pets: [] },
    retrieval,
    deps,
  );
  assert.equal(withoutKids.edgeSummary.carSeatCheck, "skipped");
  assert.equal(withoutKids.edgeSummary.carSeatCheckReason, "no children in request");
  assert.equal(withoutKids.carSeatGuidance, null);
});

test("runSafetyAgent runs pet check when pets present, skips when absent", async () => {
  let petArgs = null;
  const deps = {
    getCarSeatGuidanceFn: async () => ({ status: "Verified", results: [] }),
    getPetTravelGuidanceFn: async (pets, options) => {
      petArgs = { pets, options };
      return { airlineGuidance: [{ pet: "Max", airlines: [] }], entryRequirements: null };
    },
    getTravelAdvisoryFn: async () => null,
    getNeighborhoodSafetyFn: async () => null,
  };

  const withPets = await runSafetyAgent(
    { destination: "Portland, OR", startDate: "2026-08-01", children: [], pets: [{ type: "dog", breed: "lab", weightLbs: 40 }] },
    retrieval,
    deps,
  );
  assert.equal(withPets.edgeSummary.petCheck, "ran");
  assert.equal(petArgs.pets.length, 1);
  assert.equal(petArgs.options.countryCode, "US");
  assert.ok(withPets.petGuidance);

  const withoutPets = await runSafetyAgent(
    { destination: "Portland, OR", startDate: "2026-08-01", children: [], pets: [] },
    retrieval,
    deps,
  );
  assert.equal(withoutPets.edgeSummary.petCheck, "skipped");
  assert.equal(withoutPets.petGuidance, null);
});

test("runSafetyAgent always fetches travel advisory and neighborhood safety in parallel", async () => {
  const calls = [];
  const deps = {
    getCarSeatGuidanceFn: async () => ({ status: "Verified", results: [] }),
    getPetTravelGuidanceFn: async () => ({ airlineGuidance: null, entryRequirements: null }),
    getTravelAdvisoryFn: async (countryCode) => {
      calls.push("advisory");
      assert.equal(countryCode, "US");
      return { level: 1, title: "Exercise normal precautions" };
    },
    getNeighborhoodSafetyFn: async (lat, lon) => {
      calls.push("neighborhood");
      assert.equal(lat, 45.5);
      return { overallScore: 80 };
    },
  };

  const result = await runSafetyAgent(
    { destination: "Portland, OR", startDate: "2026-08-01", children: [], pets: [] },
    retrieval,
    deps,
  );
  assert.equal(calls.length, 2);
  assert.equal(result.travelAdvisory.level, 1);
  assert.equal(result.neighborhoodSafety.overallScore, 80);
});
