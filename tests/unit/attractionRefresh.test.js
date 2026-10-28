import test from "node:test";
import assert from "node:assert/strict";
import { refreshAttractions } from "../../src/backend/services/attractionRefresh.js";

const NOW = Date.parse("2026-10-28T12:00:00Z");
const day = (n) => new Date(NOW - n * 86400000).toISOString();

function row(over = {}) {
  return {
    id: "a1", canonical_name: "Seattle Aquarium", google_place_id: null, status: "active", rating: null,
    last_verified_at: null, family_fit_json: null,
    cities: { city_name: "Seattle", display_name: "Seattle, WA", lat: 47.6, lon: -122.3 },
    ...over,
  };
}

const place = (over = {}) => ({
  placeId: "p1", name: "Seattle Aquarium", lat: 47.6, lon: -122.34, rating: 4.6, ratingCount: 21000, priceLevel: 2,
  openingHours: { weekdayDescriptions: [], periods: [] }, photoRef: "places/p1/photos/x", businessStatus: "OPERATIONAL",
  types: ["aquarium"], primaryType: "aquarium", ...over,
});

const FIT = { kidAppeal: 9, parentAppeal: 7, ageBands: ["toddler"], indoorOutdoor: "indoor", strollerFriendly: true,
  typicalDurationMinutes: 120, category: "zoo_aquarium", fineDining: false, adultsOnly: false, bookingLikelyNeeded: false, reason: "ok" };

function fakeAdmin(rows, { failUpdateFor = new Set() } = {}) {
  const state = { rows: rows.map((r) => ({ ...r })), updates: [], logs: [], selects: [] };
  return {
    state,
    from(table) {
      if (table === "city_attractions") {
        return {
          select() {
            const q = { eq(col, value) { state.filter = { col, value }; return q; }, order() { return q; }, limit(n) { state.selects.push(n); return Promise.resolve({ data: [...state.rows].sort((a, b) => String(a.last_verified_at ?? "").localeCompare(String(b.last_verified_at ?? ""))).filter((r) => !state.filter || r[state.filter.col] === state.filter.value).slice(0, n), error: null }); } };
            return q;
          },
          update(fields) {
            return {
              eq(_col, id) {
                if (failUpdateFor.has(id) && fields.google_place_id) return Promise.resolve({ error: { code: "23505", message: "duplicate key" } });
                state.updates.push({ id, fields });
                Object.assign(state.rows.find((r) => r.id === id), fields);
                return Promise.resolve({ error: null });
              },
            };
          },
        };
      }
      return { insert(entries) { state.logs.push(...entries); return Promise.resolve({ error: null }); } };
    },
  };
}

const run = (admin, over = {}) => refreshAttractions({
  admin, now: () => NOW, runId: "run-1", limit: 50, withFit: false,
  resolveFn: async () => ({ status: "matched", place: place() }), ...over,
});

test("a matched row gets its Places facts, a verified timestamp and stays active", async () => {
  const admin = fakeAdmin([row()]);
  const summary = await run(admin, { apply: true });
  const fields = admin.state.updates[0].fields;
  assert.equal(fields.google_place_id, "p1");
  assert.equal(fields.rating, 4.6);
  assert.equal(fields.rating_count, 21000);
  assert.equal(fields.price_level, 2);
  assert.equal(fields.status, "active");
  assert.equal(fields.business_status, "OPERATIONAL");
  assert.equal(fields.verification_status, "verified");
  assert.equal(fields.last_verified_at, new Date(NOW).toISOString());
  assert.equal(summary.matched, 1);
});

test("an unmatched row becomes closed_unverified, is kept, and is logged", async () => {
  const admin = fakeAdmin([row({ google_place_id: "old" })]);
  const summary = await run(admin, { apply: true, resolveFn: async () => ({ status: "unmatched", reason: "not_found" }) });
  assert.equal(admin.state.updates[0].fields.status, "closed_unverified");
  assert.equal(admin.state.rows.length, 1);
  assert.equal(admin.state.logs[0].change_type, "unmatched");
  assert.equal(summary.unmatched, 1);
});

test("a permanently closed place is retired and logged as a closure", async () => {
  const admin = fakeAdmin([row({ google_place_id: "p1" })]);
  await run(admin, { apply: true, resolveFn: async () => ({ status: "matched", place: place({ businessStatus: "CLOSED_PERMANENTLY" }) }) });
  assert.equal(admin.state.updates[0].fields.status, "closed_unverified");
  assert.equal(admin.state.logs[0].change_type, "closed");
});

test("a request error leaves the row untouched and writes nothing", async () => {
  const admin = fakeAdmin([row({ google_place_id: "p1", rating: 4.5 })]);
  const summary = await run(admin, { apply: true, resolveFn: async () => ({ status: "error", reason: "http_429" }) });
  assert.equal(admin.state.updates.length, 0);
  assert.equal(admin.state.logs.length, 0);
  assert.equal(summary.errors, 1);
});

test("a rating that moves by more than 0.3 is logged, a smaller move is not", async () => {
  const big = fakeAdmin([row({ google_place_id: "p1", rating: 4.1 })]);
  await run(big, { apply: true });
  assert.deepEqual(big.state.logs.map((l) => l.change_type), ["rating_change"]);
  assert.deepEqual(big.state.logs[0].detail, { from: 4.1, to: 4.6 });

  const small = fakeAdmin([row({ google_place_id: "p1", rating: 4.4 })]);
  await run(small, { apply: true });
  assert.equal(small.state.logs.length, 0);
});

