import test from "node:test";
import assert from "node:assert/strict";
import {
  isGroundedRow,
  excludeForTravelers,
  summarizeHours,
  isTrending,
  ensureTrendingSlots,
  attachGroundingToPlan,
} from "../../src/backend/services/groundedAttractions.js";

const NOW = Date.parse("2026-10-28T12:00:00Z");
const daysAgo = (d) => new Date(NOW - d * 86400000).toISOString();

const row = (over = {}) => ({
  id: "r", canonical_name: "Seattle Aquarium", status: "active", google_place_id: "p1", lat: 47.6, lon: -122.3,
  verification_status: "verified", rating: 4.6, rating_count: 20000, trend_score: 0, trend_updated_at: null,
  photo_ref: "places/p1/photos/abc", ...over,
});

test("only active, place-matched rows with coordinates are grounded", () => {
  assert.equal(isGroundedRow(row()), true);
  assert.equal(isGroundedRow(row({ status: "closed_unverified" })), false);
  assert.equal(isGroundedRow(row({ google_place_id: null })), false);
  assert.equal(isGroundedRow(row({ lat: null })), false);
  assert.equal(isGroundedRow(row({ verification_status: "rejected" })), false);
  assert.equal(isGroundedRow(row({ business_status: "CLOSED_PERMANENTLY" })), false);
  assert.equal(isGroundedRow(row({ family_fit_json: { adultsOnly: true } })), false);
});

test("a row written by the old generator without place data is never grounded", () => {
  assert.equal(isGroundedRow({ canonical_name: "Made Up Place", verification_status: "unverified", source_type: "generated" }), false);
});

test("formal fine dining is dropped for kids under 8 unless the traveler asked for it", () => {
  const rows = [row({ canonical_name: "Park" }), row({ canonical_name: "The French Laundry", family_fit_json: { fineDining: true } })];
  assert.deepEqual(excludeForTravelers(rows, { childrenAges: [4, 10] }).map((r) => r.canonical_name), ["Park"]);
  assert.equal(excludeForTravelers(rows, { childrenAges: [9, 12] }).length, 2);
  assert.equal(excludeForTravelers(rows, { childrenAges: [4], mustHaves: ["fine dining"] }).length, 2);
  assert.equal(excludeForTravelers(rows, { childrenAges: [] }).length, 2);
});

test("opening hours that are the same every open day are shown once, with the closed days", () => {
  const hours = { weekdayDescriptions: [
    "Monday: Closed", "Tuesday: 9:00 AM – 5:00 PM", "Wednesday: 9:00 AM – 5:00 PM", "Thursday: 9:00 AM – 5:00 PM",
    "Friday: 9:00 AM – 5:00 PM", "Saturday: 9:00 AM – 5:00 PM", "Sunday: 9:00 AM – 5:00 PM",
  ] };
  assert.equal(summarizeHours(hours), "9:00 AM – 5:00 PM; closed Mon");
  assert.equal(summarizeHours({ weekdayDescriptions: ["Monday: Open 24 hours", "Tuesday: Open 24 hours"] }), "Open 24 hours");
});

test("opening hours that differ by weekday keep every exception instead of showing only the typical hours", () => {
  const hours = { weekdayDescriptions: [
    "Monday: 9:00 AM – 5:00 PM", "Tuesday: 9:00 AM – 5:00 PM", "Wednesday: 9:00 AM – 5:00 PM", "Thursday: 9:00 AM – 5:00 PM",
    "Friday: 9:00 AM – 5:00 PM", "Saturday: 9:00 AM – 5:00 PM", "Sunday: 12:00 PM – 3:00 PM",
  ] };
  assert.equal(summarizeHours(hours), "Mon–Sat 9:00 AM – 5:00 PM; Sun 12:00 PM – 3:00 PM");
  const withClosed = { weekdayDescriptions: [
    "Monday: Closed", "Tuesday: 9:00 AM – 5:00 PM", "Wednesday: 9:00 AM – 5:00 PM", "Thursday: 9:00 AM – 5:00 PM",
    "Friday: 9:00 AM – 8:00 PM", "Saturday: 9:00 AM – 5:00 PM", "Sunday: 9:00 AM – 5:00 PM",
  ] };
  assert.equal(summarizeHours(withClosed), "Mon closed; Tue–Thu 9:00 AM – 5:00 PM; Fri 9:00 AM – 8:00 PM; Sat–Sun 9:00 AM – 5:00 PM");
  assert.equal(summarizeHours(null), "");
  assert.equal(summarizeHours({ weekdayDescriptions: [] }), "");
});

