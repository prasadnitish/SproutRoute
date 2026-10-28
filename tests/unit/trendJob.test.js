import test from "node:test";
import assert from "node:assert/strict";
import { runTrendJob } from "../../src/backend/services/trend/trendJob.js";

const NOW = Date.parse("2026-10-28T12:00:00Z");
const hoursAgo = (h) => new Date(NOW - h * 3600000).toISOString();
const daysAgo = (d) => new Date(NOW - d * 86400000).toISOString();
const CITY = { id: "city-1", city_name: "Seattle", display_name: "Seattle, Washington", lat: 47.6062, lon: -122.3321 };

// ── A small in-memory stand-in for the Supabase client: just the calls the job makes. ──
function fakeAdmin(tables) {
  let ids = 0;
  const rows = (name) => (tables[name] ||= []);
  function builder(name) {
    const filters = [];
    let patch = null;
    let wantRows = false;
    let limitN = Infinity;
    const run = () => {
      const hit = rows(name).filter((r) => filters.every((f) => f(r)));
      if (patch) { hit.forEach((r) => Object.assign(r, patch)); return { data: wantRows ? hit : null, error: null }; }
      return { data: hit.slice(0, limitN), error: null };
    };
    const api = {
      select() { wantRows = true; return api; },
      eq(c, v) { filters.push((r) => r[c] === v); return api; },
      in(c, vs) { filters.push((r) => vs.includes(r[c])); return api; },
      gte(c, v) { filters.push((r) => r[c] >= v); return api; },
      gt(c, v) { filters.push((r) => r[c] > v); return api; },
      not(c, op, v) { filters.push((r) => (op === "is" && v === null ? r[c] != null : true)); return api; },
      order() { return api; },
      limit(n) { limitN = n; return api; },
      update(p) { patch = p; return api; },
      insert(input) {
        const list = (Array.isArray(input) ? input : [input]).map((r) => ({ id: `${name}-${++ids}`, ...r }));
        if (name === "city_attractions") for (const r of list) {
          if (r.google_place_id && rows(name).some((x) => x.city_id === r.city_id && x.google_place_id === r.google_place_id)) {
            return Promise.resolve({ data: null, error: { code: "23505", message: "duplicate" } });
          }
        }
        rows(name).push(...list);
        const result = { data: list, error: null };
        return Object.assign(Promise.resolve(result), { select: () => Promise.resolve(result) });
      },
      upsert(input, { onConflict }) {
        for (const r of Array.isArray(input) ? input : [input]) {
          const hit = rows(name).find((x) => x[onConflict] === r[onConflict]);
          if (hit) Object.assign(hit, r); else rows(name).push({ id: `${name}-${++ids}`, ...r });
        }
        return Promise.resolve({ data: null, error: null });
      },
      then(resolve, reject) { return Promise.resolve(run()).then(resolve, reject); },
    };
    return api;
  }
  return { from: builder, tables };
}

const post = (id, over = {}) => ({ url: `https://www.instagram.com/p/${id}/`, timestamp: hoursAgo(10), likes: 200, comments: 10, views: null, author: `user_${id}`, location_id: "L1", location_name: "Seattle Aquarium", caption: "Fun day with the kids", ...over });

function setup({ posts = [post("a"), post("b"), post("c")], tables = {}, classify, resolve } = {}) {
  const admin = fakeAdmin({
    cities: [CITY],
    city_seeds: [{ id: "seed-1", city_id: "city-1", kind: "location", value: "L1", label: "Seattle Aquarium", active: true }],
    city_attractions: [], trend_posts: [], refresh_log: [], ...tables,
  });
  const calls = { fetch: 0, classify: 0, resolve: 0 };
  const provider = {
    name: "fake",
    fetchLocationPosts: async () => { calls.fetch += 1; return posts; },
    fetchHashtagPosts: async () => { calls.fetch += 1; return posts; },
  };
  const classifier = {
    classifyVenues: async ({ venues }) => { calls.classify += 1; return classify ? classify(venues) : new Map(venues.map((v) => [v.key, { familyVisitable: true, name: v.name }])); },
    extractVenues: async ({ captions }) => captions.map((c) => ({ id: c.id, venue: null })),
  };
  const resolveVenue = async (target) => {
    calls.resolve += 1;
    if (resolve) return resolve(target);
    return { status: "matched", place: { placeId: "place-aq", name: "Seattle Aquarium", lat: 47.607, lon: -122.343, rating: 4.6, ratingCount: 20000, priceLevel: null, openingHours: null, photoRef: "places/place-aq/photos/p", businessStatus: "OPERATIONAL", types: ["aquarium"], primaryType: "aquarium" } };
  };
  const run = (over = {}) => runTrendJob({ admin, provider, classifier, resolveVenue, now: NOW, apply: true, authorSalt: "test-salt", ...over });
  return { admin, calls, run };
}

