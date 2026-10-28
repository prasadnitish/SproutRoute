import test from "node:test";
import assert from "node:assert/strict";
import { CASES, stepsFor } from "../../scripts/eval-cases.mjs";

const byId = (id) => CASES.find((c) => c.id === id);
const paths = (id, client) => stepsFor(byId(id), client).map((s) => s.path);

test("a parse case is one parse call on both clients", () => {
  for (const client of ["web", "ios"]) assert.deepEqual(paths("parse-vegas-explicit", client), ["/api/v1/trip/parse-input"]);
});

test("the web run follows the web app: stream, packing, then car seat and pet checks when the family needs them", () => {
  assert.deepEqual(paths("trip-san-diego-dog", "web"), [
    "/api/v1/trip/stream", "/api/v1/trip/packing", "/api/v1/safety/car-seat-check", "/api/v1/safety/pet-travel-check",
  ]);
  assert.deepEqual(paths("trip-tokyo-five-day", "web"), ["/api/v1/trip/stream", "/api/v1/trip/packing", "/api/v1/safety/car-seat-check"]);
});

test("the ios run follows the iOS app: stream and the pet check only, never bundle, packing or car seat", () => {
  assert.deepEqual(paths("trip-san-diego-dog", "ios"), ["/api/v1/trip/stream", "/api/v1/safety/pet-travel-check"]);
  assert.deepEqual(paths("trip-vegas-family", "ios"), ["/api/v1/trip/stream"]);
  for (const c of CASES) for (const path of paths(c.id, "ios")) assert.ok(!/bundle|packing|car-seat/.test(path), `${c.id}: ${path}`);
});

test("every step carries its name and a body the backend accepts", () => {
  const steps = stepsFor(byId("trip-london-car-seat"), "web");
  assert.deepEqual(steps.map((s) => s.step), ["stream", "packing", "car-seat"]);
  const carSeat = steps[2].body;
  assert.equal(carSeat.destination, "London, United Kingdom");
  assert.equal(carSeat.countryCode, "GB");
  assert.deepEqual(carSeat.children, [{ age: 4 }]);
  assert.match(carSeat.tripDate, /^\d{4}-\d{2}-\d{2}$/);
  const pet = stepsFor(byId("trip-san-diego-dog"), "web").at(-1).body;
  assert.equal(pet.pets[0].type, "dog");
  assert.equal(pet.travelMode, "car");
  assert.equal(pet.countryCode, "US");
  assert.equal(steps[0].body.client, "web");
  assert.equal(stepsFor(byId("trip-london-car-seat"), "ios")[0].body.client, "ios");
});

test("case ids are unique and every case names its rubric lines", () => {
  assert.equal(new Set(CASES.map((c) => c.id)).size, CASES.length);
  for (const c of CASES) assert.ok(c.rubric.length > 0, c.id);
});
