import test from "node:test";
import assert from "node:assert/strict";
import { parseSse, mergePlan, durationMinutes, inclusiveDays, scorePlan, scoreParse, scoreTips, percentile } from "../../scripts/eval-scoring.mjs";

const sse = (events) => events.map(({ event, data }) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`).join("");
const act = (id, over = {}) => ({ id, name: `Stop ${id}`, duration: "2 hours", kidFriendly: true, petFriendly: false, ...over });
const chunk = (days, activities, grounding) => ({ event: "itinerary-chunk", data: { tripPlan: { dailyItinerary: days, suggestedActivities: activities, ...(grounding && { grounding }) } } });
const REQUEST = { destination: "Seattle, Washington", startDate: "2026-12-01", endDate: "2026-12-02", children: [{ age: 2 }], pets: [] };
const goodEvents = () => [
  { event: "destination", data: { displayName: "Seattle, United States" } },
  chunk([{ activities: ["a", "b", "c", "d"] }, { activities: ["e", "f", "g", "h"] }], "abcdefgh".split("").map((id) => act(id)), { total: 8, matched: 8, ratio: 1 }),
  { event: "done", data: {} },
];

test("server-sent events are split into names and parsed data, ignoring keepalives", () => {
  const events = parseSse(`: keepalive\n\n${sse([{ event: "weather", data: { a: 1 } }, { event: "done", data: {} }])}`);
  assert.deepEqual(events, [{ event: "weather", data: { a: 1 } }, { event: "done", data: {} }]);
});

test("chunks are merged into one plan with combined grounding", () => {
  const merged = mergePlan([
    chunk([{ activities: ["a"] }], [act("a")], { total: 4, matched: 3, ratio: 0.75 }),
    chunk([{ activities: ["b"] }], [act("b")], { total: 4, matched: 4, ratio: 1 }),
    { event: "done", data: {} },
  ]);
  assert.equal(merged.days.length, 2);
  assert.equal(merged.activities.length, 2);
  assert.deepEqual(merged.grounding, { total: 8, matched: 7, ratio: 7 / 8 });
  assert.equal(merged.hasDone, true);
});

test("durations are read from hours, minutes, combinations and ranges", () => {
  assert.equal(durationMinutes("2 hours"), 120);
  assert.equal(durationMinutes("90 min"), 90);
  assert.equal(durationMinutes("1.5 hours"), 90);
  assert.equal(durationMinutes("1 hour 30 minutes"), 90);
  assert.equal(durationMinutes("2-3 hours"), 180);
  assert.equal(durationMinutes("half a day"), null);
  assert.equal(inclusiveDays("2026-12-01", "2026-12-03"), 3);
});

test("a complete plan passes and reports its structure", () => {
  const score = scorePlan(REQUEST, mergePlan(goodEvents()));
  assert.equal(score.complete, true);
  assert.deepEqual(score.problems, []);
  assert.equal(score.durationInRange, 1);
  assert.equal(score.kidFriendlyShare, 1);
  assert.equal(score.groundedRatio, 1);
  assert.equal(score.destinationKept, true);
  assert.equal(score.petFriendlyShare, null, "no pets, so no pet check");
});

test("each structural failure is named: stream error, missing days, unknown ids", () => {
  const broken = scorePlan(REQUEST, mergePlan([
    { event: "destination", data: { displayName: "Seattle" } },
    chunk([{ activities: ["a", "b", "x"] }], [act("a"), act("b")]),
    { event: "error", data: { message: "Failed to generate itinerary." } },
  ]));
  assert.equal(broken.complete, false);
  const text = broken.problems.join(" | ");
  assert.match(text, /stream error/);
  assert.match(text, /no done event/);
  assert.match(text, /1 days for 2 requested/);
  assert.match(text, /unknown x/);
});

test("thin days and repeated stops are counted but do not make a plan incomplete", () => {
  const plan = scorePlan(REQUEST, mergePlan([
    chunk([{ activities: ["a", "b", "c"] }, { activities: ["a2", "f", "g", "h"] }], ["a", "b", "c", "a2", "f", "g", "h"].map((id) => act(id, { name: id === "a2" ? "Stop a" : `Stop ${id}` }))),
    { event: "done", data: {} },
  ]));
  assert.equal(plan.complete, true);
  assert.equal(plan.thinDays, 1, "day 1 has 3 stops for a family");
  assert.equal(plan.repeatedStops, 1, "Stop a is on both days");
  assert.equal(scorePlan({ ...REQUEST, children: [] }, mergePlan([chunk([{ activities: ["a", "b", "c"] }, { activities: ["d", "e", "f"] }], "abcdef".split("").map((id) => act(id))), { event: "done", data: {} }])).thinDays, 0, "three stops is enough without children");
});

test("duration, kid and pet shares are measured per stop", () => {
  const request = { ...REQUEST, pets: [{ type: "dog" }] };
  const events = [
    { event: "destination", data: { displayName: "Seattle" } },
    chunk([{ activities: ["a", "b", "c", "d"] }, { activities: ["e", "f", "g", "h"] }], [
      act("a", { duration: "20 min" }), act("b", { duration: "5 hours" }), act("c", { kidFriendly: false, petFriendly: true }), act("d", { petFriendly: true }),
      act("e"), act("f"), act("g"), act("h"),
    ]),
    { event: "done", data: {} },
  ];
  const score = scorePlan(request, mergePlan(events));
  assert.equal(score.durationInRange, 6 / 8);
  assert.equal(score.kidFriendlyShare, 7 / 8);
  assert.equal(score.petFriendlyShare, 2 / 8);
});

test("a parse that keeps an explicit destination and every constraint passes", () => {
  const expect = { destinationIncludes: ["Las Vegas"], childrenAges: [6], adults: 2, dayCount: 3 };
  assert.equal(scoreParse({ dayCount: [7, 8] }, { startDate: "2026-11-11", endDate: "2026-11-18" }).pass, true, "a week is seven or eight calendar days");
  assert.equal(scoreParse({ dayCount: [7, 8] }, { startDate: "2026-11-11", endDate: "2026-11-14" }).pass, false);
  const result = { destination: "Las Vegas, Nevada", suggestedDestinations: [], childrenAges: [6], adults: 2, startDate: "2026-12-01", endDate: "2026-12-03" };
  assert.deepEqual(scoreParse(expect, result), { checks: { destination: true, noInterruption: true, children: true, adults: true, days: true }, failed: [], pass: true });
});

test("a parse names each constraint it dropped", () => {
  const expect = { destinationIncludes: ["Tokyo"], childrenAges: [8], petTypes: ["dog"], dietary: ["vegetarian"] };
  const result = { destination: null, suggestedDestinations: [{}, {}, {}], childrenAges: [], pets: [], foodPreferences: { dietary: [] } };
  const score = scoreParse(expect, result);
  assert.equal(score.pass, false);
  assert.deepEqual(score.failed.sort(), ["children", "destination", "dietary", "noInterruption", "pets"]);
});

test("a vague request must become a destination choice with three suggestions", () => {
  assert.equal(scoreParse({ destinationNull: true }, { destination: null, suggestedDestinations: [{}, {}, {}] }).pass, true);
  assert.equal(scoreParse({ destinationNull: true }, { destination: "Maui", suggestedDestinations: [] }).pass, false);
  assert.equal(scoreParse({ destinationNull: true }, { destination: null, suggestedDestinations: [{}] }).pass, false);
});

test("multi-stop and country-tour parses are checked for shape, stop order and country", () => {
  const result = { tripShape: "multi_stop", stops: [{ name: "Amsterdam" }, { name: "Berlin, Germany" }, { name: "Budapest" }] };
  assert.equal(scoreParse({ tripShape: "multi_stop", stops: ["Amsterdam", "Berlin", "Budapest"] }, result).pass, true);
  assert.equal(scoreParse({ stops: ["Berlin", "Amsterdam", "Budapest"] }, result).pass, false, "order matters");
  assert.equal(scoreParse({ country: "Japan" }, { countryTour: { country: "Japan" } }).pass, true);
});

test("travel tips need the expected fields and the right emergency number for the country", () => {
  const tips = { advisoryLevel: "low", emergencyNumber: "911", healthTips: ["a"], familyTips: ["b"], localCustoms: ["c"], waterSafety: "Safe", carSeatLaw: "Required under 8" };
  assert.deepEqual(scoreTips("US", tips), { valid: true, problems: [] });
  assert.match(scoreTips("GB", tips).problems.join(), /emergencyNumber 911/);
  assert.equal(scoreTips("GB", { ...tips, emergencyNumber: "999 or 112" }).valid, true);
  assert.match(scoreTips("US", { ...tips, carSeatLaw: "" }).problems.join(), /carSeatLaw/);
  assert.equal(scoreTips("US", null).valid, false);
});

test("percentiles use the nearest rank and ignore missing values", () => {
  assert.equal(percentile([10, 20, 30, 40, 50], 50), 30);
  assert.equal(percentile([10, 20, 30, 40, 50], 95), 50);
  assert.equal(percentile([null, 5, undefined], 50), 5);
  assert.equal(percentile([], 50), null);
});
