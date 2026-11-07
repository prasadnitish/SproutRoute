import test from "node:test";
import assert from "node:assert/strict";
import { createTrendProvider, TrendProviderUnsupported } from "../../src/backend/services/trend/index.js";
import { createApifyProvider } from "../../src/backend/services/trend/apify.js";
import { createHikerApiProvider } from "../../src/backend/services/trend/hikerapi.js";

const NOW = Date.parse("2026-10-28T12:00:00Z");

const ok = (body) => async () => ({ ok: true, status: 200, json: async () => body });

// Output shape taken from the Apify actor page for apidojo/instagram-location-scraper-api.
const APIFY_ITEM = {
  createdAt: "2026-10-27T18:30:00.000Z",
  likeCount: 120,
  commentCount: 8,
  code: "Cabc123",
  url: "https://www.instagram.com/p/Cabc123/",
  caption: "Best day at the aquarium with the kids!",
  owner: { id: "42", username: "seattle_mom" },
  location: { id: "213131048", name: "Seattle Aquarium", lat: 47.607, lng: -122.343 },
};

test("every provider normalizes to the same post shape", async () => {
  const provider = createApifyProvider({ token: "t", fetchFn: ok([APIFY_ITEM]) });
  const [post] = await provider.fetchLocationPosts({ locationId: "213131048" });
  assert.deepEqual(Object.keys(post).sort(), ["author", "caption", "comments", "likes", "location_id", "location_name", "timestamp", "url", "views"]);
  assert.equal(post.url, "https://www.instagram.com/p/Cabc123/");
  assert.equal(post.timestamp, "2026-10-27T18:30:00.000Z");
  assert.equal(post.likes, 120);
  assert.equal(post.comments, 8);
  assert.equal(post.views, null);
  assert.equal(post.author, "seattle_mom");
  assert.equal(post.location_id, "213131048");
  assert.equal(post.location_name, "Seattle Aquarium");
  assert.equal(post.caption, "Best day at the aquarium with the kids!");
});

test("the Apify call sends the token in a header and asks for recent posts only", async () => {
  let seen;
  const provider = createApifyProvider({
    token: "secret-token",
    now: () => NOW,
    fetchFn: async (url, init) => { seen = { url, init, body: JSON.parse(init.body) }; return { ok: true, status: 200, json: async () => [] }; },
  });
  await provider.fetchLocationPosts({ locationId: "213131048", limit: 40, sinceDays: 7 });
  assert.ok(!seen.url.includes("secret-token"));
  assert.equal(seen.init.headers.Authorization, "Bearer secret-token");
  assert.match(seen.url, /apidojo~instagram-location-scraper-api\/run-sync-get-dataset-items/);
  assert.deepEqual(seen.body.locationIds, ["213131048"]);
  assert.equal(seen.body.maxItems, 40);
  assert.equal(seen.body.until, "2026-10-21");
});

test("items without a url or timestamp are dropped, not guessed", async () => {
  const provider = createApifyProvider({ token: "t", fetchFn: ok([APIFY_ITEM, { likeCount: 5 }, { ...APIFY_ITEM, createdAt: undefined, url: "https://x/2" }]) });
  const posts = await provider.fetchLocationPosts({ locationId: "1" });
  assert.equal(posts.length, 1);
});

test("a provider failure is thrown with the status, never returned as an empty list", async () => {
  const provider = createApifyProvider({ token: "t", fetchFn: async () => ({ ok: false, status: 402, json: async () => ({}) }) });
  await assert.rejects(() => provider.fetchLocationPosts({ locationId: "1" }), /402/);
});

test("Apify hashtag posts are reported as unsupported until an actor is configured", async () => {
  const provider = createApifyProvider({ token: "t", fetchFn: ok([]) });
  await assert.rejects(() => provider.fetchHashtagPosts("seattlewithkids"), TrendProviderUnsupported);
});

// HikerAPI's Swagger page could not be read, so this shape is an assumption from its Instagram-client naming
// (pk, code, taken_at, like_count, comment_count, play_count, user.username, location.pk/name). The bench
// script saves raw responses so the mapping can be corrected from a real call.
const HIKER_ITEM = {
  pk: "3000001", code: "Cxyz789", taken_at: "2026-10-28T09:00:00+00:00",
  like_count: 300, comment_count: 20, play_count: 5000,
  user: { pk: "7", username: "pnw_family" },
  location: { pk: "213131048", name: "Seattle Aquarium" },
  caption: { text: "Family day out" },
};

test("HikerAPI posts map onto the same shape, whichever envelope the response uses", async () => {
  for (const envelope of [[[HIKER_ITEM], "cursor"], { response: { items: [HIKER_ITEM] } }, { items: [HIKER_ITEM] }, [HIKER_ITEM]]) {
    const provider = createHikerApiProvider({ now: () => NOW, accessKey: "k", fetchFn: ok(envelope) });
    const [post] = await provider.fetchLocationPosts({ locationId: "213131048" });
    assert.equal(post.url, "https://www.instagram.com/p/Cxyz789/");
    assert.equal(post.likes, 300);
    assert.equal(post.views, 5000);
    assert.equal(post.author, "pnw_family");
    assert.equal(post.location_id, "213131048");
    assert.equal(post.caption, "Family day out");
    assert.equal(post.timestamp, "2026-10-28T09:00:00.000Z");
  }
});

