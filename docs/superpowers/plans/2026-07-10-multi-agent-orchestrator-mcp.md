# Multi-Agent Orchestrator + Hosted MCP Server Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wrap SproutRoute's existing trip-planning services in a LangGraph.js orchestrator (4 specialist agents: retrieval, itinerary, safety, packing), log every handoff to Supabase, and expose it as a Railway-hosted MCP server so a hiring manager can install it in Claude Desktop and watch a real product plan and delegate.

**Architecture:** New `src/backend/agents/` module wraps existing service functions (zero changes to those services or to the existing web routes). A new `src/backend/mcp/` module exposes two MCP tools (`plan_trip`, `get_agent_trace`) over Streamable HTTP, mounted onto the existing Express app behind a shared demo token, a tight rate limit, and a kill switch.

**Tech Stack:** `@langchain/langgraph` (orchestration), `@modelcontextprotocol/sdk` + `zod` (MCP server), `@supabase/supabase-js` (already present — `agent_runs` logging table), Node `node:test` (existing test runner).

**Spec:** `New Portfolio/2026-07-10-multi-agent-orchestrator-mcp-design.md` in the `tpm-portfolio` repo.

---

## Before You Start

This plan was written and verified inside an isolated git worktree at:
`strollerscout/.worktrees/feature-multi-agent-orchestrator-mcp` (branch `feature/multi-agent-orchestrator-mcp`, branched from `main`).

If you're executing this plan in a fresh session, `cd` into that worktree first (or create a new one on the same branch — see `superpowers:using-git-worktrees`). All file paths below are relative to the `strollerscout/` repo root.

**Baseline check:** Run `npm test` before Task 1. It should show `412 passing, 0 failing` (a pre-existing test-date bug was already fixed on this branch, commit `a330102`). If you see different numbers, stop and investigate before proceeding — don't build on top of an unexplained red baseline.

---

## Milestone M1: Agent Wrappers

### Task 1: Install dependencies

**Files:**
- Modify: `src/backend/package.json`
- Modify: `src/backend/package-lock.json` (npm-managed, do not hand-edit)

- [ ] **Step 1: Install the new dependencies**

Run:
```bash
cd src/backend
npm install @langchain/langgraph@1.4.7 @langchain/core@^1.1.48 @modelcontextprotocol/sdk@1.29.0 zod@^4.4.3
cd ../..
```

- [ ] **Step 2: Verify the existing suite still passes with the new deps present**

Run: `npm test`
Expected: `# pass 412`, `# fail 0` (unchanged from baseline — new deps shouldn't affect existing behavior).

- [ ] **Step 3: Commit**

```bash
git add src/backend/package.json src/backend/package-lock.json
git commit -m "chore: add LangGraph.js and MCP SDK dependencies"
```

---

### Task 2: retrievalAgent.js

**Files:**
- Create: `src/backend/agents/retrievalAgent.js`
- Test: `tests/unit/retrievalAgent.test.js`

This agent geocodes the destination, fetches weather, builds trip-intent context, and pulls cached attraction candidates — replicating the real logic from `server.js`'s `loadCachedAttractionsForTrip` (lines 205-242) and `resolvePlanningContext` (lines 185-203), minus the saved-user-profile lookup (MCP callers are anonymous — no per-user auth in v1, per the spec's non-goals).

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/retrievalAgent.test.js`:

```js
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/unit/retrievalAgent.test.js`
Expected: FAIL — `Cannot find module '../../src/backend/agents/retrievalAgent.js'`

- [ ] **Step 3: Implement `retrievalAgent.js`**

Create `src/backend/agents/retrievalAgent.js`:

```js
import { geocodeLocation } from "../services/geocoding.js";
import { getWeatherForecast } from "../services/weather.js";
import { createAttractionMemoryService } from "../services/attractionMemory.js";
import { sanitizeTripIntentFields } from "../services/profileContext.js";
import { mergeProfileAndIntent, buildPlannerSummary } from "../services/profileMerge.js";
import { inclusiveDayCount } from "../utils/dateCalc.js";