test("a closed row that comes back is reopened and logged", async () => {
  const admin = fakeAdmin([row({ google_place_id: "p1", status: "closed_unverified", rating: 4.6 })]);
  await run(admin, { apply: true });
  assert.equal(admin.state.updates[0].fields.status, "active");
  assert.equal(admin.state.logs[0].change_type, "reopened");
});

test("a first match is logged once and a second run logs nothing new", async () => {
  const admin = fakeAdmin([row()]);
  await run(admin, { apply: true });
  assert.deepEqual(admin.state.logs.map((l) => l.change_type), ["matched"]);
  await run(admin, { apply: true, runId: "run-2" });
  assert.deepEqual(admin.state.logs.map((l) => l.change_type), ["matched"]);
});

test("the stalest rows are taken first and the slice is limited", async () => {
  const admin = fakeAdmin([row({ id: "new", last_verified_at: day(1) }), row({ id: "never", last_verified_at: null }), row({ id: "old", last_verified_at: day(40) })]);
  const seen = [];
  await run(admin, { limit: 2, resolveFn: async (target) => { seen.push(target.name); return { status: "error" }; } });
  assert.deepEqual(admin.state.selects, [2]);
  assert.equal(seen.length, 2);
});

test("a dry run reads and resolves but writes nothing", async () => {
  const admin = fakeAdmin([row()]);
  const summary = await run(admin, { apply: false });
  assert.equal(admin.state.updates.length, 0);
  assert.equal(admin.state.logs.length, 0);
  assert.equal(summary.applied, false);
  assert.equal(summary.matched, 1);
});

test("two rows that resolve to the same place keep one and retire the duplicate", async () => {
  const admin = fakeAdmin([row({ id: "a1" }), row({ id: "a2", canonical_name: "Seattle Aquarium Visit" })], { failUpdateFor: new Set(["a2"]) });
  const summary = await run(admin, { apply: true });
  const duplicate = admin.state.updates.find((u) => u.id === "a2");
  assert.equal(duplicate.fields.status, "closed_unverified");
  assert.equal(duplicate.fields.google_place_id, undefined);
  assert.equal(summary.duplicates, 1);
});

test("family fit runs only for matched, active rows that have none, and fills the existing columns", async () => {
  const admin = fakeAdmin([row({ id: "fresh" }), row({ id: "done", family_fit_json: { version: "family-fit-v1" } }), row({ id: "gone" })]);
  const fitted = [];
  const summary = await run(admin, {
    apply: true, withFit: true,
    resolveFn: async (target) => (target.name === "Seattle Aquarium" ? { status: "matched", place: place({ placeId: `p-${fitted.length}-${Math.random()}` }) } : { status: "matched", place: place() }),
    fitFn: async (p) => { fitted.push(p.name); return { ok: true, fit: FIT }; },
  });
  assert.ok(summary.fitDone >= 1);
  const filled = admin.state.updates.find((u) => u.fields.kid_appeal_score === 9);
  assert.ok(filled);
  assert.equal(filled.fields.family_fit_json.version, "family-fit-v1");
});

test("a closed or unmatched row is never sent to Claude", async () => {
  const admin = fakeAdmin([row()]);
  let called = false;
  await run(admin, { apply: true, withFit: true, resolveFn: async () => ({ status: "unmatched", reason: "no_results" }), fitFn: async () => { called = true; return { ok: true, fit: FIT }; } });
  assert.equal(called, false);
});

test("a failed assessment is counted and does not block the Places update", async () => {
  const admin = fakeAdmin([row()]);
  const summary = await run(admin, { apply: true, withFit: true, fitFn: async () => ({ ok: false, error: "bad json" }) });
  assert.equal(summary.fitFailed, 1);
  assert.equal(admin.state.updates[0].fields.google_place_id, "p1");
});

test("broad regions get a wide distance limit so country-wide rows are not retired for being far apart", async () => {
  const admin = fakeAdmin([row({ cities: { city_name: "Japan", display_name: "Japan", lat: 36.5, lon: 139.2 } })]);
  let target;
  await run(admin, { resolveFn: async (t) => { target = t; return { status: "error" }; } });
  assert.ok(target.maxKm >= 500);
});

test("a refresh can be limited to one city", async () => {
  const admin = fakeAdmin([row({ id: "s1", city_id: "seattle" }), row({ id: "p1", city_id: "portland" })]);
  const seen = [];
  await run(admin, { cityId: "seattle", resolveFn: async () => { seen.push(1); return { status: "error" }; } });
  assert.equal(seen.length, 1);
  assert.deepEqual(admin.state.filter, { col: "city_id", value: "seattle" });
});

test("a corrected place id is written and the replacement is logged", async () => {
  const admin = fakeAdmin([row({ google_place_id: "wrong-city-id" })]);
  await run(admin, { apply: true, resolveFn: async () => ({ status: "matched", place: place({ placeId: "right-id" }) }) });
  assert.equal(admin.state.updates[0].fields.google_place_id, "right-id");
  assert.deepEqual(admin.state.logs.map((l) => l.change_type), ["matched"]);
  assert.deepEqual(admin.state.logs[0].detail, { placeId: "right-id", replacedPlaceId: "wrong-city-id" });
});
