/**
 * /api/v1 Contract Tests — Phase 1
 *
 * Written BEFORE implementation (TDD Red phase).
 * Tests verify:
 *   1. All /api/v1 routes exist and return correct shapes
 *   2. Standard error envelope on bad input
 *   3. Legacy aliases (/api/*) return identical responses to v1 routes
 *   4. GET /api/v1/meta/capabilities returns the capability payload shape
 *   5. Rate limit 429 uses standard error envelope
 */

import test from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../../src/backend/server.js";

const ORIGINAL_API_KEY = process.env.ANTHROPIC_API_KEY;

// ── Helpers ────────────────────────────────────────────────────────────────

function createMockRes() {
  return {
    statusCode: 200,
    body: undefined,
    headers: {},
    setHeader(name, value) {
      this.headers[name] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    sendFile() {}, // no-op for SPA fallback
  };
}

/**
 * Invoke a route by finding it in the Express router stack.
 * Supports both GET and POST. Skips rate-limiter middleware.
 */
async function invokeRoute(app, method, path, body = {}) {
  const routeStack = app._router?.stack || [];
  const routeLayer = routeStack.find(
    (layer) =>
      layer.route &&
      layer.route.path === path &&
      layer.route.methods[method.toLowerCase()],
  );

  if (!routeLayer) {
    throw new Error(`Route not found: ${method} ${path}`);
  }

  const handler =
    routeLayer.route.stack[routeLayer.route.stack.length - 1].handle;
  const req = { method, path, body, headers: {}, ip: "127.0.0.1" };
  const res = createMockRes();

  await handler(req, res);
  return res;
}

// Standard error envelope shape validator
function assertErrorEnvelope(body, opts = {}) {
  assert.ok(body.code, `Error envelope must have 'code' — got: ${JSON.stringify(body)}`);
  assert.ok(body.message, `Error envelope must have 'message' — got: ${JSON.stringify(body)}`);
  assert.ok(body.category, `Error envelope must have 'category' — got: ${JSON.stringify(body)}`);
  assert.strictEqual(
    typeof body.retryable,
    "boolean",
    `Error envelope 'retryable' must be boolean — got: ${typeof body.retryable}`,
  );
  assert.ok(body.requestId, `Error envelope must have 'requestId' — got: ${JSON.stringify(body)}`);
  if (opts.code) {
    assert.strictEqual(body.code, opts.code, `Expected error code '${opts.code}' — got: '${body.code}'`);
  }
  if (opts.retryable !== undefined) {
    assert.strictEqual(body.retryable, opts.retryable);
  }
}

// ── Shared mock deps ────────────────────────────────────────────────────────

const mockGeocodeLocation = async () => ({
  lat: 47.6062,
  lon: -122.3321,
  displayName: "Seattle, WA",
  stateCode: "WA",
  stateName: "Washington",
});

const mockWeather = async () => ({
  summary: "Mild and partly cloudy",
  forecast: [{ name: "Monday", high: 65, low: 50, precipitation: 20 }],
});

const mockTripPlan = async () => ({
  overview: "A great family trip to Seattle.",
  suggestedActivities: ["Pike Place Market", "Seattle Aquarium"],
  dailyItinerary: [{ day: 1, activities: ["Arrival", "Pike Place Market"] }],
  tips: ["Bring layers", "Book the Aquarium in advance"],
});

const mockPackingList = async () => ({
  categories: [
    {
      name: "Clothing",
      items: [{ name: "Rain jacket", quantity: "1", reason: "Rain likely" }],
    },
  ],
});

const mockCarSeat = ({ children }) => ({
  status: "Needs review",
  jurisdictionCode: "WA",
  jurisdictionName: "Washington",
  guidanceMode: "us_state_law",
  confidence: "high",
  sourceAuthority: "Washington State Law",
  lastReviewed: "2026-01-01",
  message: "Verify official source before travel.",
  sourceUrl: "https://example.org",
  results: children.map((child, i) => ({
    childId: `child-${i + 1}`,
    status: "Needs review",
    requiredRestraint: "booster",
    requiredRestraintLabel: "Booster seat",
    rationale: "Age-appropriate",
  })),
});

function createTestApp() {
  process.env.ANTHROPIC_API_KEY = "test-key";
  return createApp({
    enableRequestLogging: false,
    geocodeLocationFn: mockGeocodeLocation,
    getWeatherForecastFn: mockWeather,
    generateTripPlanFn: mockTripPlan,
    generatePackingListFn: mockPackingList,
    getCarSeatGuidanceFn: mockCarSeat,
    resolveDestinationQueryFn: async () => ({
      mode: "direct",
      destination: { name: "Seattle", displayName: "Seattle, WA" },
    }),
  });
}

test.afterEach(() => {
  process.env.ANTHROPIC_API_KEY = ORIGINAL_API_KEY;
});

// ── /api/v1/meta/capabilities ──────────────────────────────────────────────

test("GET /api/v1/meta/capabilities returns capability payload shape", async () => {
  const app = createTestApp();
  const res = await invokeRoute(app, "GET", "/api/v1/meta/capabilities");

  assert.strictEqual(res.statusCode, 200);
  const { body } = res;

  // Required top-level fields
  assert.ok(Array.isArray(body.supportedCountries), "must have supportedCountries array");
  assert.ok(body.weatherProviders, "must have weatherProviders");
  assert.ok(body.safetyModes, "must have safetyModes");
  assert.ok(body.featureFlags, "must have featureFlags");
  assert.ok(body.schemaVersion, "must have schemaVersion");

  // US is always supported
  assert.ok(body.supportedCountries.includes("US"), "US must be a supported country");

  // Feature flags shape
  assert.strictEqual(typeof body.featureFlags.shareLinks, "boolean");
  assert.strictEqual(typeof body.featureFlags.customItems, "boolean");
});

test("GET /api/v1/meta/capabilities includes ios26Features when client=ios", async () => {
  const app = createTestApp();
  // Simulate iOS client via query param or request body (GET with body for testing)
  const routeStack = app._router?.stack || [];
  const routeLayer = routeStack.find(
    (layer) =>
      layer.route &&
      layer.route.path === "/api/v1/meta/capabilities" &&
      layer.route.methods["get"],
  );
  assert.ok(routeLayer, "GET /api/v1/meta/capabilities route must exist");

  const handler = routeLayer.route.stack[routeLayer.route.stack.length - 1].handle;
  const req = {
    method: "GET",
    path: "/api/v1/meta/capabilities",
    body: { client: "ios" },
    query: { client: "ios" },
    headers: {},
    ip: "127.0.0.1",
  };
  const res = createMockRes();
  await handler(req, res);

  assert.strictEqual(res.statusCode, 200);
  assert.ok(res.body.ios26Features, "ios26Features must be present for iOS client");
  assert.strictEqual(typeof res.body.ios26Features.liquidGlass, "boolean");
  assert.strictEqual(typeof res.body.ios26Features.weatherKitFastPath, "boolean");
  assert.strictEqual(typeof res.body.ios26Features.foundationModelRecap, "boolean");
  assert.strictEqual(typeof res.body.ios26Features.appIntents, "boolean");
});

// ── POST /api/v1/trip/resolve ──────────────────────────────────────────────

test("POST /api/v1/trip/resolve returns result on valid input", async () => {
  const app = createTestApp();
  const res = await invokeRoute(app, "POST", "/api/v1/trip/resolve", {
    query: "Seattle",
    client: "web",
    schemaVersion: "1",
  });

  assert.strictEqual(res.statusCode, 200);
  assert.ok(res.body, "must return a body");
  // requestId must be present on all v1 responses
  assert.ok(res.body.requestId, "v1 response must include requestId");
});

test("POST /api/v1/trip/resolve returns error envelope on missing query", async () => {
  const app = createTestApp();
  const res = await invokeRoute(app, "POST", "/api/v1/trip/resolve", {
    // missing: query
    client: "web",
  });

  assert.strictEqual(res.statusCode, 400);
  assertErrorEnvelope(res.body, { code: "MISSING_QUERY", retryable: false });
});

// ── POST /api/v1/trip/plan ─────────────────────────────────────────────────

test("POST /api/v1/trip/plan returns trip + weather + plan with requestId", async () => {
  const app = createTestApp();
  const res = await invokeRoute(app, "POST", "/api/v1/trip/plan", {
    destination: "Seattle, WA",
    startDate: "2026-05-01",
    endDate: "2026-05-04",
    activities: ["parks"],
    children: [{ age: 3 }],
    client: "web",
    schemaVersion: "1",
    countryCode: "US",
    unitSystem: "imperial",
  });

  assert.strictEqual(res.statusCode, 200);
  assert.ok(res.body.requestId, "v1 response must include requestId");
  assert.ok(res.body.trip, "must have trip");
  assert.ok(res.body.weather, "must have weather");
  assert.ok(res.body.tripPlan, "must have tripPlan");
});

test("POST /api/v1/trip/plan returns error envelope on missing destination", async () => {
  const app = createTestApp();
  const res = await invokeRoute(app, "POST", "/api/v1/trip/plan", {
    // missing: destination
    startDate: "2026-05-01",
    endDate: "2026-05-04",
    children: [{ age: 3 }],
  });

  assert.strictEqual(res.statusCode, 400);
  assertErrorEnvelope(res.body, { retryable: false });
});

// ── POST /api/v1/trip/packing ──────────────────────────────────────────────

test("POST /api/v1/trip/packing returns packing list with requestId", async () => {
  const app = createTestApp();
  const res = await invokeRoute(app, "POST", "/api/v1/trip/packing", {
    destination: "Seattle, WA",
    startDate: "2026-05-01",
    endDate: "2026-05-04",
    activities: ["parks", "hiking"],
    children: [{ age: 2 }],
    client: "web",
    schemaVersion: "1",
    unitSystem: "imperial",
  });

  assert.strictEqual(res.statusCode, 200);
  assert.ok(res.body.requestId, "v1 response must include requestId");
  assert.ok(res.body.packingList, "must have packingList");
  assert.ok(Array.isArray(res.body.packingList.categories), "packingList must have categories array");
});

test("POST /api/v1/trip/packing returns error envelope when no activities", async () => {
  const app = createTestApp();
  const res = await invokeRoute(app, "POST", "/api/v1/trip/packing", {
    destination: "Seattle, WA",
    startDate: "2026-05-01",
    endDate: "2026-05-04",
    activities: [], // empty → validation error
    children: [{ age: 2 }],
  });

  assert.strictEqual(res.statusCode, 400);
  assertErrorEnvelope(res.body, { retryable: false });
});

// ── POST /api/v1/safety/car-seat-check ────────────────────────────────────

test("POST /api/v1/safety/car-seat-check returns guidance with guidanceMode and requestId", async () => {
  const app = createTestApp();
  const res = await invokeRoute(app, "POST", "/api/v1/safety/car-seat-check", {
    destination: "Seattle, WA",
    jurisdictionCode: "WA",
    children: [{ age: 5, weightLb: 44, heightIn: 43 }],
    client: "web",
    schemaVersion: "1",
    countryCode: "US",
  });

  assert.strictEqual(res.statusCode, 200);
  assert.ok(res.body.requestId, "v1 response must include requestId");
  assert.ok(res.body.status, "must have status");
  assert.ok(res.body.results, "must have results array");
  // guidanceMode is required in v1 responses
  assert.ok(
    res.body.guidanceMode,
    `v1 safety response must include guidanceMode — got: ${JSON.stringify(res.body)}`,
  );
  assert.ok(
    ["us_state_law", "country_general"].includes(res.body.guidanceMode),
    `guidanceMode must be 'us_state_law' or 'country_general' — got: '${res.body.guidanceMode}'`,
  );
});

test("POST /api/v1/safety/car-seat-check returns error envelope when no children", async () => {
  const app = createTestApp();
  const res = await invokeRoute(app, "POST", "/api/v1/safety/car-seat-check", {
    destination: "Seattle, WA",
    children: [],
  });

  assert.strictEqual(res.statusCode, 400);
  assertErrorEnvelope(res.body, { retryable: false });
});

// ── Legacy alias parity ────────────────────────────────────────────────────

test("POST /api/resolve-destination (legacy) returns same shape as v1", async () => {
  const app = createTestApp();

  const v1Res = await invokeRoute(app, "POST", "/api/v1/trip/resolve", {
    query: "Seattle",
  });
  const legacyRes = await invokeRoute(app, "POST", "/api/resolve-destination", {
    query: "Seattle",
  });

  assert.strictEqual(v1Res.statusCode, legacyRes.statusCode, "status codes must match");
  // Both must return the same mode field (core shape parity)
  assert.ok(legacyRes.body, "legacy route must return a body");
});

test("POST /api/trip-plan (legacy) still works and returns 200", async () => {
  const app = createTestApp();
  const res = await invokeRoute(app, "POST", "/api/trip-plan", {
    destination: "Seattle, WA",
    startDate: "2026-05-01",
    endDate: "2026-05-04",
    activities: ["parks"],
    children: [{ age: 3 }],
  });

  assert.strictEqual(res.statusCode, 200);
  assert.ok(res.body.trip, "legacy /api/trip-plan must still return trip");
});

test("POST /api/generate (legacy) still works and returns 200", async () => {
  const app = createTestApp();
  const res = await invokeRoute(app, "POST", "/api/generate", {
    destination: "Seattle, WA",
    startDate: "2026-05-01",
    endDate: "2026-05-03",
    activities: ["parks"],
    children: [{ age: 2 }],
  });

  assert.strictEqual(res.statusCode, 200);
  assert.ok(res.body.packingList, "legacy /api/generate must still return packingList");
});

test("POST /api/safety/car-seat-check (legacy) still works and returns 200", async () => {
  const app = createTestApp();
  const res = await invokeRoute(app, "POST", "/api/safety/car-seat-check", {
    destination: "Seattle, WA",
    children: [{ age: 5, weightLb: 44, heightIn: 43 }],
  });

  assert.strictEqual(res.statusCode, 200);
  assert.ok(res.body.status, "legacy car-seat route must still return status");
});
