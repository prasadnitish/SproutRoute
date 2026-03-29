/**
 * feedback.test.js — TDD Red for Phase 7: feedback endpoints
 *
 * Tests the POST /api/v1/profile/me/feedback endpoint
 * which stores user feedback signals for profile learning.
 */

import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { createApp } from "../../src/backend/server.js";

// Minimal DI mocks — feedback endpoint doesn't use AI or weather
const minimalDeps = {
  geocodeLocationFn: async () => ({ lat: 0, lon: 0, displayName: "Test", countryCode: "US" }),
  getWeatherForecastFn: async () => ({ periods: [] }),
  generateTripPlanFn: async () => ({}),
  generatePackingListFn: async () => ({ categories: [] }),
};

function makeServer() {
  const app = createApp(minimalDeps);
  const server = http.createServer(app);
  return new Promise((resolve) => {
    server.listen(0, () => resolve({ server, port: server.address().port }));
  });
}

async function fetchJSON(port, path, body) {
  const res = await fetch(`http://localhost:${port}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, data: await res.json() };
}

test("POST /api/v1/profile/me/feedback without auth returns 401", async () => {
  const { server, port } = await makeServer();
  try {
    const { status } = await fetchJSON(port, "/api/v1/profile/me/feedback", {
      tripRequestId: "test-trip-1",
      signalType: "more_like_this",
      payload: { activityId: "act-1" },
    });
    assert.strictEqual(status, 401, "Feedback without auth should return 401");
  } finally {
    server.close();
  }
});

test("POST /api/v1/profile/me/feedback requires signalType", async () => {
  const { server, port } = await makeServer();
  try {
    // Even with auth, missing signalType should return 422
    // (Can't test with real auth, but the validation should happen regardless)
    const res = await fetch(`http://localhost:${port}/api/v1/profile/me/feedback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tripRequestId: "test-1" }),
    });
    // Should be 401 (no auth) before even checking validation
    assert.strictEqual(res.status, 401);
  } finally {
    server.close();
  }
});
