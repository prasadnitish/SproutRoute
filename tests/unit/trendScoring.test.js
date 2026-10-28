import test from "node:test";
import assert from "node:assert/strict";
import { postVelocity, scoreVenue, applyWeeklyDecay } from "../../src/backend/services/trend/scoring.js";

const NOW = Date.parse("2026-10-28T12:00:00Z");
const hoursAgo = (h) => new Date(NOW - h * 3600000).toISOString();
const post = (over = {}) => ({ url: "u", timestamp: hoursAgo(10), likes: 100, comments: 10, views: null, author: "a", location_id: "L", location_name: "Venue", ...over });

test("velocity is likes + 2*comments + views/50, per hour since posting", () => {
  assert.equal(postVelocity(post({ likes: 100, comments: 10, views: 500, timestamp: hoursAgo(10) }), NOW), (100 + 20 + 10) / 10);
});

test("a very fresh post is not divided by a near-zero number of hours", () => {
  const v = postVelocity(post({ timestamp: hoursAgo(0.01) }), NOW);
  assert.equal(v, 120 / 1);
});

test("a future timestamp is treated as just posted", () => {
  assert.equal(postVelocity(post({ timestamp: hoursAgo(-5) }), NOW), 120);
});

test("missing counts are treated as zero", () => {
  assert.equal(postVelocity(post({ likes: null, comments: null, views: null }), NOW), 0);
});

test("the score sums velocity and rewards more distinct authors", () => {
  const sameAuthor = scoreVenue([post({ author: "a" }), post({ author: "a" }), post({ author: "a" })], { now: NOW });
  const manyAuthors = scoreVenue([post({ author: "a" }), post({ author: "b" }), post({ author: "c" })], { now: NOW });
  assert.ok(manyAuthors.score > sameAuthor.score);
  assert.equal(manyAuthors.uniqueAuthors, 3);
  assert.equal(sameAuthor.uniqueAuthors, 1);
  assert.equal(manyAuthors.posts, 3);
});

test("a venue whose engagement is rising scores higher than one that is falling", () => {
  const posts = [post({ author: "a" }), post({ author: "b" })];
  const rising = scoreVenue(posts, { now: NOW, previousWeekVelocity: 2 });
  const falling = scoreVenue(posts, { now: NOW, previousWeekVelocity: 200 });
  assert.ok(rising.score > falling.score);
});

test("the week-over-week factor is bounded", () => {
  const posts = [post({ author: "a" })];
  const huge = scoreVenue(posts, { now: NOW, previousWeekVelocity: 0.0001 });
  const tiny = scoreVenue(posts, { now: NOW, previousWeekVelocity: 1e9 });
  assert.ok(huge.score / tiny.score <= 4 + 1e-9);
});

test("no posts scores zero", () => {
  assert.equal(scoreVenue([], { now: NOW }).score, 0);
});

test("a venue with no new posts has its score halved each week", () => {
  assert.equal(applyWeeklyDecay(80, 0), 80);
  assert.equal(applyWeeklyDecay(80, 1), 40);
  assert.equal(applyWeeklyDecay(80, 3), 10);
  assert.equal(applyWeeklyDecay(0, 5), 0);
});

test("scores stay finite and non-negative for odd input", () => {
  const { score } = scoreVenue([post({ likes: -5, comments: NaN, timestamp: "not a date" })], { now: NOW });
  assert.ok(Number.isFinite(score) && score >= 0);
});
