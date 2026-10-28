import test from "node:test";
import assert from "node:assert/strict";
import { fillCityFromPlaces } from "../../src/backend/services/placesFill.js";

const CITY = { id: "city-1", city_name: "Seattle", display_name: "Seattle, Washington", lat: 47.6062, lon: -122.3321 };
const NOW = "2026-10-28T12:00:00.000Z";

const place = (id, name, over = {}) => ({
  id, displayName: { text: name }, location: { latitude: 47.61, longitude: -122.34 },
  rating: 4.6, userRatingCount: 5000, businessStatus: "OPERATIONAL", primaryType: "tourist_attraction",
  types: ["tourist_attraction", "point_of_interest"], photos: [{ name: `places/${id}/photos/p` }],
  regularOpeningHours: { weekdayDescriptions: ["Monday: 9:00 AM – 5:00 PM"], periods: [] }, ...over,
});

function fetchReturning(...pages) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) });
    const places = pages[Math.min(calls.length - 1, pages.length - 1)];
    return { ok: true, status: 200, json: async () => ({ places }) };
  };
  fn.calls = calls;
  return fn;
}

// Models the (city_id, canonical_name) unique index from migration 018: a batch containing a taken name fails whole.
function fakeAdmin({ existing = [], insertError = null, conflictNames = [] } = {}) {
  const inserted = [];
  const updated = [];
  const stored = existing.map((e, i) => (typeof e === "string" ? { id: `old-${i}`, google_place_id: e, canonical_name: `Old ${e}` } : e));
  const taken = (row) => conflictNames.includes(row.canonical_name) || stored.some((e) => e.canonical_name === row.canonical_name) || inserted.some((e) => e.canonical_name === row.canonical_name);
  return {
    inserted,
    updated,
    from(table) {
      assert.equal(table, "city_attractions");
      return {
        select() { return { eq: async () => ({ data: stored, error: null }) }; },
        insert: async (input) => {
          const rows = Array.isArray(input) ? input : [input];
          if (insertError) return { error: insertError };
          if (rows.some(taken)) return { error: { code: "23505", message: "duplicate key value violates unique constraint" } };
          inserted.push(...rows);
          return { error: null };
        },
        update(patch) { return { eq: async (column, value) => { updated.push({ [column]: value, patch }); return { error: null }; } }; },
      };
    },
  };
}

test("good family places are stored as grounded rows from Google", async () => {
  const admin = fakeAdmin();
  const fetchFn = fetchReturning([place("p1", "Seattle Aquarium", { primaryType: "aquarium", types: ["aquarium", "tourist_attraction"] })]);
  const result = await fillCityFromPlaces({ admin, city: CITY, fetchFn, apiKey: "k", now: NOW });
  assert.equal(result.status, "filled");
  assert.equal(result.inserted, 1);
  const [row] = admin.inserted;
  assert.equal(row.city_id, "city-1");
  assert.equal(row.canonical_name, "Seattle Aquarium");
  assert.equal(row.google_place_id, "p1");
  assert.equal(row.source_type, "places");
  assert.equal(row.verification_status, "verified");
  assert.equal(row.status, "active");
  assert.equal(row.rating, 4.6);
  assert.equal(row.rating_count, 5000);
  assert.equal(row.category, "wildlife");
  assert.equal(row.photo_ref, "places/p1/photos/p");
  assert.equal(row.last_verified_at, NOW);
  assert.equal(row.family_fit_json, undefined, "family fit is judged later by the refresh job");
});

test("places that are closed, poorly reviewed, thinly reviewed, adult-only, lodging or far away are skipped", async () => {
  const admin = fakeAdmin();
  const fetchFn = fetchReturning([
    place("ok", "Good Park", { primaryType: "park" }),
    place("closed", "Closed Museum", { businessStatus: "CLOSED_PERMANENTLY" }),
    place("low", "Meh Spot", { rating: 3.4 }),
    place("thin", "Unknown Spot", { userRatingCount: 12 }),
    place("bar", "Rooftop Bar", { primaryType: "bar", types: ["bar"] }),
    place("casino", "Big Casino", { primaryType: "tourist_attraction", types: ["casino", "tourist_attraction"] }),
    place("hotel", "Grand Hotel", { primaryType: "hotel", types: ["hotel", "lodging"] }),
    place("diner", "Pancake Place", { primaryType: "restaurant", types: ["restaurant"] }),
    place("far", "Faraway Falls", { location: { latitude: 40.0, longitude: -105.0 } }),
  ]);
  const result = await fillCityFromPlaces({ admin, city: CITY, fetchFn, apiKey: "k", now: NOW });
  assert.deepEqual(admin.inserted.map((r) => r.google_place_id), ["ok"]);
  assert.equal(result.inserted, 1);
});

