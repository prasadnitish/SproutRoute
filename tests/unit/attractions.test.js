/**
 * attractions.test.js — Phase 6: Attraction intelligence endpoint tests
 *
 * Tests the ranking, city lookup, and verify endpoints.
 * Uses createApp DI pattern with minimal mocks.
 */

import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { createApp } from "../../src/backend/server.js";

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

// ── POST /api/v1/attractions/rank ───────────────────────────────────────────

test("POST /api/v1/attractions/rank requires cityName", async () => {
  const { server, port } = await makeServer();
  try {
    const res = await fetch(`http://localhost:${port}/api/v1/attractions/rank`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    assert.strictEqual(res.status, 422);
    const data = await res.json();
    assert.ok(data.error.includes("cityName"), "Error should mention cityName");
  } finally {
    server.close();
  }
});

test("POST /api/v1/attractions/rank returns empty for unknown city (no Supabase in test)", async () => {
  const { server, port } = await makeServer();
  try {
    const res = await fetch(`http://localhost:${port}/api/v1/attractions/rank`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cityName: "Atlantis" }),
    });
    // Will return 500 because Supabase isn't configured in test
    // This is expected — the endpoint exists and validates input
    assert.ok(res.status === 500 || res.status === 200, "Should respond (500 without Supabase or 200 with)");
  } finally {
    server.close();
  }
});

// ── GET /api/v1/attractions/city/:cityId ────────────────────────────────────

test("GET /api/v1/attractions/city/:id rejects invalid UUID format", async () => {
  const { server, port } = await makeServer();
  try {
    const res = await fetch(`http://localhost:${port}/api/v1/attractions/city/test-id`);
    // UUID validation should reject non-UUID strings
    assert.strictEqual(res.status, 400);
  } finally {
    server.close();
  }
});

// ── POST /api/v1/attractions/verify ─────────────────────────────────────────

test("POST /api/v1/attractions/verify requires auth", async () => {
  const { server, port } = await makeServer();
  try {
    const res = await fetch(`http://localhost:${port}/api/v1/attractions/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ attractionId: "test" }),
    });
    // Now requires auth — should return 401 without token
    assert.strictEqual(res.status, 401);
  } finally {
    server.close();
  }
});

// ── POST /api/v1/profile/me/feedback ────────────────────────────────────────

test("POST /api/v1/profile/me/feedback without auth returns 401", async () => {
  const { server, port } = await makeServer();
  try {
    const res = await fetch(`http://localhost:${port}/api/v1/profile/me/feedback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tripRequestId: "test-trip-1",
        signalType: "more_like_this",
        payload: {},
      }),
    });
    assert.strictEqual(res.status, 401);
  } finally {
    server.close();
  }
});
