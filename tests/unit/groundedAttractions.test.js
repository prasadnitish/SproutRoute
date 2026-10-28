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

// ── Opening hours enforcement ────────────────────────────────────────────────

import { parseDayHours, enforceOpeningHours } from "../../src/backend/services/groundedAttractions.js";

const hoursOf = (monday, rest = monday) => ({ weekdayDescriptions: [`Monday: ${monday}`, ...["Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].map((d) => `${d}: ${rest}`)] });
const hourRow = (name, hours, over = {}) => row({ id: name, canonical_name: name, google_place_id: `p-${name}`, opening_hours: hours, ...over });
// 2026-11-02 is a Monday.
const planOf = (stops, date = "2026-11-02") => ({
  suggestedActivities: stops.map((s, i) => ({ id: `a${i}`, name: s.name, duration: s.duration || "2 hours", timingTip: s.tip ?? "", category: "museums", ...s.extra })),
  dailyItinerary: [{ day: `Day 1 (${date})`, activities: stops.map((_, i) => `a${i}`) }],
});

test("opening hours text is read into minute intervals, including closed, 24 hours, split and overnight days", () => {
  assert.deepEqual(parseDayHours("Monday: 10:00 AM – 5:00 PM"), [[600, 1020]]);
  assert.deepEqual(parseDayHours("Monday: 10:00 AM – 5:00 PM"), parseDayHours("Monday: 10:00 AM – 5:00 PM"));
  assert.deepEqual(parseDayHours("Tuesday: Closed"), []);
  assert.deepEqual(parseDayHours("Tuesday: Open 24 hours"), [[0, 1440]]);
  assert.deepEqual(parseDayHours("Friday: 9:00 AM – 12:00 PM, 1:00 – 5:00 PM"), [[540, 720], [780, 1020]]);
  assert.deepEqual(parseDayHours("Saturday: 6:00 PM – 2:00 AM"), [[1080, 1560]]);
  assert.equal(parseDayHours("Monday: whenever"), null, "text it cannot read is not treated as closed");
});

test("a stop that would run past closing is moved earlier so it fits, and its timing tip says the new time", () => {
  const flight = hourRow("The Museum of Flight", hoursOf("10:00 AM – 5:00 PM"));
  const plan = planOf([{ name: "The Museum of Flight", duration: "2 hours", tip: "Arrive around 4:45 PM for an inspiring indoor walk." }]);
  const { tripPlan, changes } = enforceOpeningHours(plan, [flight], { startDate: "2026-11-02" });
  assert.equal(tripPlan.suggestedActivities[0].timingTip, "Arrive around 3:00 PM for an inspiring indoor walk.");
  assert.deepEqual(changes.map((c) => [c.kind, c.name]), [["moved", "The Museum of Flight"]]);
  assert.equal(plan.suggestedActivities[0].timingTip.includes("4:45"), true, "the input plan is not mutated");
});

test("a stop that would start before opening is moved to opening time", () => {
  const plan = planOf([{ name: "Seattle Aquarium", duration: "2 hours", tip: "Go at 8:00 AM to beat crowds." }]);
  const { tripPlan } = enforceOpeningHours(plan, [hourRow("Seattle Aquarium", hoursOf("9:30 AM – 6:00 PM"))], { startDate: "2026-11-02" });
  assert.equal(tripPlan.suggestedActivities[0].timingTip, "Go at 9:30 AM to beat crowds.");
});

test("a stop that already fits, has no time in its tip, or has no hours on record is left alone", () => {
  const fits = planOf([{ name: "Aquarium", tip: "Arrive at 10:00 AM." }, { name: "Park", tip: "Whenever you like." }, { name: "Mystery", tip: "Arrive around 11:45 PM." }]);
  const candidates = [hourRow("Aquarium", hoursOf("9:30 AM – 6:00 PM")), hourRow("Park", hoursOf("Closed", "6:00 AM – 9:00 PM")), hourRow("Mystery", null)];
  const { tripPlan, changes } = enforceOpeningHours(fits, candidates, { startDate: "2026-11-02" });
  assert.deepEqual(tripPlan.suggestedActivities.map((a) => a.timingTip), ["Arrive at 10:00 AM.", "Whenever you like.", "Arrive around 11:45 PM."]);
  assert.equal(changes.length, 1, "only the closed-Monday park changes");
  assert.equal(changes[0].name, "Park");
});

test("a stop at a place that is closed that day is replaced by an open, unused shortlisted place", () => {
  const science = hourRow("Pacific Science Center", hoursOf("Closed", "10:00 AM – 5:00 PM"));
  const spare = hourRow("Woodland Park Zoo", hoursOf("9:00 AM – 5:00 PM"), { short_summary: "Zoo with a rainforest." });
  const alsoOpen = hourRow("Seattle Aquarium", hoursOf("9:30 AM – 6:00 PM"));
  const plan = planOf([{ name: "Seattle Aquarium", tip: "Arrive at 10:00 AM." }, { name: "Pacific Science Center", duration: "3 hours", tip: "Head here around 11:00 AM." }]);
  const { tripPlan, changes } = enforceOpeningHours(plan, [alsoOpen, science, spare], { startDate: "2026-11-02" });
  const names = tripPlan.suggestedActivities.map((a) => a.name);
  assert.ok(names.includes("Woodland Park Zoo"));
  assert.ok(!names.includes("Pacific Science Center"));
  assert.equal(names.filter((n) => n === "Seattle Aquarium").length, 1, "a stop already in the plan is never used as the replacement");
  const zoo = tripPlan.suggestedActivities.find((a) => a.name === "Woodland Park Zoo");
  assert.equal(zoo.timingTip, "Arrive around 11:00 AM.");
  assert.equal(zoo.duration, "3 hours");
  assert.deepEqual(tripPlan.dailyItinerary[0].activities, ["a0", zoo.id]);
  assert.equal(changes[0].kind, "replaced");
  assert.equal(changes[0].with, "Woodland Park Zoo");
});

test("a closed stop with no open replacement is kept and reported, not silently dropped", () => {
  const plan = planOf([{ name: "Pacific Science Center", tip: "Head here around 11:00 AM." }]);
  const { tripPlan, changes } = enforceOpeningHours(plan, [hourRow("Pacific Science Center", hoursOf("Closed", "10:00 AM – 5:00 PM"))], { startDate: "2026-11-02" });
  assert.equal(tripPlan.suggestedActivities.length, 1);
  assert.equal(changes[0].kind, "closed_no_replacement");
});

test("the weekday comes from the date in the day label, falling back to the trip start date", () => {
  const candidates = [hourRow("Museum", hoursOf("Closed", "9:00 AM – 5:00 PM"))];
  const sunday = planOf([{ name: "Museum", tip: "Arrive at 10:00 AM." }], "2026-11-01");
  assert.equal(enforceOpeningHours(sunday, candidates, { startDate: "2026-11-01" }).changes.length, 0);
  const unlabeled = planOf([{ name: "Museum", tip: "Arrive at 10:00 AM." }]);
  unlabeled.dailyItinerary[0].day = "Day 1";
  assert.equal(enforceOpeningHours(unlabeled, candidates, { startDate: "2026-11-02" }).changes[0].kind, "closed_no_replacement");
});

test("without candidates the plan is returned untouched", () => {
  const plan = planOf([{ name: "Anything" }]);
  assert.equal(enforceOpeningHours(plan, [], { startDate: "2026-11-02" }).tripPlan, plan);
});

test("a venue already in the plan under different capitalization is not used again as a replacement", () => {
  const aquarium = hourRow("Seattle Aquarium", hoursOf("9:30 AM – 6:00 PM"));
  const science = hourRow("Pacific Science Center", hoursOf("Closed", "10:00 AM – 5:00 PM"));
  const plan = planOf([{ name: "seattle aquarium!", tip: "Arrive at 10:00 AM." }, { name: "Pacific Science Center", tip: "Head here around 11:00 AM." }]);
  const { tripPlan, changes } = enforceOpeningHours(plan, [aquarium, science], { startDate: "2026-11-02" });
  assert.equal(tripPlan.suggestedActivities.length, 2);
  assert.ok(!tripPlan.suggestedActivities.some((a) => a.name === "Seattle Aquarium"), "no second visit to the aquarium");
  assert.equal(changes[0].kind, "closed_no_replacement");
});
