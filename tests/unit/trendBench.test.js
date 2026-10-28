import test from "node:test";
import assert from "node:assert/strict";
import { summarizeProviderRun, compareProviders } from "../../src/backend/services/trend/bench.js";

const NOW = Date.parse("2026-10-28T12:00:00Z");
const hoursAgo = (h) => new Date(NOW - h * 3600000).toISOString();
const post = (id, h, over = {}) => ({ url: `https://i/p/${id}`, timestamp: hoursAgo(h), likes: 10, comments: 1, views: null, author: `u${id}`, location_id: "L", location_name: "V", ...over });

test("a run is summarized by volume, freshness, field coverage, latency and cost", () => {
  const posts = [post("a", 5), post("b", 50), post("c", 100, { views: 900 }), post("d", 200, { author: null })];
  const s = summarizeProviderRun({ posts, ms: 1500, requests: 2, now: NOW, costUsd: 0.04 });
  assert.equal(s.posts, 4);
  assert.equal(s.newestAgeHours, 5);
  assert.equal(s.medianAgeHours, 75);
  assert.equal(s.coverage.timestamp, 1);
  assert.equal(s.coverage.views, 0.25);
  assert.equal(s.coverage.author, 0.75);
  assert.equal(s.requests, 2);
  assert.equal(s.costUsd, 0.04);
  assert.equal(s.costPerPostUsd, 0.01);
  assert.equal(s.postsLast7Days, 3);
});

test("an empty run does not divide by zero", () => {
  const s = summarizeProviderRun({ posts: [], ms: 10, requests: 1, now: NOW, costUsd: 0.025 });
  assert.equal(s.posts, 0);
  assert.equal(s.costPerPostUsd, null);
  assert.equal(s.newestAgeHours, null);
});

test("providers are compared on how many posts they share for the same place", () => {
  const a = [post("1", 5), post("2", 6), post("3", 7)];
  const b = [post("2", 6), post("3", 7), post("4", 8)];
  const result = compareProviders({ apify: a, hikerapi: b });
  assert.deepEqual(result.overlap, { "apify|hikerapi": { shared: 2, union: 4, jaccard: 0.5 } });
  assert.deepEqual(result.onlyIn.apify, ["https://i/p/1"]);
  assert.deepEqual(result.onlyIn.hikerapi, ["https://i/p/4"]);
});

test("post urls are compared without tracking query strings or trailing slashes", () => {
  const a = [post("x", 1, { url: "https://www.instagram.com/p/AAA/" })];
  const b = [post("x", 1, { url: "https://www.instagram.com/p/AAA?igshid=zzz" })];
  assert.equal(compareProviders({ p: a, q: b }).overlap["p|q"].shared, 1);
});