test("a family-friendly venue seen in recent posts becomes a trending attraction with a score", async () => {
  const { admin, run } = setup();
  const summary = await run();
  const [attraction] = admin.tables.city_attractions;
  assert.equal(attraction.canonical_name, "Seattle Aquarium");
  assert.equal(attraction.source_type, "trending");
  assert.equal(attraction.google_place_id, "place-aq");
  assert.equal(attraction.status, "active");
  assert.ok(attraction.trend_score > 0);
  assert.equal(attraction.trend_updated_at, new Date(NOW).toISOString());
  assert.equal(summary.inserted, 1);
  assert.equal(summary.postsStored, 3);
  assert.ok(admin.tables.refresh_log.some((l) => l.change_type === "trend_added" && l.attraction_id === attraction.id));
});

test("stored posts hold counts, time and a hashed author, never the handle or the caption", async () => {
  const { admin, run } = setup();
  await run();
  for (const stored of admin.tables.trend_posts) {
    const text = JSON.stringify(stored);
    assert.ok(!text.includes("user_a") && !text.includes("Fun day"), "no handle or caption");
    assert.match(stored.author_hash, /^[0-9a-f]{32}$/);
    assert.equal(stored.venue_key, "loc:L1");
  }
  const hashes = new Set(admin.tables.trend_posts.map((p) => p.author_hash));
  assert.equal(hashes.size, 3, "different authors hash differently");
});

test("a venue already in the table is linked by place id, not duplicated", async () => {
  const existing = { id: "attr-1", city_id: "city-1", canonical_name: "Seattle Aquarium", google_place_id: "place-aq", status: "active", trend_score: 0, trend_updated_at: null, source_type: "places" };
  const { admin, run } = setup({ tables: { city_attractions: [existing] } });
  const summary = await run();
  assert.equal(admin.tables.city_attractions.length, 1);
  assert.equal(summary.inserted, 0);
  assert.equal(summary.linked, 1);
  assert.ok(admin.tables.city_attractions[0].trend_score > 0);
  assert.ok(admin.tables.trend_posts.every((p) => p.attraction_id === "attr-1"));
});

test("venues the classifier rejects are dropped with their posts", async () => {
  const { admin, run } = setup({ classify: (venues) => new Map(venues.map((v) => [v.key, { familyVisitable: false, name: v.name }])) });
  const summary = await run();
  assert.equal(admin.tables.city_attractions.length, 0);
  assert.equal(admin.tables.trend_posts.length, 0);
  assert.equal(summary.droppedNotFamily, 1);
});

test("giveaways, ads and real estate posts are dropped before scoring", async () => {
  const posts = [post("a"), post("b", { caption: "GIVEAWAY! tag 3 friends to win" }), post("c", { caption: "Cute day #ad #sponsored" }), post("d", { caption: "Just listed! Open house this Sunday" })];
  const { admin, run } = setup({ posts });
  const summary = await run();
  assert.equal(admin.tables.trend_posts.length, 1);
  assert.equal(summary.droppedPromo, 3);
});

test("a place Google cannot match or reports closed is not added", async () => {
  for (const resolve of [() => ({ status: "unmatched", reason: "no_results" }), () => ({ status: "matched", place: { placeId: "x", name: "Old Place", businessStatus: "CLOSED_PERMANENTLY", types: [] } })]) {
    const { admin, run } = setup({ resolve });
    const summary = await run();
    assert.equal(admin.tables.city_attractions.length, 0);
    assert.equal(summary.droppedNoPlace, 1);
  }
});

test("running twice with the same data changes nothing: no duplicate rows, posts or log entries, same scores", async () => {
  const { admin, calls, run } = setup();
  await run();
  const snapshot = JSON.stringify(admin.tables);
  const first = { resolve: calls.resolve, classify: calls.classify };
  const summary = await run();
  assert.equal(JSON.stringify(admin.tables), snapshot);
  assert.equal(summary.inserted, 0);
  assert.equal(calls.resolve, first.resolve, "a venue already mapped is not looked up in Google again");
  assert.equal(calls.classify, first.classify, "or classified again");
});

