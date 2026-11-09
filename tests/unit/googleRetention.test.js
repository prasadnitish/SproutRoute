import test from "node:test";
import assert from "node:assert/strict";
import { purgeExpiredGoogleContent } from "../../src/backend/services/googleRetention.js";
import { placeRowFields } from "../../src/backend/services/placesGrounding.js";

function recorder(counts) {
  const calls = [];
  const chain = (table, op, payload) => {
    const entry = { table, op, payload, filters: [] };
    calls.push(entry);
    const q = new Proxy({}, {
      get(_, key) {
        if (key === "then") return (resolve) => resolve({ error: null, count: counts[table] });
        return (...args) => { entry.filters.push([key, ...args]); return q; };
      },
    });
    return q;
  };
  return { calls, from: (table) => ({ update: (p) => chain(table, "update", p), delete: () => chain(table, "delete") }) };
}

test("Google coordinates older than 30 days are cleared, Wikidata ones and place ids are kept", async () => {
  const admin = recorder({ city_attractions: 551, attraction_verification_cache: 1838 });
  const now = Date.parse("2026-11-09T00:00:00Z");
  const result = await purgeExpiredGoogleContent(admin, { now });

  const coords = admin.calls.find((c) => c.table === "city_attractions");
  assert.deepEqual(coords.payload, { lat: null, lon: null });
  assert.deepEqual(coords.filters.find((f) => f[0] === "is"), ["is", "wikidata_id", null]);
  assert.deepEqual(coords.filters.find((f) => f[0] === "lt"), ["lt", "last_verified_at", "2026-10-10T00:00:00.000Z"]);
  assert.equal(admin.calls.find((c) => c.table === "attraction_verification_cache").op, "delete");
  assert.deepEqual(result, { coordinatesCleared: 551, cacheRowsDeleted: 1838, cutoff: "2026-10-10T00:00:00.000Z" });
});

test("a refresh stores only the place id and coordinates from Google", () => {
  const place = { placeId: "p1", lat: 1, lon: 2, rating: 4.6, ratingCount: 9, priceLevel: 2, openingHours: {}, photoRef: "x", businessStatus: "OPERATIONAL", types: ["zoo"] };
  const fields = placeRowFields(place, { nowIso: "t" });
  for (const key of ["rating", "rating_count", "price_level", "opening_hours", "photo_ref", "business_status", "place_types"]) assert.ok(!(key in fields), key);
  assert.equal(fields.google_place_id, "p1");
  assert.equal(fields.lat, 1);
  assert.ok(!("lat" in placeRowFields(place, { nowIso: "t", keepCoords: true })));
});
