import test from "node:test";
import assert from "node:assert/strict";
import { deriveCityIdentity } from "../../src/backend/services/attractionMemory.js";

test("a geocoder hit on a building does not name the city", () => {
  const id = deriveCityIdentity("Diu, India", { displayName: "Government Hospital, Diu, Bunder Road, Zampa Gate, Diu, 362520, India" });
  assert.equal(id.cityName, "Diu");
  assert.equal(id.displayName, "Diu, India");
});

test("the geocoder's fuller label is kept when it is the same place", () => {
  const id = deriveCityIdentity("Saputara", { displayName: "Saputara, Ahava Taluka, Dang, Gujarat, 394720, India" });
  assert.equal(id.cityName, "Saputara");
  assert.equal(id.displayName, "Saputara, Ahava Taluka, Dang, Gujarat, 394720, India");
});

test("an empty geocoder label does not produce a blank display name", () => {
  assert.deepEqual(deriveCityIdentity("Kyoto, Japan", { displayName: ", ," }), { cityName: "Kyoto", displayName: "Kyoto, Japan" });
});