test("the same place found by several searches, or already stored for the city, is not inserted twice", async () => {
  const admin = fakeAdmin({ existing: ["p2"] });
  const fetchFn = fetchReturning([place("p1", "Space Needle"), place("p2", "Pike Place Market")], [place("p1", "Space Needle")]);
  const result = await fillCityFromPlaces({ admin, city: CITY, fetchFn, apiKey: "k", now: NOW });
  assert.deepEqual(admin.inserted.map((r) => r.google_place_id), ["p1"]);
  assert.equal(result.inserted, 1);
  assert.ok(fetchFn.calls.length >= 2, "more than one search phrase is used");
});

test("searches are phrased for families and biased toward the city", async () => {
  const fetchFn = fetchReturning([]);
  await fillCityFromPlaces({ admin: fakeAdmin(), city: CITY, fetchFn, apiKey: "k", now: NOW });
  assert.ok(fetchFn.calls.some((c) => /kids/i.test(c.body.textQuery) && /Seattle/.test(c.body.textQuery)));
  assert.equal(fetchFn.calls[0].body.locationBias.circle.center.latitude, 47.6062);
});

test("a Google failure writes nothing and says so", async () => {
  const admin = fakeAdmin();
  const fetchFn = async () => ({ ok: false, status: 429, json: async () => ({}) });
  const result = await fillCityFromPlaces({ admin, city: CITY, fetchFn, apiKey: "k", now: NOW });
  assert.equal(result.status, "error");
  assert.equal(result.inserted, 0);
  assert.equal(admin.inserted.length, 0);
});

test("without a Places key nothing is attempted", async () => {
  const result = await fillCityFromPlaces({ admin: fakeAdmin(), city: CITY, fetchFn: async () => { throw new Error("no calls expected"); }, apiKey: "", now: NOW });
  assert.equal(result.status, "no_api_key");
});

test("a concurrent fill that already inserted the rows is not an error", async () => {
  const admin = fakeAdmin({ insertError: { code: "23505", message: "duplicate key" } });
  const result = await fillCityFromPlaces({ admin, city: CITY, fetchFn: fetchReturning([place("p1", "Space Needle")]), apiKey: "k", now: NOW });
  assert.equal(result.status, "filled");
});

test("two requests for the same city share one fill", async () => {
  const admin = fakeAdmin();
  const fetchFn = fetchReturning([place("p1", "Space Needle")]);
  const [a, b] = await Promise.all([
    fillCityFromPlaces({ admin, city: CITY, fetchFn, apiKey: "k", now: NOW }),
    fillCityFromPlaces({ admin, city: CITY, fetchFn, apiKey: "k", now: NOW }),
  ]);
  assert.equal(a.status, "filled");
  assert.equal(b.status, "filled");
  assert.equal(admin.inserted.length, 1);
});

test("an older row with the same name and no place id is grounded in place instead of colliding on insert", async () => {
  const admin = fakeAdmin({ existing: [{ id: "old-1", google_place_id: null, canonical_name: "Space Needle" }] });
  const fetchFn = fetchReturning([place("p1", "Space Needle"), place("p2", "Pike Place Market")]);
  const result = await fillCityFromPlaces({ admin, city: CITY, fetchFn, apiKey: "k", now: NOW });
  assert.deepEqual(admin.inserted.map((r) => r.canonical_name), ["Pike Place Market"], "only the genuinely new place is inserted");
  assert.equal(admin.updated.length, 1);
  assert.equal(admin.updated[0].id, "old-1");
  assert.equal(admin.updated[0].patch.google_place_id, "p1");
  assert.equal(admin.updated[0].patch.rating, 4.6);
  assert.equal(admin.updated[0].patch.status, "active");
  assert.equal(result.status, "filled");
  assert.equal(result.inserted, 1);
  assert.equal(result.grounded, 1);
});

test("a same-named row that already belongs to a different place is left alone and does not block the rest", async () => {
  const admin = fakeAdmin({ existing: [{ id: "old-1", google_place_id: "other", canonical_name: "Space Needle" }] });
  const result = await fillCityFromPlaces({ admin, city: CITY, fetchFn: fetchReturning([place("p1", "Space Needle"), place("p2", "Pike Place Market")]), apiKey: "k", now: NOW });
  assert.deepEqual(admin.inserted.map((r) => r.canonical_name), ["Pike Place Market"]);
  assert.equal(admin.updated.length, 0);
  assert.equal(result.inserted, 1);
});

test("a name conflict the read did not predict only loses that row, not the whole batch", async () => {
  const admin = fakeAdmin({ conflictNames: ["Space Needle"] });
  const result = await fillCityFromPlaces({ admin, city: CITY, fetchFn: fetchReturning([place("p1", "Space Needle"), place("p2", "Pike Place Market"), place("p3", "Kerry Park")]), apiKey: "k", now: NOW });
  assert.deepEqual(admin.inserted.map((r) => r.canonical_name).sort(), ["Kerry Park", "Pike Place Market"]);
  assert.equal(result.inserted, 2);
});