test("a venue with no new posts loses half its score each week and does not decay twice in one week", async () => {
  const attraction = { id: "attr-9", city_id: "city-1", canonical_name: "Old Hit", google_place_id: "p9", status: "active", trend_score: 80, trend_updated_at: daysAgo(15), source_type: "trending" };
  const { admin, run } = setup({ posts: [], tables: { city_attractions: [attraction] } });
  await run();
  assert.equal(admin.tables.city_attractions[0].trend_score, 20);
  assert.equal(admin.tables.city_attractions[0].trend_updated_at, daysAgo(1), "advanced by whole weeks, so it stops reading as trending");
  await run();
  assert.equal(admin.tables.city_attractions[0].trend_score, 20);
});

test("a decayed score below 1 becomes zero", async () => {
  const attraction = { id: "attr-9", city_id: "city-1", canonical_name: "Faded", google_place_id: "p9", status: "active", trend_score: 3, trend_updated_at: daysAgo(15), source_type: "trending" };
  const { admin, run } = setup({ posts: [], tables: { city_attractions: [attraction] } });
  await run();
  assert.equal(admin.tables.city_attractions[0].trend_score, 0);
});

test("a dry run reads and classifies but writes nothing", async () => {
  const { admin, run } = setup();
  const summary = await run({ apply: false });
  assert.equal(admin.tables.city_attractions.length, 0);
  assert.equal(admin.tables.trend_posts.length, 0);
  assert.equal(admin.tables.refresh_log.length, 0);
  assert.equal(summary.applied, false);
  assert.equal(summary.inserted, 1, "reports what an apply would add");
});

test("a provider failure for a city is reported and does not decay that city's existing scores", async () => {
  const attraction = { id: "attr-9", city_id: "city-1", canonical_name: "Old Hit", google_place_id: "p9", status: "active", trend_score: 80, trend_updated_at: daysAgo(15), source_type: "trending" };
  const { admin, run } = setup({ tables: { city_attractions: [attraction] } });
  const summary = await run({ provider: { name: "down", fetchLocationPosts: async () => { throw new Error("HTTP 503"); }, fetchHashtagPosts: async () => [] } });
  assert.equal(summary.errors, 1);
  assert.equal(admin.tables.city_attractions[0].trend_score, 80);
});

test("posts with no location are matched to venues from their captions", async () => {
  const noLocation = [post("a", { location_id: null, location_name: null, caption: "Loved the Seattle Aquarium!" }), post("b", { location_id: null, location_name: null, caption: "aquarium day" })];
  const { admin, run } = setup({
    posts: noLocation,
    tables: { city_seeds: [{ id: "seed-2", city_id: "city-1", kind: "hashtag", value: "seattlewithkids", label: "", active: true }] },
  });
  const classifier = {
    classifyVenues: async ({ venues }) => new Map(venues.map((v) => [v.key, { familyVisitable: true, name: v.name }])),
    extractVenues: async ({ captions }) => captions.map((c) => ({ id: c.id, venue: /aquarium/i.test(c.text) ? "Seattle Aquarium" : null })),
  };
  const summary = await run({ classifier });
  assert.equal(admin.tables.city_attractions.length, 1);
  assert.ok(admin.tables.trend_posts.every((p) => p.venue_key === "name:seattleaquarium"));
  assert.equal(summary.postsStored, 2);
});

test("the same venue under two location ids is scored once, on one attraction", async () => {
  const posts = [post("a"), post("b", { location_id: "L2", location_name: "Seattle Aquarium (Pier 59)" })];
  const { admin, run } = setup({ posts });
  await run();
  assert.equal(admin.tables.city_attractions.length, 1);
  assert.equal(new Set(admin.tables.trend_posts.map((p) => p.attraction_id)).size, 1);
});

test("a busier week than the week before raises the score", async () => {
  const quietBefore = [{ id: "old1", city_id: "city-1", attraction_id: "attr-1", post_url: "https://i/old1", posted_at: daysAgo(9), likes: 1, comments: 0, views: null, author_hash: "x".repeat(32), venue_key: "loc:L1" }];
  const busyBefore = [{ ...quietBefore[0], likes: 50000 }];
  const attraction = () => ({ id: "attr-1", city_id: "city-1", canonical_name: "Seattle Aquarium", google_place_id: "place-aq", status: "active", trend_score: 0, trend_updated_at: null, source_type: "places" });
  const rising = setup({ tables: { city_attractions: [attraction()], trend_posts: quietBefore } });
  const falling = setup({ tables: { city_attractions: [attraction()], trend_posts: busyBefore } });
  await rising.run(); await falling.run();
  assert.ok(rising.admin.tables.city_attractions[0].trend_score > falling.admin.tables.city_attractions[0].trend_score);
});
