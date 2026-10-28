import test from "node:test";
import assert from "node:assert/strict";
import { createAttractionMemoryService } from "../../src/backend/services/attractionMemory.js";

const NOW = Date.now();
const daysAgo = (d) => new Date(NOW - d * 86400000).toISOString();
const SEATTLE = { id: "city-sea", city_name: "Seattle", display_name: "Seattle, Washington", country_code: "US", region_code: "WA", lat: 47.6062, lon: -122.3321 };
const COORDS = { displayName: "Seattle, Washington", regionCode: "WA", countryCode: "US", lat: 47.6062, lon: -122.3321 };

let seq = 0;
const row = (name, over = {}) => ({
  id: `a${++seq}`, city_id: "city-sea", canonical_name: name, category: "landmark", short_summary: "", status: "active",
  google_place_id: `place-${name}`, lat: 47.6, lon: -122.3, rating: 4.5, rating_count: 1000, verification_status: "verified",
  source_type: "places", kid_appeal_score: 7, parent_appeal_score: 7, confidence_score: 0.8, trend_score: 0, trend_updated_at: null, ...over,
});

function fakeAdmin(state) {
  function query(table) {
    const filters = [];
    const api = {
      select() { return api; },
      eq(c, v) { filters.push((r) => r[c] === v); return api; },
      neq(c, v) { filters.push((r) => r[c] !== v); return api; },
      not(c, op, v) { filters.push((r) => (op === "is" && v === null ? r[c] != null : true)); return api; },
      in(c, vs) { filters.push((r) => vs.includes(r[c])); return api; },
      ilike(c, v) { const n = String(v).replace(/%/g, "").toLowerCase(); filters.push((r) => String(r[c] || "").toLowerCase() === n); return api; },
      order() { return api; },
      limit() { return api; },
      then(resolve, reject) {
        const source = table === "cities" ? state.cities : table === "city_attractions" ? state.attractions : state.verification || [];
        return Promise.resolve({ data: source.filter((r) => filters.every((f) => f(r))), error: null }).then(resolve, reject);
      },
    };
    return api;
  }
  return { from: (table) => query(table) };
}

function service(state, fillCity) {
  return createAttractionMemoryService({ getAdmin: () => fakeAdmin(state), resolvePlaceIdentity: async () => null, fillCity, logger: { info() {}, warn() {} } });
}
const ask = (svc, over = {}) => svc.getPlanningCandidates({ destination: "Seattle, WA", coords: COORDS, countryCode: "US", childrenAges: [5], maxResults: 8, ...over });
const noFill = async () => { throw new Error("fill should not run"); };

test("only grounded, active rows reach the planner: closed, unmatched and model-written rows are left out", async () => {
  const state = { cities: [SEATTLE], attractions: [
    row("Seattle Aquarium"), row("Pike Place Market"), row("Woodland Park Zoo"), row("Space Needle"),
    row("Chihuly Garden and Glass"), row("Museum of Pop Culture"), row("Kerry Park"), row("Seattle Center"),
    row("Old Closed Museum", { status: "closed_unverified" }),
    row("Model Invention", { google_place_id: null, lat: null, source_type: "generated", verification_status: "unverified" }),
    row("Closed For Good", { business_status: "CLOSED_PERMANENTLY" }),
  ] };
  const names = (await ask(service(state, noFill))).map((r) => r.canonical_name);
  assert.ok(names.includes("Seattle Aquarium"));
  for (const bad of ["Old Closed Museum", "Model Invention", "Closed For Good"]) assert.ok(!names.includes(bad), `${bad} must not be planned`);
});

test("rows are ranked so heavily reviewed places come before barely reviewed ones", async () => {
  const state = { cities: [SEATTLE], attractions: [
    ...Array.from({ length: 9 }, (_, i) => row(`Filler ${i}`, { rating_count: 300 })),
    row("Tiny Gallery", { rating_count: 120, rating: 4.1 }), row("Pike Place Market", { rating_count: 90000, rating: 4.7 }),
  ] };
  const names = (await ask(service(state, noFill), { maxResults: 4 })).map((r) => r.canonical_name);
  assert.ok(names.includes("Pike Place Market"));
  assert.ok(!names.includes("Tiny Gallery"));
});

test("a trending venue is included even when evergreen places outrank it", async () => {
  const state = { cities: [SEATTLE], attractions: [
    ...Array.from({ length: 12 }, (_, i) => row(`Evergreen ${i}`, { rating_count: 5000 + i })),
    row("Hot New Dessert Museum", { rating_count: 150, trend_score: 80, trend_updated_at: daysAgo(2) }),
  ] };
  const names = (await ask(service(state, noFill), { maxResults: 6 })).map((r) => r.canonical_name);
  assert.ok(names.includes("Hot New Dessert Museum"));
  assert.equal(names.length, 6);
});

