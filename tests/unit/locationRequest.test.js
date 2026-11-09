import test from "node:test";
import assert from "node:assert/strict";
import { requestBrowserLocation } from "../../src/frontend/src/utils/locationRequest.js";

// Location comes only from the browser, and only after the visitor allows it. This wraps the browser call
// so the screen can show what happened: found, blocked, failed, or not supported.

const fix = (lat, lon) => ({ coords: { latitude: lat, longitude: lon } });
const geolocation = (behavior) => ({ getCurrentPosition: (ok, fail, options) => behavior(ok, fail, options) });

test("a position is returned as lat, lon and a gps source", async () => {
  const result = await requestBrowserLocation(geolocation((ok) => ok(fix(47.6, -122.3))));
  assert.deepEqual(result, { status: "granted", location: { lat: 47.6, lon: -122.3, source: "gps" } });
});

test("a refused or dismissed prompt is reported as denied", async () => {
  const result = await requestBrowserLocation(geolocation((_ok, fail) => fail({ code: 1 })));
  assert.deepEqual(result, { status: "denied" });
});

test("an unavailable position or a timeout is reported as an error, not as denied", async () => {
  for (const code of [2, 3]) {
    const result = await requestBrowserLocation(geolocation((_ok, fail) => fail({ code })));
    assert.deepEqual(result, { status: "error" }, `code ${code}`);
  }
});

test("a browser without geolocation is reported as unavailable", async () => {
  assert.deepEqual(await requestBrowserLocation(undefined), { status: "unavailable" });
});

test("a browser that throws from getCurrentPosition is reported as an error", async () => {
  const result = await requestBrowserLocation(geolocation(() => { throw new Error("insecure origin"); }));
  assert.deepEqual(result, { status: "error" });
});

test("the timeout is passed through and a cached position may be reused", async () => {
  let seen;
  await requestBrowserLocation(geolocation((ok, _fail, options) => { seen = options; ok(fix(1, 2)); }), { timeoutMs: 9000 });
  assert.equal(seen.timeout, 9000);
  assert.equal(seen.maximumAge, 300000);
});

test("a position with non-numeric coordinates is not trusted", async () => {
  const result = await requestBrowserLocation(geolocation((ok) => ok({ coords: { latitude: "x", longitude: null } })));
  assert.deepEqual(result, { status: "error" });
});
