import test from "node:test";
import assert from "node:assert/strict";
import { resolvePlace, statusForPlace } from "../../src/backend/services/placesGrounding.js";

const SEATTLE = { lat: 47.6062, lon: -122.3321 };

const PLACE = {
  id: "ChIJ-aquarium",
  displayName: { text: "Seattle Aquarium" },
  location: { latitude: 47.6076, longitude: -122.3429 },
  rating: 4.6,
  userRatingCount: 21000,
  priceLevel: "PRICE_LEVEL_MODERATE",
  businessStatus: "OPERATIONAL",
  types: ["aquarium", "tourist_attraction", "point_of_interest"],
  primaryType: "aquarium",
  photos: [{ name: "places/ChIJ-aquarium/photos/AUc7" }],
  regularOpeningHours: {
    weekdayDescriptions: ["Monday: 9:30 AM - 5:00 PM"],
    periods: [{ open: { day: 1, hour: 9, minute: 30 }, close: { day: 1, hour: 17, minute: 0 } }],
  },
};

const respond = (body, status = 200) => async () => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const options = (fetchFn) => ({ fetchFn, apiKey: "test-key" });

test("a name and city search returns the normalized place", async () => {
  const result = await resolvePlace({ name: "Seattle Aquarium", city: "Seattle, WA", cityLat: SEATTLE.lat, cityLon: SEATTLE.lon }, options(respond({ places: [PLACE] })));
  assert.equal(result.status, "matched");
  assert.deepEqual(
    { id: result.place.placeId, rating: result.place.rating, count: result.place.ratingCount, price: result.place.priceLevel, photo: result.place.photoRef, business: result.place.businessStatus },
    { id: "ChIJ-aquarium", rating: 4.6, count: 21000, price: 2, photo: "places/ChIJ-aquarium/photos/AUc7", business: "OPERATIONAL" },
  );
  assert.equal(result.place.lat, 47.6076);
  assert.deepEqual(result.place.types, ["aquarium", "tourist_attraction", "point_of_interest"]);
  assert.equal(result.place.openingHours.periods.length, 1);
});

test("the search is biased to the city and asks only for the fields we store", async () => {
  let seen;
  await resolvePlace({ name: "Seattle Aquarium", city: "Seattle, WA", cityLat: SEATTLE.lat, cityLon: SEATTLE.lon }, options(async (url, init) => {
    seen = { url, init, body: JSON.parse(init.body) };
    return { ok: true, status: 200, json: async () => ({ places: [PLACE] }) };
  }));
  assert.match(seen.url, /places:searchText$/);
  assert.equal(seen.init.headers["X-Goog-Api-Key"], "test-key");
  assert.match(seen.init.headers["X-Goog-FieldMask"], /places\.businessStatus/);
  assert.ok(!/photos\.name|reviews/.test(seen.init.headers["X-Goog-FieldMask"]));
  assert.equal(seen.body.locationBias.circle.center.latitude, SEATTLE.lat);
});

test("a known place id is fetched directly instead of searched", async () => {
  let seen;
  const result = await resolvePlace({ name: "Seattle Aquarium", city: "Seattle, WA", placeId: "ChIJ-aquarium" }, options(async (url, init) => {
    seen = { url, init };
    return { ok: true, status: 200, json: async () => PLACE };
  }));
  assert.match(seen.url, /places\/ChIJ-aquarium$/);
  assert.equal(seen.init.method ?? "GET", "GET");
  assert.ok(!seen.init.headers["X-Goog-FieldMask"].includes("places."));
  assert.equal(result.status, "matched");
});

test("a result whose name does not resemble the attraction is not a match", async () => {
  const other = { ...PLACE, id: "x", displayName: { text: "Joe's Bar and Grill" } };
  const result = await resolvePlace({ name: "Seattle Aquarium", city: "Seattle, WA" }, options(respond({ places: [other] })));
  assert.equal(result.status, "unmatched");
  assert.equal(result.reason, "no_close_name");
});

test("the best of several results is chosen by name, not by order", async () => {
  const wrongFirst = { ...PLACE, id: "wrong", displayName: { text: "Seattle Aquarium Gift Shop Parking" } };
  const result = await resolvePlace({ name: "Seattle Aquarium", city: "Seattle, WA" }, options(respond({ places: [wrongFirst, PLACE] })));
  assert.equal(result.place.placeId, "ChIJ-aquarium");
});

test("a result far from the city is rejected even when the name matches", async () => {
  const farAway = { ...PLACE, location: { latitude: 35.0, longitude: 139.0 } };
  const result = await resolvePlace({ name: "Seattle Aquarium", city: "Seattle, WA", cityLat: SEATTLE.lat, cityLon: SEATTLE.lon }, options(respond({ places: [farAway] })));
  assert.equal(result.status, "unmatched");
  assert.equal(result.reason, "too_far");
});

test("an empty search is unmatched", async () => {
  const result = await resolvePlace({ name: "Nowhere Land", city: "Seattle, WA" }, options(respond({})));
  assert.equal(result.status, "unmatched");
  assert.equal(result.reason, "no_results");
});

test("a place id Google no longer knows is unmatched", async () => {
  const result = await resolvePlace({ name: "Gone", city: "Seattle, WA", placeId: "old" }, options(respond({ error: { status: "NOT_FOUND" } }, 404)));
  assert.equal(result.status, "unmatched");
  assert.equal(result.reason, "not_found");
});

test("a server or quota error is an error, never an unmatched or closed place", async () => {
  for (const status of [429, 500, 403]) {
    const result = await resolvePlace({ name: "Seattle Aquarium", city: "Seattle, WA" }, options(respond({ error: { message: "nope" } }, status)));
    assert.equal(result.status, "error", `HTTP ${status}`);
  }
  const thrown = await resolvePlace({ name: "Seattle Aquarium", city: "Seattle, WA" }, options(async () => { throw new Error("socket hang up"); }));
  assert.equal(thrown.status, "error");
});

test("without an API key nothing is sent and the result is an error", async () => {
  let called = false;
  const result = await resolvePlace({ name: "Seattle Aquarium", city: "Seattle, WA" }, { fetchFn: async () => { called = true; }, apiKey: "" });
  assert.equal(result.status, "error");
  assert.equal(called, false);
});

test("statusForPlace keeps operational and temporarily closed places and retires the rest", () => {
  assert.equal(statusForPlace({ status: "matched", place: { businessStatus: "OPERATIONAL" } }), "active");
  assert.equal(statusForPlace({ status: "matched", place: { businessStatus: "CLOSED_TEMPORARILY" } }), "active");
  assert.equal(statusForPlace({ status: "matched", place: { businessStatus: null } }), "active");
  assert.equal(statusForPlace({ status: "matched", place: { businessStatus: "CLOSED_PERMANENTLY" } }), "closed_unverified");
  assert.equal(statusForPlace({ status: "unmatched", reason: "no_results" }), "closed_unverified");
  assert.equal(statusForPlace({ status: "error" }), null);
});