test("formal fine dining is not offered to a family with a child under 8", async () => {
  const state = { cities: [SEATTLE], attractions: [
    ...Array.from({ length: 12 }, (_, i) => row(`Place ${i}`)),
    row("Tasting Room", { rating_count: 99999, family_fit_json: { fineDining: true } }),
  ] };
  const young = (await ask(service(state, noFill), { childrenAges: [4], maxResults: 12 })).map((r) => r.canonical_name);
  assert.ok(!young.includes("Tasting Room"));
  const older = (await ask(service(state, noFill), { childrenAges: [11], maxResults: 13 })).map((r) => r.canonical_name);
  assert.ok(older.includes("Tasting Room"));
});

test("a city with no grounded rows is filled from Google Places once, then planned from the new rows", async () => {
  const state = { cities: [SEATTLE], attractions: [row("Model Invention", { google_place_id: null, lat: null, source_type: "generated" })] };
  let fills = 0;
  const fillCity = async ({ city }) => {
    fills += 1;
    assert.equal(city.id, "city-sea");
    for (let i = 0; i < 14; i += 1) state.attractions.push(row(`Filled Place ${i}`));
    return { status: "filled", inserted: 14 };
  };
  const svc = service(state, fillCity);
  const first = (await ask(svc)).map((r) => r.canonical_name);
  assert.equal(fills, 1);
  assert.ok(first.every((n) => n.startsWith("Filled Place")));
  await ask(svc);
  assert.equal(fills, 1, "a city already filled from Places is not filled again");
});

test("a failed fill is not retried on every request and does not break planning", async () => {
  const state = { cities: [SEATTLE], attractions: [] };
  let fills = 0;
  const svc = service(state, async () => { fills += 1; return { status: "error", inserted: 0, reason: "places_http_429" }; });
  assert.deepEqual(await ask(svc), []);
  assert.deepEqual(await ask(svc), []);
  assert.equal(fills, 1);
});

test("an unknown city with coordinates is created and filled", async () => {
  const state = { cities: [], attractions: [] };
  let filled;
  const fillCity = async ({ admin, city }) => { filled = city; return { status: "filled", inserted: 0 }; };
  const svc = createAttractionMemoryService({
    getAdmin: () => {
      const admin = fakeAdmin(state);
      const from = admin.from;
      admin.from = (table) => {
        const q = from(table);
        if (table === "cities") q.insert = (payload) => { state.cities.push({ id: "city-new", ...payload }); return { select: () => ({ limit: async () => ({ data: [state.cities.at(-1)], error: null }) }) }; };
        return q;
      };
      return admin;
    },
    resolvePlaceIdentity: async () => null, fillCity, logger: { info() {}, warn() {} },
  });
  await svc.getPlanningCandidates({ destination: "Bellingham, WA", coords: { displayName: "Bellingham, Washington", regionCode: "WA", countryCode: "US", lat: 48.75, lon: -122.48 }, countryCode: "US", maxResults: 8 });
  assert.equal(filled.id, "city-new");
  assert.equal(filled.lat, 48.75);
});

test("a broad region such as Hawaii is never filled as if it were a city", async () => {
  const state = { cities: [{ ...SEATTLE, id: "hi", city_name: "Hawaii", display_name: "Hawaii, United States", region_code: "HI" }], attractions: [] };
  const result = await service(state, noFill).getPlanningCandidates({
    destination: "Hawaii, USA", coords: { displayName: "Hawaii, United States", stateName: "Hawaii", regionCode: "HI", countryCode: "US", lat: 20.8, lon: -156.5 }, countryCode: "US", maxResults: 8,
  });
  assert.deepEqual(result, []);
});

test("activities that came from the database are not written back as model-generated rows", async () => {
  let adminCalls = 0;
  const svc = createAttractionMemoryService({ getAdmin: () => { adminCalls += 1; return fakeAdmin({ cities: [SEATTLE], attractions: [] }); }, resolvePlaceIdentity: async () => null, logger: { info() {}, warn() {} } });
  await svc.persistTripAttractions({ destination: "Seattle, WA", coords: COORDS, countryCode: "US", tripPlan: { suggestedActivities: [{ name: "Space Needle", grounded: true }] } });
  assert.equal(adminCalls, 0);
});