test("HikerAPI accepts epoch-second timestamps", async () => {
  const provider = createHikerApiProvider({ now: () => NOW, accessKey: "k", fetchFn: ok([{ ...HIKER_ITEM, taken_at: 1793181600 }]) });
  const [post] = await provider.fetchLocationPosts({ locationId: "1" });
  assert.equal(post.timestamp, new Date(1793181600 * 1000).toISOString());
});

test("HikerAPI sends its key in the x-access-key header and follows the page cursor up to the limit", async () => {
  const calls = [];
  const pages = [[[HIKER_ITEM, { ...HIKER_ITEM, code: "B" }], "cur2"], [[{ ...HIKER_ITEM, code: "C" }, { ...HIKER_ITEM, code: "D" }], null]];
  const provider = createHikerApiProvider({
    accessKey: "k-123",
    fetchFn: async (url, init) => { calls.push({ url, init }); return { ok: true, status: 200, json: async () => pages[calls.length - 1] }; },
  });
  const posts = await provider.fetchLocationPosts({ locationId: "213131048", limit: 3 });
  assert.equal(posts.length, 3);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].init.headers["x-access-key"], "k-123");
  assert.ok(!calls[0].url.includes("k-123"));
  assert.match(calls[1].url, /max_id=cur2|end_cursor=cur2|cursor=cur2/);
  assert.equal(provider.stats().requests, 2);
});

test("hashtag posts use the hashtag endpoint", async () => {
  let url;
  const provider = createHikerApiProvider({ now: () => NOW, accessKey: "k", fetchFn: async (u) => { url = u; return { ok: true, status: 200, json: async () => [[HIKER_ITEM], null] }; } });
  const posts = await provider.fetchHashtagPosts("seattlewithkids");
  assert.match(url, /hashtag/);
  assert.match(url, /seattlewithkids/);
  assert.equal(posts.length, 1);
});

test("createTrendProvider picks the provider named in TREND_PROVIDER and fails clearly without credentials", () => {
  assert.equal(createTrendProvider({ TREND_PROVIDER: "apify", APIFY_TOKEN: "t" }).name, "apify");
  assert.equal(createTrendProvider({ TREND_PROVIDER: "hikerapi", HIKERAPI_ACCESS_KEY: "k" }).name, "hikerapi");
  assert.throws(() => createTrendProvider({ TREND_PROVIDER: "hikerapi" }), /HIKERAPI_ACCESS_KEY/);
  assert.throws(() => createTrendProvider({ TREND_PROVIDER: "nope" }), /Unknown TREND_PROVIDER/);
  assert.throws(() => createTrendProvider({}), /TREND_PROVIDER/);
});

test("raw responses are kept before normalization so a wrong mapping can be diagnosed", async () => {
  const dropped = { likeCount: 5, mystery: "field" };
  const apify = createApifyProvider({ token: "t", fetchFn: ok([APIFY_ITEM, dropped]) });
  await apify.fetchLocationPosts({ locationId: "1" });
  const rawApify = apify.takeRaw();
  assert.equal(rawApify.length, 1);
  assert.equal(rawApify[0].length, 2);
  assert.deepEqual(rawApify[0][1], dropped);
  assert.deepEqual(apify.takeRaw(), []);

  const envelope = { response: { items: [{ unknown_shape: true }] } };
  const hiker = createHikerApiProvider({ now: () => NOW, accessKey: "k", fetchFn: ok(envelope) });
  assert.deepEqual(await hiker.fetchLocationPosts({ locationId: "1" }), []);
  assert.deepEqual(hiker.takeRaw(), [envelope]);
});

test("HikerAPI honors the requested time window and stops paging once a page reaches older posts", async () => {
  const fresh = (code, hours) => ({ ...HIKER_ITEM, code, taken_at: new Date(NOW - hours * 3600000).toISOString() });
  const pages = [[[fresh("A", 5), fresh("B", 100), fresh("OLD", 24 * 30)], "next"], [[fresh("C", 6)], null]];
  let calls = 0;
  const provider = createHikerApiProvider({ now: () => NOW, accessKey: "k", fetchFn: async () => ({ ok: true, status: 200, json: async () => pages[calls++] }) });
  const posts = await provider.fetchLocationPosts({ locationId: "1", limit: 50, sinceDays: 7 });
  assert.deepEqual(posts.map((p) => p.url.split("/p/")[1]), ["A/", "B/"]);
  assert.equal(calls, 1);
});

test("HikerAPI defaults to a 7 day window, like Apify, and applies it to hashtags too", async () => {
  const old = { ...HIKER_ITEM, code: "OLD", taken_at: new Date(NOW - 20 * 86400000).toISOString() };
  const provider = createHikerApiProvider({ now: () => NOW, accessKey: "k", fetchFn: ok([[old], null]) });
  assert.deepEqual(await provider.fetchLocationPosts({ locationId: "1" }), []);
  assert.deepEqual(await provider.fetchHashtagPosts("seattle"), []);
});