test("a venue is trending only while its score is positive and recent", () => {
  assert.equal(isTrending(row({ trend_score: 12, trend_updated_at: daysAgo(3) }), NOW), true);
  assert.equal(isTrending(row({ trend_score: 12, trend_updated_at: daysAgo(40) }), NOW), false);
  assert.equal(isTrending(row({ trend_score: 0, trend_updated_at: daysAgo(1) }), NOW), false);
  assert.equal(isTrending(row({ trend_score: 5, trend_updated_at: null }), NOW), false);
});

test("trending venues are guaranteed slots in the shortlist by replacing the lowest ranked evergreen ones", () => {
  const evergreen = Array.from({ length: 6 }, (_, i) => row({ id: `e${i}`, canonical_name: `Evergreen ${i}` }));
  const hot = row({ id: "t1", canonical_name: "Hot New Cafe", trend_score: 50, trend_updated_at: daysAgo(2) });
  const warm = row({ id: "t2", canonical_name: "Warm Park", trend_score: 10, trend_updated_at: daysAgo(2) });
  const out = ensureTrendingSlots(evergreen, [...evergreen, hot, warm], { maxResults: 6, slots: 2, now: NOW });
  assert.equal(out.length, 6);
  assert.deepEqual(out.map((r) => r.id).slice(0, 4), ["e0", "e1", "e2", "e3"]);
  assert.ok(out.some((r) => r.id === "t1") && out.some((r) => r.id === "t2"));
});

test("trending slots do not duplicate a venue that is already shortlisted", () => {
  const hot = row({ id: "t1", trend_score: 50, trend_updated_at: daysAgo(2) });
  const out = ensureTrendingSlots([hot, row({ id: "e1" })], [hot, row({ id: "e1" })], { maxResults: 2, slots: 2, now: NOW });
  assert.deepEqual(out.map((r) => r.id), ["t1", "e1"]);
});

test("grounding is attached to matching activities and the share of database-sourced stops is reported", () => {
  const candidates = [
    row({ canonical_name: "Seattle Aquarium" }),
    row({ id: "r2", canonical_name: "Pike Place Market", google_place_id: "p2", rating: 4.7, rating_count: 90000, price_level: 2, photo_ref: "places/p2/photos/xyz", trend_score: 30, trend_updated_at: daysAgo(1) }),
  ];
  const plan = { suggestedActivities: [{ id: "a1", name: "seattle aquarium" }, { id: "a2", name: "Pike Place Market!" }, { id: "a3", name: "Secret Rooftop" }], dailyItinerary: [] };
  const { tripPlan, stats } = attachGroundingToPlan(plan, candidates, { now: NOW });
  const [aquarium, market, secret] = tripPlan.suggestedActivities;
  assert.equal(aquarium.grounded, true);
  assert.equal(aquarium.placeId, "p1");
  assert.equal(aquarium.rating, 4.6);
  assert.equal(aquarium.trending, false);
  assert.equal(market.trending, true);
  assert.equal(market.priceLevel, 2);
  assert.equal(market.photoUrl, "/api/v1/places/photo?ref=places%2Fp2%2Fphotos%2Fxyz");
  assert.equal(secret.grounded, false);
  assert.equal(secret.trending, false);
  assert.deepEqual(stats, { total: 3, matched: 2, ratio: 2 / 3, unmatched: ["Secret Rooftop"] });
  assert.equal(plan.suggestedActivities[0].grounded, undefined, "the input plan is not mutated");
});

test("with no candidates the plan is returned untouched and nothing is reported as ungrounded", () => {
  const plan = { suggestedActivities: [{ id: "a1", name: "Anything" }] };
  const { tripPlan, stats } = attachGroundingToPlan(plan, [], { now: NOW });
  assert.equal(tripPlan, plan);
  assert.equal(stats, null);
});
