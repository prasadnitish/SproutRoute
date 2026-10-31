import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { readFileSync } from "node:fs";
import { createApp } from "../../src/backend/server.js";

// The web app used to fall back to an IP lookup when the browser's location prompt was declined. That sent
// the visitor's IP address to a third party (ipapi.co) with no consent step, and trusted a caller-supplied
// X-Forwarded-For. Location now comes only from the browser, after the visitor allows it.

test("the web app never calls the IP geolocation route", () => {
  assert.doesNotMatch(readFileSync("src/frontend/src/hooks/useGeolocation.js", "utf8"), /geo\/detect/);
});

test("the backend no longer sends visitor addresses to ipapi.co", () => {
  assert.doesNotMatch(readFileSync("src/backend/server.js", "utf8"), /ipapi\.co/);
});

test("GET /api/v1/geo/detect no longer exists", async () => {
  const server = http.createServer(createApp({ enableRequestLogging: false }));
  await new Promise((resolve) => server.listen(0, resolve));
  try {
    const res = await fetch(`http://127.0.0.1:${server.address().port}/api/v1/geo/detect`);
    assert.equal(res.status, 404);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
