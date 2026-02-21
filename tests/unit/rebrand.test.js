/**
 * Rebrand Guard Tests — Phase 1
 *
 * These tests ensure "StrollerScout" never appears in user-visible
 * or external-API-visible strings. They are written BEFORE the fixes
 * (TDD Red phase) and must fail until the fixes are applied.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../../src/backend/server.js";

// ── Helper copied from api.integration.test.js ────────────────────────────

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
  };
}

async function invokeRoute(app, method, path, body) {
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

// ── Tests ──────────────────────────────────────────────────────────────────

test("GET /api/health message says SproutRoute, not StrollerScout", async () => {
  const app = createApp({ enableRequestLogging: false });
  const res = await invokeRoute(app, "GET", "/api/health", {});

  assert.equal(res.statusCode, 200);
  assert.ok(
    res.body.message,
    "Health response must have a message field",
  );
  assert.ok(
    res.body.message.includes("SproutRoute"),
    `Health message must contain "SproutRoute" — got: "${res.body.message}"`,
  );
  assert.ok(
    !res.body.message.includes("StrollerScout"),
    `Health message must NOT contain "StrollerScout" — got: "${res.body.message}"`,
  );
});

test("GET /api/health returns status ok and timestamp", async () => {
  const app = createApp({ enableRequestLogging: false });
  const res = await invokeRoute(app, "GET", "/api/health", {});

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.status, "ok");
  assert.ok(res.body.timestamp, "Health response must include a timestamp");
  // Timestamp must be a valid ISO 8601 date
  assert.ok(
    !isNaN(Date.parse(res.body.timestamp)),
    `Timestamp must be a valid ISO date — got: "${res.body.timestamp}"`,
  );
});

test("geocoding User-Agent does not contain StrollerScout", async () => {
  // Read the geocoding source file as text and check for brand references.
  // This is a static analysis guard — cheaper than spinning up real HTTP.
  const { readFile } = await import("node:fs/promises");
  const { fileURLToPath } = await import("node:url");
  const path = await import("node:path");

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const geocodingPath = path.join(
    __dirname,
    "../../src/backend/services/geocoding.js",
  );

  const source = await readFile(geocodingPath, "utf8");
  assert.ok(
    !source.includes("StrollerScout"),
    "geocoding.js must not contain 'StrollerScout' in User-Agent or anywhere else",
  );
});

test("safetyLawResearch User-Agent does not contain StrollerScout", async () => {
  const { readFile } = await import("node:fs/promises");
  const { fileURLToPath } = await import("node:url");
  const path = await import("node:path");

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const filePath = path.join(
    __dirname,
    "../../src/backend/services/safetyLawResearch.js",
  );

  const source = await readFile(filePath, "utf8");
  assert.ok(
    !source.includes("StrollerScout"),
    "safetyLawResearch.js must not contain 'StrollerScout'",
  );
});