// Wraps geocoding.js + weather.js + attractionMemory.js. Replicates the
// planning-context logic from server.js's resolvePlanningContext/
// loadCachedAttractionsForTrip, minus the saved-user-profile lookup — MCP
// callers are anonymous in v1 (no per-user auth), so savedProfile is always
// null. mergeProfileAndIntent/buildPlannerSummary both explicitly support a
// null profile ("anonymous user or no trip context" per profileMerge.js JSDoc).
export async function runRetrievalAgent(input, deps = {}) {
  const {
    geocodeLocationFn = geocodeLocation,
    getWeatherForecastFn = getWeatherForecast,
    attractionMemoryService = createAttractionMemoryService(),
  } = deps;
  const { destination, startDate, endDate, activities, children, pets } = input;

  const coords = await geocodeLocationFn(destination);
  const countryCode = coords.countryCode || "US";
  const weather = await getWeatherForecastFn(coords.lat, coords.lon, countryCode, startDate, endDate);

  const tripIntent = sanitizeTripIntentFields({
    destination,
    childrenAges: (children || []).map((child) => child.age),
    pets: pets || [],
  });
  const merged = mergeProfileAndIntent(null, tripIntent);
  const plannerSummary = buildPlannerSummary(merged);

  const pacePreference = tripIntent.pacePreference;
  const pace = typeof pacePreference === "string" && pacePreference !== "unknown" ? pacePreference : "";
  const tripDays = inclusiveDayCount(startDate, endDate);
  const maxResults = Math.min(36, Math.max(16, tripDays * 4 + 4));

  const cachedAttractions = await attractionMemoryService.getPlanningCandidates({
    destination,
    coords,
    countryCode,
    childrenAges: (children || []).map((child) => child.age).filter(Number.isFinite),
    requestedActivities: activities?.length ? activities : ["family-friendly", "parks", "city"],
    tripGoals: tripIntent.tripGoals || [],
    mustHaves: tripIntent.mustHaves || [],
    avoidances: tripIntent.avoidances || [],
    transportPreferences: tripIntent.transportPreferences || [],
    accessibilityNeeds: tripIntent.accessibilityNeeds || [],
    scheduleConstraints: tripIntent.scheduleConstraints || [],
    pace,
    pets: pets || [],
    maxResults,
  });

  return { coords, countryCode, weather, cachedAttractions, plannerSummary };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/unit/retrievalAgent.test.js`
Expected: `# pass 3`, `# fail 0`

- [ ] **Step 5: Commit**

```bash
git add src/backend/agents/retrievalAgent.js tests/unit/retrievalAgent.test.js
git commit -m "feat: add retrievalAgent wrapping geocoding, weather, and attraction memory"
```

---

### Task 3: itineraryAgent.js

**Files:**
- Create: `src/backend/agents/itineraryAgent.js`
- Test: `tests/unit/itineraryAgent.test.js`

Wraps `tripPlanAI.js`'s `generateTripPlanChunked` (handles both short and long trips uniformly) and `itineraryScheduler.js`'s `scheduleItinerary`. Also fires the same background attraction-persistence call the real bundle handler makes (`attractionMemoryService.persistTripAttractions`), since this agent is the one that produces the `tripPlan` that gets persisted.

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/itineraryAgent.test.js`:

```js
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

test("runItineraryAgent does not include countryCode in tripPayload sent to AI", async () => {
  const deps = {
    generateTripPlanChunkedFn: async (tripPayload) => {
      assert.equal(tripPayload.countryCode, undefined, "countryCode must not be in AI payload");
      assert.equal(tripPayload.destination, "Portland, OR");
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/unit/itineraryAgent.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `itineraryAgent.js`**

Create `src/backend/agents/itineraryAgent.js`:

```js
import { generateTripPlanChunked } from "../services/tripPlanAI.js";
import { scheduleItinerary } from "../services/itineraryScheduler.js";
import { log } from "../utils/logger.js";

// Wraps tripPlanAI.js's chunked generator (handles 1-21 day trips uniformly,
// unlike the plain generateTripPlan) + itineraryScheduler.js's scheduler.
// Also fires the same background attraction-persistence call the real
// /api/v1/trip/bundle handler makes, since this agent is what produces tripPlan.
export async function runItineraryAgent(input, retrieval, deps = {}) {
  const {
    generateTripPlanChunkedFn = generateTripPlanChunked,
    scheduleItineraryFn = scheduleItinerary,
    attractionMemoryService,
  } = deps;
  const { destination, startDate, endDate, activities, children, pets } = input;
  const { coords, countryCode, weather, cachedAttractions, plannerSummary } = retrieval;

  const tripPayload = {
    destination,
    startDate,
    endDate,
    activities: activities?.length ? activities : ["family-friendly", "parks", "city"],
    children: children || [],
    pets: pets || [],
    plannerSummary,
    cachedAttractions,
  };

  const tripPlan = await generateTripPlanChunkedFn(tripPayload, weather, () => {});

  const scheduledItinerary = scheduleItineraryFn(tripPlan, {}, startDate, {
    hasChildren: (children || []).length > 0,
  });

  if (attractionMemoryService?.persistTripAttractions) {
    Promise.resolve(
      attractionMemoryService.persistTripAttractions({ destination, coords, countryCode, tripPlan }),
    ).catch((error) => {
      log.warn("attraction-memory:persist-failed", { error: error.message });
    });
  }

  return { tripPlan, scheduledItinerary };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/unit/itineraryAgent.test.js`
Expected: `# pass 4`, `# fail 0`

- [ ] **Step 5: Commit**

```bash
git add src/backend/agents/itineraryAgent.js tests/unit/itineraryAgent.test.js
git commit -m "feat: add itineraryAgent wrapping chunked trip-plan generation and scheduling"
```

---

### Task 4: safetyAgent.js

**Files:**
- Create: `src/backend/agents/safetyAgent.js`
- Test: `tests/unit/safetyAgent.test.js`

Wraps `safetyRules.js` (car seat), `petSafety.js` (pet travel), `travelAdvisory.js`, and `neighborhoodSafety.js`. Car-seat check only runs when children are present; pet check only runs when pets are present — each produces an explicit `edgeSummary` entry recording whether it ran or was skipped (and why), which becomes the `agent_runs.edge_summary` column later. To stay a faithful, zero-deviation wrapper, the car-seat call intentionally omits `countryCode` — the real `/api/v1/safety/car-seat-check` route (server.js:1755-1757) does the same (a pre-existing quirk in production, out of scope to fix here).

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/safetyAgent.test.js`:

```js
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/unit/safetyAgent.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `safetyAgent.js`**

Create `src/backend/agents/safetyAgent.js`:

```js
import { getCarSeatGuidance } from "../services/safetyRules.js";
import { getPetTravelGuidance } from "../services/petSafety.js";
import { getTravelAdvisory } from "../services/travelAdvisory.js";
import { getNeighborhoodSafety } from "../services/neighborhoodSafety.js";
import { deriveTravelMode } from "../services/travelMode.js";

// Wraps safetyRules.js + petSafety.js + travelAdvisory.js + neighborhoodSafety.js.
// Car-seat and pet checks are conditional on request content; edgeSummary
// records which sub-checks ran or were skipped (and why) for agent_runs tracing.
export async function runSafetyAgent(input, retrieval, deps = {}) {
  const {
    getCarSeatGuidanceFn = getCarSeatGuidance,
    getPetTravelGuidanceFn = getPetTravelGuidance,
    getTravelAdvisoryFn = getTravelAdvisory,
    getNeighborhoodSafetyFn = getNeighborhoodSafety,
  } = deps;
  const { destination, startDate, children, pets } = input;
  const { coords, countryCode } = retrieval;

  const edgeSummary = {};

  let carSeatGuidance = null;
  if (Array.isArray(children) && children.length > 0) {
    // NOTE: countryCode is intentionally omitted here — the real
    // /api/v1/safety/car-seat-check route (server.js:1755-1757) does the same,
    // so this wrapper stays a zero-deviation match to production behavior.
    carSeatGuidance = await getCarSeatGuidanceFn({
      destination,
      jurisdictionCode: coords.stateCode,
      tripDate: startDate,
      children,
    });
    edgeSummary.carSeatCheck = "ran";
  } else {
    edgeSummary.carSeatCheck = "skipped";
    edgeSummary.carSeatCheckReason = "no children in request";
  }

  let petGuidance = null;
  if (Array.isArray(pets) && pets.length > 0) {
    // NOTE: deriveTravelMode gets no origin coordinates since MCP callers are anonymous (no client
    // geolocation like the web app has), so it always resolves to "fly" per its own fallback rule.
    // This is a known v1 limitation, not a computed derivation — accepted tradeoff for anonymous access.
    const travelMode = deriveTravelMode({ countryCode });
    petGuidance = await getPetTravelGuidanceFn(pets, { destination, travelMode, countryCode, startDate });
    edgeSummary.petCheck = "ran";
  } else {
    edgeSummary.petCheck = "skipped";
    edgeSummary.petCheckReason = "no pets in request";
  }

  const [travelAdvisory, neighborhoodSafety] = await Promise.all([
    getTravelAdvisoryFn(countryCode),
    getNeighborhoodSafetyFn(coords.lat, coords.lon),
  ]);

  return { carSeatGuidance, petGuidance, travelAdvisory, neighborhoodSafety, edgeSummary };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/unit/safetyAgent.test.js`
Expected: `# pass 3`, `# fail 0`

- [ ] **Step 5: Commit**

```bash
git add src/backend/agents/safetyAgent.js tests/unit/safetyAgent.test.js
git commit -m "feat: add safetyAgent wrapping car-seat, pet, advisory, and neighborhood checks"
```

**Known v1 limitation:** Pet-safety `travelMode` always resolves to `"fly"` because the MCP orchestrator has no origin/geolocation input (anonymous callers, unlike the web app with client geolocation). The real web app can compute `"drive"` when both origin and destination coordinates are available; the MCP tool cannot. This is an accepted tradeoff for v1's tool schema — fixing it would require either an explicit `travelMode` override parameter or client-supplied origin coordinates, which are out of scope for v1. The limitation is tested and documented in the code via the comment above `deriveTravelMode`.

---

### Task 5: packingAgent.js

**Files:**
- Create: `src/backend/agents/packingAgent.js`
- Test: `tests/unit/packingAgent.test.js`

Wraps `deterministicPacking.js`'s `generatePackingList` — the function actually wired into production (`server.js` imports it, not the AI-based one in `packingListAI.js`, which is currently dead code). Note: `deterministicPacking.js` only needs `{startDate, endDate, activities, children, pets}` + the weather forecast — it does **not** consume the itinerary's generated content or the safety agent's guidance directly (it derives pet/car-seat-related packing items straight from the `pets`/`children` arrays already in the trip request). So this agent only depends on `input` + `retrieval.weather`, even though the orchestrator's graph still sequences it after itinerary and safety complete (see Task 8).

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/packingAgent.test.js`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { runPackingAgent } from "../../src/backend/agents/packingAgent.js";

const retrieval = { weather: { summary: "Mild", forecast: [] } };

test("runPackingAgent generates a packing list from trip data and weather", async () => {
  const deps = {
    generatePackingListFn: async (tripData, weather) => {
      assert.equal(tripData.startDate, "2026-08-01");
      assert.equal(weather.summary, "Mild");
      return { categories: [{ name: "Clothing", items: [{ name: "Jacket", quantity: "1", reason: "Mild weather" }] }] };
    },
  };

  const result = await runPackingAgent(
    { startDate: "2026-08-01", endDate: "2026-08-04", activities: ["parks"], children: [{ age: 5 }], pets: [] },
    retrieval,
    deps,
  );

  assert.equal(result.packingList.categories.length, 1);
});

test("runPackingAgent defaults activities when none are provided", async () => {
  const deps = {
    generatePackingListFn: async (tripData) => {
      assert.deepEqual(tripData.activities, ["family-friendly", "parks", "city"]);
      return { categories: [] };
    },
  };

  await runPackingAgent(
    { startDate: "2026-08-01", endDate: "2026-08-02", activities: [], children: [], pets: [] },
    retrieval,
    deps,
  );
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/unit/packingAgent.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `packingAgent.js`**

Create `src/backend/agents/packingAgent.js`:

```js
import { generatePackingList as generatePackingListDeterministic } from "../services/deterministicPacking.js";

// Wraps deterministicPacking.js — the function actually wired into production
// (server.js imports this one, not packingListAI.js's AI-based version, which
// is currently dead code as far as the live app is concerned).
export async function runPackingAgent(input, retrieval, deps = {}) {
  const { generatePackingListFn = generatePackingListDeterministic } = deps;
  const { startDate, endDate, activities, children, pets } = input;

  const tripData = {
    startDate,
    endDate,
    activities: activities?.length ? activities : ["family-friendly", "parks", "city"],
    children: children || [],
    pets: pets || [],
  };

  const packingList = await generatePackingListFn(tripData, retrieval.weather);
  return { packingList };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/unit/packingAgent.test.js`
Expected: `# pass 2`, `# fail 0`

- [ ] **Step 5: Run the full suite and commit**

Run: `npm test`
Expected: `# pass 423` (412 baseline + 11 new agent tests: 3 retrieval + 3 itinerary + 3 safety + 2 packing), `# fail 0`

```bash
git add src/backend/agents/packingAgent.js tests/unit/packingAgent.test.js
git commit -m "feat: add packingAgent wrapping deterministic packing list generation"
```

---

## Milestone M2: Orchestrator + Supabase Logging

### Task 6: Supabase migration for `agent_runs`

**Files:**
- Create: `src/backend/db/migrations/20260710_020_create_agent_runs.sql`

Follows the exact pattern of the existing `20260329_019_create_trip_metrics.sql` migration: `CREATE TABLE`, indexes, `ENABLE ROW LEVEL SECURITY` with **no policies** — meaning only the Supabase service-role key (used server-side via `getSupabaseAdmin()`) can read or write this table; the anon/public REST path is fully blocked. This is the privacy decision from the spec: no per-caller ownership check exists under the shared MCP demo token, so `input_json`/`output_json` are never stored — only structural metadata.

- [ ] **Step 1: Create the migration file**

Create `src/backend/db/migrations/20260710_020_create_agent_runs.sql`:

```sql
-- 020: Create agent_runs table for multi-agent orchestrator handoff tracing
-- One plan_trip call produces one run_id shared across up to 4 span rows
-- (one per agent). No input/output payloads are stored — only structural
-- metadata — since get_agent_trace has no per-caller ownership check under
-- the shared MCP demo token (see design spec §4).

CREATE TABLE IF NOT EXISTS public.agent_runs (
  span_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id        UUID NOT NULL,
  parent_agent  TEXT NOT NULL DEFAULT 'orchestrator',
  child_agent   TEXT NOT NULL,  -- retrieval, itinerary, safety, packing
  status        TEXT NOT NULL,  -- ok, error, skipped
  latency_ms    INTEGER,
  edge_summary  JSONB,
  timestamp     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_runs_run_id ON public.agent_runs (run_id, timestamp ASC);

ALTER TABLE public.agent_runs ENABLE ROW LEVEL SECURITY;
```

- [ ] **Step 2: Apply the migration to your Supabase project**

Run this SQL against the SproutRoute Supabase project (via the Supabase SQL editor, or `psql` if you have the connection string). This plan doesn't automate this step since it touches shared infrastructure — apply it manually and confirm the table exists (`select * from public.agent_runs limit 1;` should return zero rows, not an error).

- [ ] **Step 3: Commit the migration file**

```bash
git add src/backend/db/migrations/20260710_020_create_agent_runs.sql
git commit -m "feat: add agent_runs migration for orchestrator handoff tracing"
```

---

### Task 7: agentRunsLog.js

**Files:**
- Create: `src/backend/agents/agentRunsLog.js`
- Test: `tests/unit/agentRunsLog.test.js`

Follows the exact fire-and-forget pattern from `services/metrics.js` for writes (never blocks or throws into the caller — silently no-ops if Supabase isn't configured, e.g. local dev without env vars). Reads (`getAgentTrace`) are not fire-and-forget — a failure there should surface to the MCP caller as a real error.

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/agentRunsLog.test.js`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { logAgentSpan, getAgentTrace } from "../../src/backend/agents/agentRunsLog.js";

function mockAdmin(insertedRows, selectResult) {
  return {
    from(table) {
      assert.equal(table, "agent_runs");
      return {
        insert: (row) => {
          insertedRows.push(row);
          return Promise.resolve({ error: null });
        },
        select: () => ({
          eq: () => ({
            order: () => Promise.resolve({ data: selectResult, error: null }),
          }),
        }),
      };
    },
  };
}

test("logAgentSpan writes a row with the expected shape", async () => {
  const rows = [];
  await logAgentSpan(
    { runId: "r1", childAgent: "retrieval", status: "ok", latencyMs: 42, edgeSummary: { petCheck: "skipped" } },
    { getSupabaseAdminFn: () => mockAdmin(rows, []) },
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].run_id, "r1");
  assert.equal(rows[0].child_agent, "retrieval");
  assert.equal(rows[0].parent_agent, "orchestrator");
  assert.equal(rows[0].status, "ok");
  assert.equal(rows[0].latency_ms, 42);
  assert.deepEqual(rows[0].edge_summary, { petCheck: "skipped" });
});

test("logAgentSpan silently no-ops when Supabase is not configured", async () => {
  await logAgentSpan(
    { runId: "r1", childAgent: "retrieval", status: "ok", latencyMs: 1 },
    { getSupabaseAdminFn: () => { throw new Error("SUPABASE_URL and SUPABASE_SERVICE_KEY must be set"); } },
  );
  // Must not throw — assertion is simply that we reach this line.
});

test("getAgentTrace returns spans for a run_id ordered by timestamp", async () => {
  const fakeSpans = [
    { span_id: "1", run_id: "r1", child_agent: "retrieval", status: "ok" },
    { span_id: "2", run_id: "r1", child_agent: "itinerary", status: "ok" },
  ];
  const result = await getAgentTrace("r1", { getSupabaseAdminFn: () => mockAdmin([], fakeSpans) });
  assert.equal(result.length, 2);
  assert.equal(result[0].child_agent, "retrieval");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/unit/agentRunsLog.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `agentRunsLog.js`**

Create `src/backend/agents/agentRunsLog.js`:

```js
import { getSupabaseAdmin } from "../utils/supabaseClient.js";
import { log } from "../utils/logger.js";

// Fire-and-forget write, matching services/metrics.js's exact pattern —
// never blocks or throws into the orchestrator, silently no-ops when
// Supabase isn't configured (e.g. local dev without env vars).
export async function logAgentSpan(
  { runId, childAgent, status, latencyMs, edgeSummary = null },
  deps = {},
) {
  const { getSupabaseAdminFn = getSupabaseAdmin } = deps;
  try {
    const admin = getSupabaseAdminFn();
    const { error } = await admin.from("agent_runs").insert({
      run_id: runId,
      parent_agent: "orchestrator",
      child_agent: childAgent,
      status,
      latency_ms: latencyMs,
      edge_summary: edgeSummary,
    });
    if (error) log.warn("agent-runs:persist-fail", { error: error.message, childAgent });
  } catch {
    // Supabase not configured — silently skip, matches metrics.js pattern.
  }
}

// Read path — failures propagate to the caller (the get_agent_trace MCP tool),
// unlike the write path, since a broken trace lookup should be visible.
export async function getAgentTrace(runId, deps = {}) {
  const { getSupabaseAdminFn = getSupabaseAdmin } = deps;
  const admin = getSupabaseAdminFn();
  const { data, error } = await admin
    .from("agent_runs")
    .select("span_id, run_id, parent_agent, child_agent, status, latency_ms, edge_summary, timestamp")
    .eq("run_id", runId)
    .order("timestamp", { ascending: true });
  if (error) throw new Error(`Failed to fetch agent trace: ${error.message}`);
  return data;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/unit/agentRunsLog.test.js`
Expected: `# pass 3`, `# fail 0`

- [ ] **Step 5: Commit**

```bash
git add src/backend/agents/agentRunsLog.js tests/unit/agentRunsLog.test.js
git commit -m "feat: add agentRunsLog for writing and reading orchestrator handoff spans"
```

---

### Task 8: orchestrator.js

**Files:**
- Create: `src/backend/agents/orchestrator.js`
- Test: `tests/unit/orchestrator.test.js`

Wires the 4 agents into a LangGraph.js `StateGraph`: `retrieval` fans out unconditionally to `itinerary` and `safety` in parallel (both always run — the "conditional" behavior lives inside `safetyAgent`'s own car-seat/pet sub-checks, not at the graph level), both converge into `packing`, which the graph runs to completion once both predecessors finish (verified directly against the installed `@langchain/langgraph@1.4.7` API before writing this). If `retrieval` fails, every downstream node logs `status: "skipped"` and returns an `"unavailable"` placeholder rather than throwing — this is the partial-failure degrade path from the spec.

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/orchestrator.test.js`:

```js
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/unit/orchestrator.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `orchestrator.js`**

Create `src/backend/agents/orchestrator.js`:

```js
import { StateGraph, Annotation, START, END } from "@langchain/langgraph";
import crypto from "node:crypto";
import { runRetrievalAgent } from "./retrievalAgent.js";
import { runItineraryAgent } from "./itineraryAgent.js";
import { runSafetyAgent } from "./safetyAgent.js";
import { runPackingAgent } from "./packingAgent.js";
import { logAgentSpan } from "./agentRunsLog.js";

// State channel names must differ from node names — LangGraph.js throws
// "X is already being used as a state attribute... cannot also be used as
// a node name" otherwise (verified directly against @langchain/langgraph@1.4.7).
const OrchestratorState = Annotation.Root({
  input: Annotation(),
  runId: Annotation(),
  retrievalResult: Annotation(),
  itineraryResult: Annotation(),
  safetyResult: Annotation(),
  packingResult: Annotation(),
});

function buildGraph(deps) {
  const logSpanFn = deps.logAgentSpanFn || logAgentSpan;

  return new StateGraph(OrchestratorState)
    .addNode("retrieval", async (state) => {
      const start = Date.now();
      try {
        const result = await runRetrievalAgent(state.input, deps);
        await logSpanFn({ runId: state.runId, childAgent: "retrieval", status: "ok", latencyMs: Date.now() - start });
        return { retrievalResult: result };
      } catch (error) {
        await logSpanFn({ runId: state.runId, childAgent: "retrieval", status: "error", latencyMs: Date.now() - start });
        return { retrievalResult: { error: error.message } };
      }
    })
    .addNode("itinerary", async (state) => {
      const start = Date.now();
      if (state.retrievalResult?.error) {
        await logSpanFn({ runId: state.runId, childAgent: "itinerary", status: "skipped", latencyMs: 0 });
        return { itineraryResult: { status: "unavailable", reason: "retrieval failed" } };
      }
      try {
        const result = await runItineraryAgent(state.input, state.retrievalResult, deps);
        await logSpanFn({ runId: state.runId, childAgent: "itinerary", status: "ok", latencyMs: Date.now() - start });
        return { itineraryResult: result };
      } catch (error) {
        await logSpanFn({ runId: state.runId, childAgent: "itinerary", status: "error", latencyMs: Date.now() - start });
        return { itineraryResult: { status: "unavailable", reason: error.message } };
      }
    })
    .addNode("safety", async (state) => {
      const start = Date.now();
      if (state.retrievalResult?.error) {
        await logSpanFn({ runId: state.runId, childAgent: "safety", status: "skipped", latencyMs: 0 });
        return { safetyResult: { status: "unavailable", reason: "retrieval failed" } };
      }
      try {
        const result = await runSafetyAgent(state.input, state.retrievalResult, deps);
        await logSpanFn({
          runId: state.runId,
          childAgent: "safety",
          status: "ok",
          latencyMs: Date.now() - start,
          edgeSummary: result.edgeSummary,
        });
        return { safetyResult: result };
      } catch (error) {
        await logSpanFn({ runId: state.runId, childAgent: "safety", status: "error", latencyMs: Date.now() - start });
        return { safetyResult: { status: "unavailable", reason: error.message } };
      }
    })
    .addNode("packing", async (state) => {
      const start = Date.now();
      // packingAgent only depends on retrieval's output (weather) — see
      // packingAgent.js's own doc comment — so it only skips when retrieval
      // itself failed, not when itinerary/safety failed.
      if (state.retrievalResult?.error) {
        await logSpanFn({ runId: state.runId, childAgent: "packing", status: "skipped", latencyMs: 0 });
        return { packingResult: { status: "unavailable", reason: "retrieval failed" } };
      }
      try {
        const result = await runPackingAgent(state.input, state.retrievalResult, deps);
        await logSpanFn({ runId: state.runId, childAgent: "packing", status: "ok", latencyMs: Date.now() - start });
        return { packingResult: result };
      } catch (error) {
        await logSpanFn({ runId: state.runId, childAgent: "packing", status: "error", latencyMs: Date.now() - start });
        return { packingResult: { status: "unavailable", reason: error.message } };
      }
    })
    .addEdge(START, "retrieval")
    .addEdge("retrieval", "itinerary")
    .addEdge("retrieval", "safety")
    .addEdge("itinerary", "packing")
    .addEdge("safety", "packing")
    .addEdge("packing", END)
    .compile();
}

const TIMEOUT_MS = 30000;

export async function runOrchestrator(input, deps = {}) {
  const runId = crypto.randomUUID();
  const graph = buildGraph(deps);

  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error("plan_trip timed out after 30s")), TIMEOUT_MS),
  );
  const finalState = await Promise.race([graph.invoke({ input, runId }), timeout]);

  return {
    runId,
    destination: input.destination,
    trip: finalState.itineraryResult?.tripPlan ?? null,
    scheduledItinerary: finalState.itineraryResult?.scheduledItinerary ?? null,
    packingList: finalState.packingResult?.packingList ?? null,
    safety: finalState.safetyResult ?? null,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/unit/orchestrator.test.js`
Expected: `# pass 3`, `# fail 0`

- [ ] **Step 5: Run the full suite and commit**

Run: `npm test`
Expected: `# pass 429` (423 after M1 + 3 agentRunsLog + 3 orchestrator), `# fail 0`

```bash
git add src/backend/agents/orchestrator.js tests/unit/orchestrator.test.js
git commit -m "feat: add LangGraph orchestrator wiring the 4 specialist agents"
```

---

## Milestone M3: MCP Server

### Task 9: MCP auth, rate limit, and kill-switch middleware

**Files:**
- Create: `src/backend/mcp/mcpAuth.js`
- Test: `tests/unit/mcpAuth.test.js`

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/mcpAuth.test.js`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { mcpAuth } from "../../src/backend/mcp/mcpAuth.js";

function mockReqRes(authHeader) {
  const req = { headers: { authorization: authHeader } };
  let statusCode = null;
  let body = null;
  const res = {
    status(code) { statusCode = code; return this; },
    json(payload) { body = payload; return this; },
  };
  return { req, res, getResult: () => ({ statusCode, body }) };
}

test("mcpAuth rejects a missing Authorization header", () => {
  process.env.MCP_DEMO_TOKEN = "secret-token";
  const { req, res, getResult } = mockReqRes(undefined);
  let nextCalled = false;
  mcpAuth(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, false);
  assert.equal(getResult().statusCode, 401);
});

test("mcpAuth rejects an incorrect token", () => {
  process.env.MCP_DEMO_TOKEN = "secret-token";
  const { req, res, getResult } = mockReqRes("Bearer wrong-token");
  let nextCalled = false;
  mcpAuth(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, false);
  assert.equal(getResult().statusCode, 401);
});

test("mcpAuth accepts the correct token and calls next", () => {
  process.env.MCP_DEMO_TOKEN = "secret-token";
  const { req, res } = mockReqRes("Bearer secret-token");
  let nextCalled = false;
  mcpAuth(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, true);
  delete process.env.MCP_DEMO_TOKEN;
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/unit/mcpAuth.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `mcpAuth.js`**

Create `src/backend/mcp/mcpAuth.js`:

```js
import crypto from "node:crypto";

function jsonRpcUnauthorized(res) {
  return res.status(401).json({
    jsonrpc: "2.0",
    error: { code: -32001, message: "Unauthorized" },
    id: null,
  });
}

// Constant-time bearer-token check against MCP_DEMO_TOKEN. This endpoint is
// internet-facing and triggers real paid LLM calls, so a timing-safe compare
// matters even for a single shared demo token.
export function mcpAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.replace(/^Bearer\s+/i, "").trim();
  const expected = process.env.MCP_DEMO_TOKEN || "";

  if (!expected || !token) return jsonRpcUnauthorized(res);

  const tokenBuf = Buffer.from(token);
  const expectedBuf = Buffer.from(expected);
  const valid = tokenBuf.length === expectedBuf.length && crypto.timingSafeEqual(tokenBuf, expectedBuf);

  if (!valid) return jsonRpcUnauthorized(res);
  next();
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/unit/mcpAuth.test.js`
Expected: `# pass 3`, `# fail 0`

- [ ] **Step 5: Commit**

```bash
git add src/backend/mcp/mcpAuth.js tests/unit/mcpAuth.test.js
git commit -m "feat: add mcpAuth constant-time bearer-token middleware"
```

---

### Task 10: MCP tools + mount function

**Files:**
- Create: `src/backend/mcp/mount.js`
- Test: `tests/integration/mcp.integration.test.js`

Registers the two MCP tools (`plan_trip`, `get_agent_trace`) on an `McpServer`, wires `mcpAuth` + a tight rate limiter + the `MCP_ENABLED` kill switch, and exposes `mountMcpRoutes(app, deps)` for `server.js` to call. Uses the exact `StreamableHTTPServerTransport` stateless pattern shipped in the SDK's own `examples/server/simpleStatelessStreamableHttp.js` (verified directly against the installed `@modelcontextprotocol/sdk@1.29.0`) — a fresh `McpServer` + transport per request, no session persistence needed since `plan_trip` calls are independent.

- [ ] **Step 1: Write the failing tests**

Create `tests/integration/mcp.integration.test.js`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { createApp } from "../../src/backend/server.js";

async function postMcp(port, token, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const req = http.request(
      {
        hostname: "localhost",
        port,
        path: "/mcp",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json, text/event-stream",
          "Content-Length": Buffer.byteLength(payload),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => { data += chunk; });
        res.on("end", () => resolve({ statusCode: res.statusCode, body: data }));
      },
    );
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

const initializeRequest = {
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "test-client", version: "1.0" },
  },
};

test("POST /mcp rejects requests without a valid token", async () => {
  process.env.MCP_DEMO_TOKEN = "test-demo-token";
  const app = createApp({ enableRequestLogging: false });
  const server = app.listen(0);
  try {
    const port = server.address().port;
    const res = await postMcp(port, "wrong-token", initializeRequest);
    assert.equal(res.statusCode, 401);
  } finally {
    server.close();
    delete process.env.MCP_DEMO_TOKEN;
  }
});

test("POST /mcp is disabled entirely when MCP_ENABLED=false", async () => {
  process.env.MCP_DEMO_TOKEN = "test-demo-token";
  process.env.MCP_ENABLED = "false";
  const app = createApp({ enableRequestLogging: false });
  const server = app.listen(0);
  try {
    const port = server.address().port;
    const res = await postMcp(port, "test-demo-token", initializeRequest);
    assert.equal(res.statusCode, 404);
  } finally {
    server.close();
    delete process.env.MCP_DEMO_TOKEN;
    delete process.env.MCP_ENABLED;
  }
});

test("POST /mcp initializes successfully with a valid token", async () => {
  process.env.MCP_DEMO_TOKEN = "test-demo-token";
  const app = createApp({ enableRequestLogging: false });
  const server = app.listen(0);
  try {
    const port = server.address().port;
    const res = await postMcp(port, "test-demo-token", initializeRequest);
    assert.equal(res.statusCode, 200);
    assert.ok(res.body.includes('"protocolVersion"'));
  } finally {
    server.close();
    delete process.env.MCP_DEMO_TOKEN;
  }
});

test("plan_trip tool call runs the orchestrator via injected deps", async () => {
  process.env.MCP_DEMO_TOKEN = "test-demo-token";
  const app = createApp({
    enableRequestLogging: false,
    runOrchestratorFn: async (input) => ({
      runId: "fixed-run-id",
      destination: input.destination,
      trip: { overview: "Mock trip" },
      packingList: { categories: [] },
      safety: { status: "unavailable", reason: "no children or pets" },
    }),
  });
  const server = app.listen(0);
  try {
    const port = server.address().port;
    await postMcp(port, "test-demo-token", initializeRequest);
    const toolCallRes = await postMcp(port, "test-demo-token", {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: {
        name: "plan_trip",
        arguments: { destination: "Portland, OR", startDate: "2026-08-01", endDate: "2026-08-04" },
      },
    });
    assert.equal(toolCallRes.statusCode, 200);
    assert.ok(toolCallRes.body.includes("Mock trip"));
    assert.ok(toolCallRes.body.includes("fixed-run-id"));
  } finally {
    server.close();
    delete process.env.MCP_DEMO_TOKEN;
  }
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/integration/mcp.integration.test.js`
Expected: FAIL — `/mcp` route doesn't exist yet (connection reset or 404 from the static-file catch-all).

- [ ] **Step 3: Implement `mount.js`**

Create `src/backend/mcp/mount.js`:

```js
import rateLimit from "express-rate-limit";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { mcpAuth } from "./mcpAuth.js";
import { runOrchestrator } from "../agents/orchestrator.js";
import { getAgentTrace } from "../agents/agentRunsLog.js";
import { log } from "../utils/logger.js";

function buildMcpLimiter() {
  return rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 10, // 10 plan_trip/get_agent_trace calls per hour per token — these trigger real paid LLM calls.
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => req.headers.authorization || req.ip,
    handler: (req, res) => {
      res.status(429).json({
        jsonrpc: "2.0",
        error: { code: -32000, message: "Too many MCP requests. Try again in an hour." },
        id: null,
      });
    },
  });
}

function buildMcpServer({ runOrchestratorFn, getAgentTraceFn }) {
  const server = new McpServer({ name: "sproutroute-orchestrator", version: "1.0.0" }, { capabilities: {} });

  server.registerTool(
    "plan_trip",
    {
      description:
        "Plans a family trip end-to-end: itinerary, packing list, and safety guidance (car seat + pet travel, when applicable).",
      inputSchema: {
        destination: z.string().describe("Destination, e.g. 'Portland, OR'"),
        startDate: z.string().describe("ISO date YYYY-MM-DD"),
        endDate: z.string().describe("ISO date YYYY-MM-DD"),
        children: z.array(z.object({ age: z.number() })).optional().describe("Children traveling, with ages"),
        pets: z
          .array(
            z.object({
              type: z.enum(["dog", "cat", "small_animal"]),
              breed: z.string(),
              weightLbs: z.number(),
              name: z.string().optional(),
            }),
          )
          .optional(),
        activities: z.array(z.string()).optional().describe("Activity slugs, e.g. ['parks', 'hiking']"),
      },
    },
    async (args) => {
      const result = await runOrchestratorFn(args);
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    },
  );

  server.registerTool(
    "get_agent_trace",
    {
      description: "Returns the ordered agent handoff trace for a previous plan_trip call.",
      inputSchema: {
        runId: z.string().describe("The runId returned in a prior plan_trip response"),
      },
    },
    async ({ runId }) => {
      const trace = await getAgentTraceFn(runId);
      return { content: [{ type: "text", text: JSON.stringify(trace) }] };
    },
  );

  return server;
}

// Mounts POST /mcp on an existing Express app. Additive only — no changes to
// any other route. Gated by MCP_ENABLED so it can be disabled instantly
// (no redeploy) if the demo token leaks or costs spike.
export function mountMcpRoutes(app, deps = {}) {
  if (process.env.MCP_ENABLED === "false") return;

  const { runOrchestratorFn = runOrchestrator, getAgentTraceFn = getAgentTrace } = deps;
  const mcpLimiter = buildMcpLimiter();

  app.post("/mcp", mcpAuth, mcpLimiter, async (req, res) => {
    const server = buildMcpServer({ runOrchestratorFn, getAgentTraceFn });
    try {
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
      res.on("close", () => {
        transport.close();
        server.close();
      });
    } catch (error) {
      log.error("mcp:request-failed", { error: error.message });
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: { code: -32603, message: "Internal server error" },
          id: null,
        });
      }
    }
  });
}
```

- [ ] **Step 4: Wire the mount into `server.js`**

In `src/backend/server.js`, add the import near the other service imports (after the `import { createAttractionMemoryService } from "./services/attractionMemory.js";` line):

```js
import { mountMcpRoutes } from "./mcp/mount.js";
```

Then, inside `createApp(deps = {})`, right after the `app.use(express.urlencoded(...))` line (before the CSP/security-headers middleware block), add:

```js
  mountMcpRoutes(app, deps);
```

This must run before the CSP middleware would otherwise apply overly-restrictive headers to `/mcp` responses, and before the `app.get("*", ...)` static-file fallback near the end of the file — placing it right after body-parsing middleware, before everything else, satisfies both.

- [ ] **Step 5: Run tests to verify they pass**

Run: `node --test tests/integration/mcp.integration.test.js`
Expected: `# pass 4`, `# fail 0`

- [ ] **Step 6: Run the full suite and commit**

Run: `npm test`
Expected: `# pass 436` (429 after M2 + 3 mcpAuth + 4 mcp integration), `# fail 0`

```bash
git add src/backend/mcp/mount.js src/backend/server.js tests/integration/mcp.integration.test.js
git commit -m "feat: add MCP server exposing plan_trip and get_agent_trace tools"
```

---

### Task 11: Railway deployment and live verification

**Files:** none (operational task — env vars + manual verification)

- [ ] **Step 1: Generate a demo token**

Run: `node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"`
Save the output — this is the token reviewers will use.

- [ ] **Step 2: Set Railway environment variables**

```bash
railway variables --service SproutRoute --set "MCP_DEMO_TOKEN=<token from step 1>"
railway variables --service SproutRoute --set "MCP_ENABLED=true"
```

- [ ] **Step 3: Deploy**

Merge/push this branch to `main` per the branch strategy in `strollerscout/CLAUDE.md`, or push directly if working solo:

```bash
git push origin feature/multi-agent-orchestrator-mcp
# open a PR, wait for CI, merge to main
```

Railway auto-deploys on push to `main`.

- [ ] **Step 4: Verify against a real Claude Desktop session**

Add to Claude Desktop's `claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "sproutroute": {
      "url": "https://sproutroute-production.up.railway.app/mcp",
      "headers": { "Authorization": "Bearer <token from step 1>" }
    }
  }
}
```
Restart Claude Desktop, then ask it to plan a real trip (e.g. "plan a 3-day trip to Portland with a 5-year-old"). Confirm:
- The `plan_trip` tool is called and returns a real itinerary + packing list.
- `get_agent_trace` with the returned `runId` shows 4 spans.
- `select * from public.agent_runs order by timestamp desc limit 10;` in Supabase shows the same run.

- [ ] **Step 5: Watch logs for the first few real calls**

Run: `railway logs --service SproutRoute --lines 100`
Confirm no unexpected errors from the `/mcp` route.

---

## Milestone M4: Case Page + README

### Task 12: README section

**Files:**
- Modify: `README.md` (strollerscout repo root)

- [ ] **Step 1: Add an MCP setup section**

Read the current `README.md` first to match its existing heading style, then add a new section (after the existing "Commands" or equivalent section) documenting:
- What the MCP server does (2-3 sentences, matching the spec's §1).
- The exact `claude_desktop_config.json` snippet from Task 11 Step 4 (with `<token>` as a placeholder the reader must fill in — this one placeholder is intentional, since the real token is a secret, not a plan gap).
- A note that `MCP_ENABLED=false` disables it instantly if needed.

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: document hosted MCP server setup in README"
```

---

### Task 13: Case page — "V4: Multi-Agent Architecture" section

**Files:**
- Modify: `/Users/nitish/VS Code Projects/tpm-portfolio/nitishprasad-website/project-sproutroute.html` (lines 90-107, the existing `id="architecture"` section — **note this file lives in the separate `tpm-portfolio` repo, not `strollerscout`**)

- [ ] **Step 1: Capture a real screenshot**

During Task 11 Step 4's live verification, take a screenshot of Claude Desktop showing the `plan_trip` tool call and its result. Save it as `nitishprasad-website/diagrams/mcp-handoff-trace.png` in the `tpm-portfolio` repo.

- [ ] **Step 2: Add a 5th evidence panel**

In `nitishprasad-website/project-sproutroute.html`, inside the `evidence-grid` div (line 94-99), add a 5th `<article>` after the existing "Current state" one:

```html
<article class="evidence-panel"><strong>V4: multi-agent + MCP</strong><p>Refactored the planner into a LangGraph orchestrator with 4 specialist agents and a hosted MCP server — installable in Claude Desktop, with a real handoff trace logged per request.</p></article>
```

- [ ] **Step 3: Add the screenshot to the visual grid**

In the same section's `visual-grid` div (line 100-105), add:

```html
<figure class="visual diagram-visual"><img data-lightbox src="diagrams/mcp-handoff-trace.png" alt="Claude Desktop calling the SproutRoute MCP server's plan_trip tool" /><figcaption>Live MCP handoff trace</figcaption></figure>
```

- [ ] **Step 4: Commit (in the tpm-portfolio repo)**

```bash
cd "/Users/nitish/VS Code Projects/tpm-portfolio"
git add nitishprasad-website/project-sproutroute.html nitishprasad-website/diagrams/mcp-handoff-trace.png
git commit -m "content: add V4 multi-agent architecture section to SproutRoute case page"
```

---

## Definition of Done

- [ ] `npm test` passes in full (baseline 412 + all new tests from this plan).
- [ ] `cd src/frontend && npm run build` still builds without errors (no frontend files were touched, but confirm per this repo's Definition of Done).
- [ ] A real Claude Desktop session, connected to the Railway-hosted `/mcp` endpoint (not local stdio), completes a full `plan_trip` call and a `get_agent_trace` call.
- [ ] `MCP_ENABLED=false` verified to fully disable the endpoint without a redeploy.
- [ ] Case page and README updated with real (not placeholder) content and a real screenshot.
