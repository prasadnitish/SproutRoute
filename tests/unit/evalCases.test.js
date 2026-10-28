import test from "node:test";
import assert from "node:assert/strict";
import { CASES, stepsFor } from "../../scripts/eval-cases.mjs";

const byId = (id) => CASES.find((c) => c.id === id);
const paths = (id, client) => stepsFor(byId(id), client).map((s) => s.path);

test("a parse case is one parse call on both clients", () => {
  for (const client of ["web", "ios"]) assert.deepEqual(paths("parse-vegas-explicit", client), ["/api/v1/trip/parse-input"]);
});

const flow = (packingPath) => [
  "/api/v1/trip/stream", packingPath, "/api/safety/travel-tips", "/api/safety/car-seat-check", "/api/v1/safety/pet-travel-check",
];

test("a trip runs the calls each app makes: stream, packing, travel tips, car seat for children and pet check for pets", () => {
  assert.deepEqual(paths("trip-san-diego-dog", "web"), flow("/api/generate"));
  assert.deepEqual(paths("trip-san-diego-dog", "ios"), flow("/api/v1/trip/packing"));
  for (const client of ["web", "ios"]) {
    assert.equal(paths("trip-tokyo-five-day", client).length, 4, "no pets, no pet check");
    assert.equal(paths("trip-vegas-family", client).length, 4);
  }
});

test("the web app packs through the legacy route, which has its own limiter; the iOS app uses the v1 route", () => {
  assert.equal(stepsFor(byId("trip-vegas-family"), "web")[1].path, "/api/generate");
  assert.equal(stepsFor(byId("trip-vegas-family"), "ios")[1].path, "/api/v1/trip/packing");
});

test("the bundle endpoint is only the iOS fallback when streaming fails, so no case uses it", () => {
  for (const c of CASES) for (const client of ["web", "ios"]) for (const path of paths(c.id, client)) assert.ok(!/bundle/.test(path), `${c.id}: ${path}`);
});

test("every step carries its name and the body the apps send", () => {
  const steps = stepsFor(byId("trip-london-car-seat"), "web");
  assert.deepEqual(steps.map((s) => s.step), ["stream", "packing", "travel-tips", "car-seat"]);
  const tips = steps[2].body;
  assert.deepEqual(tips, { destination: "London, United Kingdom", childrenAges: [4], countryCode: "GB", client: "web", schemaVersion: "1" });
  const carSeat = steps[3].body;
  assert.equal(carSeat.destination, "London, United Kingdom");
  assert.deepEqual(carSeat.children, [{ age: 4 }]);
  assert.match(carSeat.tripDate, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(steps[0].body.client, "web");
  assert.equal(stepsFor(byId("trip-london-car-seat"), "ios")[0].body.client, "ios");
});

test("the pet check uses the travel modes the backend accepts: drive at home, fly abroad", () => {
  assert.equal(stepsFor(byId("trip-san-diego-dog"), "ios").at(-1).body.travelMode, "drive");
  const abroad = { ...byId("trip-san-diego-dog"), countryCode: "GB" };
  assert.equal(stepsFor(abroad, "ios").at(-1).body.travelMode, "fly");
  assert.equal(stepsFor(abroad, "ios").at(-1).body.pets[0].type, "dog");
});

test("case ids are unique and every case names its rubric lines", () => {
  assert.equal(new Set(CASES.map((c) => c.id)).size, CASES.length);
  for (const c of CASES) assert.ok(c.rubric.length > 0, c.id);
});
