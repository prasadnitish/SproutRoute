// Regression tests for defects found by the Nov 13, 2026 eval review (two independent reviewers).
// Each test names the finding it pins.
import test from "node:test";
import assert from "node:assert/strict";
import { scheduleItinerary } from "../../src/backend/services/itineraryScheduler.js";
import { childrenAgesAreStated, parseInput } from "../../src/backend/services/parseInput.js";
import { getTravelSafety } from "../../src/backend/services/travelSafety.js";
import { generateTripPlanChunked, buildTripPlanPrompt } from "../../src/backend/services/tripPlanAI.js";
import { generatePackingList } from "../../src/backend/services/deterministicPacking.js";
import { withinDayTripRadius } from "../../src/backend/services/attractionMemory.js";
import { createApp } from "../../src/backend/server.js";

const activity = (id, name, extra = {}) => ({ id, name, category: "museums", duration: "1 hour", kidFriendly: true, ...extra });

// ── Scheduler: a stop with no coordinates is unknown, not at 0°N 0°E ──
test("a stop with null coordinates does not add thousands of miles or a 90-minute leg", () => {
  const tripPlan = {
    suggestedActivities: [
      activity("a", "Seattle Aquarium", { lat: 47.6074, lon: -122.343 }),
      activity("b", "Pier 62", { lat: null, lon: null }),
      activity("c", "Pike Place Market", { lat: 47.6097, lon: -122.3422 }),
    ],
    dailyItinerary: [{ day: "Day 1", activities: ["a", "b", "c"], meals: { dinner: { name: "Dinner" } }, notes: "" }],
  };
  const [day] = scheduleItinerary(tripPlan, {}, "2026-12-17");
  assert.ok(day.routeMeta.totalDistanceMiles < 50, `distance was ${day.routeMeta.totalDistanceMiles}`);
  assert.equal(day.routeMeta.mappedStopCount, 2);
  assert.ok(!day.warnings.some((w) => w.type === "high_travel"));
  assert.ok(day.scheduled.every((s) => (s.travelFromPreviousMinutes || 0) < 90));
});

test("a timing tip that names a time outside the scheduled slot is dropped, and one inside it is kept", () => {
  const tripPlan = {
    suggestedActivities: [
      activity("a", "Scripps Park", { timingTip: "Ideal at 5:30 PM for sunset ocean breezes." }),
      activity("b", "Balboa Park", { timingTip: "Good around 12:30 PM once the morning groups leave." }),
      activity("c", "Old Town", { timingTip: "Book tickets online in advance." }),
    ],
    dailyItinerary: [{ day: "Day 1", activities: ["a", "b", "c"], meals: { dinner: { name: "Dinner" } }, notes: "" }],
  };
  const [day] = scheduleItinerary(tripPlan, {}, "2026-12-15");
  const tip = (name) => day.scheduled.find((s) => s.name === name).timingTip;
  assert.equal(tip("Scripps Park"), "");
  assert.match(tip("Balboa Park"), /12:30 PM/);
  assert.match(tip("Old Town"), /Book tickets/);
});

test("a theme_park category alone does not make a two-hour place an all-day stop", () => {
  const tripPlan = {
    suggestedActivities: [
      activity("a", "Slime Kitchen", { category: "theme_park", duration: "2 hours" }),
      activity("b", "Fleet Science Center"),
      activity("c", "Balboa Park", { category: "parks" }),
    ],
    dailyItinerary: [{ day: "Day 1", activities: ["a", "b", "c"], meals: { dinner: { name: "Dinner" } }, notes: "" }],
  };
  const [day] = scheduleItinerary(tripPlan, {}, "2026-12-21");
  const stops = day.scheduled.filter((s) => !s.isMeal);
  assert.equal(stops.length, 3, "the other stops are kept");
  assert.ok(stops.find((s) => s.name === "Slime Kitchen").duration <= 180);
});

test("a named major theme park is still an all-day stop", () => {
  const tripPlan = {
    suggestedActivities: [activity("a", "LEGOLAND California Resort", { category: "theme_park", duration: "full day" })],
    dailyItinerary: [{ day: "Day 1", activities: ["a"], meals: { dinner: { name: "Dinner" } }, notes: "" }],
  };
  const [day] = scheduleItinerary(tripPlan, {}, "2026-12-21");
  assert.equal(day.scheduled.find((s) => !s.isMeal).duration, 480);
});

// ── Car seat routes forward the country, so UK, Canada and Australia rules are reachable ──
async function invoke(app, path, body) {
  const layer = app._router.stack.find((l) => l.route && l.route.path === path && l.route.methods.post);
  const handler = layer.route.stack[layer.route.stack.length - 1].handle;
  const res = { statusCode: 200, body: undefined, setHeader() {}, status(c) { this.statusCode = c; return this; }, json(p) { this.body = p; return this; } };
  await handler({ method: "POST", path, body, headers: {}, ip: "127.0.0.1" }, res);
  return res;
}

for (const path of ["/api/safety/car-seat-check", "/api/v1/safety/car-seat-check"]) {
  test(`${path} passes countryCode to the rules service`, async () => {
    let seen = null;
    const app = createApp({ getCarSeatGuidanceFn: (input) => { seen = input; return { status: "Needs review", results: [] }; } });
    await invoke(app, path, { destination: "London, United Kingdom", countryCode: "gb", tripDate: "2026-12-28", children: [{ id: "child-0", age: 4 }] });
    assert.equal(seen.countryCode, "GB");
  });

  test(`${path} returns UK guidance for a London trip`, async () => {
    const app = createApp();
    const res = await invoke(app, path, { destination: "Greater London, England, United Kingdom", countryCode: "GB", tripDate: "2026-12-28", children: [{ id: "child-0", age: 4 }] });
    assert.equal(res.statusCode, 200);
    assert.notEqual(res.body.status, "Unavailable");
    assert.doesNotMatch(JSON.stringify(res.body), /US jurisdiction/);
  });
}

// ── Travel tips carry no model-written car seat law ──
test("the tips prompt does not ask the model for a car seat law, and the result never carries one", async () => {
  let prompt = "";
  const tips = await getTravelSafety("Seattle, Washington", [2], "US", {
    callAI: async (p) => { prompt = p; return JSON.stringify({ advisoryLevel: "low", emergencyNumber: "911", carSeatLaw: "Washington requires car seats under 8." }); },
  });
  assert.doesNotMatch(prompt, /car ?seat/i);
  assert.equal(tips.carSeatLaw, null);
});

// ── Ages: a guess must never count as stated ──
const stated = (text, ages) => childrenAgesAreStated(text, ages);

test("numbers that are not a child's age do not count", () => {
  for (const [text, ages] of [
    ["2 adults, kids, 5-day trip to Orlando", [5]],
    ["Our 5 year anniversary trip, bringing the kids", [5]],
    ["We last went 5 years ago, bringing the kids again", [5]],
    ["Three kids (5 total with us) to Denver", [5]],
    ["Fun for ages 5 and up, bringing the kids", [5]],
    ["Taking the kids, 5pm flight to Austin", [5]],
    ["Leaving in 5 months with our baby", [1]],
    ["A 6 month sabbatical with the baby", [1]],
    ["kids, 10 days in Rome", [1]],
    ["With kids, 12 days in Tokyo", [1]],
    ["Our dog is 5 years old. Bringing the kids.", [5]],
  ]) assert.equal(stated(text, ages), false, text);
});

test("each returned child needs its own stated age", () => {
  assert.equal(stated("My 5 year old and her friend", [5, 5]), false);
  assert.equal(stated("A 3 year old and another kid", [3, 3]), false);
  assert.equal(stated("Two 6 year olds", [6, 6]), false, "over-asks, which is the safe side");
  assert.equal(stated("a 6 year old and a 6 year old", [6, 6]), true);
});

test("months are never rounded up to an older child", () => {
  assert.equal(stated("With our 18 month old", [2]), false);
  assert.equal(stated("With our 18 month old", [1]), true);
  assert.equal(stated("Weekend away with a 5 month old", [0]), true);
  assert.equal(stated("Weekend away with a 5 month old", [1]), false);
});

test("common ways of stating ages are accepted", () => {
  assert.equal(stated("Kids are 4 and 8", [4, 8]), true);
  assert.equal(stated("Kids 4 and 8", [4, 8]), true);
  assert.equal(stated("Kids ages 4, 8, and 11", [4, 8, 11]), true);
  assert.equal(stated("A 3 and 7 year old", [3, 7]), true);
  assert.equal(stated("My son is 7 and my daughter is 4", [7, 4]), true);
  assert.equal(stated("Family trip. 2 adults, a 3 year old and a 7 year old.", [3, 7]), true);
  assert.equal(stated("2 adults and two kids, 4 and 8", [4, 8]), true);
  assert.equal(stated("kids (5, 7, 11)", [5, 7, 11]), true);
});

test("children in the text with no ages returned is flagged, and junk ages are dropped", async () => {
  const reply = (ages) => JSON.stringify({ destination: "Nashville", startDate: "2027-02-05", endDate: "2027-02-07", childrenAges: ages });
  const none = await parseInput("We are bringing the kids to Nashville, February 5 to 7, 2027", { callAI: async () => reply([]) });
  assert.equal(none.childrenAgesAssumed, true);
  const adults = await parseInput("Nashville, February 5 to 7, 2027, two adults", { callAI: async () => reply([]) });
  assert.equal(adults.childrenAgesAssumed, false);
  const junk = await parseInput("Nashville with the kids", { callAI: async () => reply([5, "x", -3, 44, 7.5]) });
  assert.deepEqual(junk.childrenAges, [5]);
});

// ── Prompts ──
test("the planning prompt makes no claim that places are currently open", () => {
  const shortlist = [{ canonical_name: "Seattle Aquarium", category: "wildlife", city_display_name: "Seattle, WA", indoor_outdoor: "both", verification_status: "verified" }];
  const { system } = buildTripPlanPrompt("Seattle, WA", "2026-12-01", "2026-12-03", [], [{ age: 2 }], { summary: "", forecast: [] }, { cachedAttractions: shortlist });
  assert.doesNotMatch(system, /currently open|currently operating/i);
  assert.doesNotMatch(system, /walking\/city tours/i, "with a shortlist, no rule may ask for walking tours");
});

test("the named-origin parse rule applies only when no destination is named", async () => {
  let sent = "";
  await parseInput("Leavenworth, a 2 hour drive from Seattle", { callAI: async (p) => { sent = p; return "{}"; } });
  assert.match(sent, /names an origin and a travel time but no destination/);
});

// ── Chunks: a place used in an earlier chunk is not offered again ──
test("later chunks do not get shortlist places that earlier chunks already used", async () => {
  const cachedAttractions = ["Ueno Park", "Ueno Zoo", "Senso-ji", "Tokyo Toy Museum"].map((n) => ({ canonical_name: n, category: "parks" }));
  const seenPerChunk = [];
  await generateTripPlanChunked(
    { destination: "Tokyo", startDate: "2026-12-23", endDate: "2026-12-27", cachedAttractions },
    { summary: "", forecast: [] },
    () => {},
    {
      generateTripPlanFn: async (chunkData) => {
        seenPerChunk.push((chunkData.cachedAttractions || []).map((a) => a.canonical_name));
        return seenPerChunk.length === 1
          ? { suggestedActivities: [{ id: "u", name: "Ueno Park" }, { id: "z", name: "Ueno Zoo (Ueno Zoological Gardens)" }], dailyItinerary: [{ day: "Day 1", activities: ["u", "z"] }] }
          : { suggestedActivities: [{ id: "s", name: "Senso-ji" }], dailyItinerary: [{ day: "Day 1", activities: ["s"] }] };
      },
    },
  );
  assert.deepEqual(seenPerChunk[0], ["Ueno Park", "Ueno Zoo", "Senso-ji", "Tokyo Toy Museum"]);
  assert.deepEqual(seenPerChunk[1], ["Senso-ji", "Tokyo Toy Museum"]);
});

// ── Shortlist: supplemental cities stay within a day trip ──
test("supplemental cities beyond a day-trip radius are dropped", () => {
  const myrtleBeach = { lat: 33.6956, lon: -78.89 };
  const rows = [
    { id: "conway", lat: 33.836, lon: -79.048 },
    { id: "charleston", lat: 32.7765, lon: -79.9311 },
    { id: "williamsburg", lat: 37.2707, lon: -76.7075 },
    { id: "daytona", lat: 29.2108, lon: -81.0228 },
    { id: "no-coords", lat: null, lon: null },
  ];
  assert.deepEqual(withinDayTripRadius(rows, myrtleBeach).map((r) => r.id), ["conway"]);
});

test("a town two hours from a big city is not filled with the big city's attractions", () => {
  const leavenworth = { lat: 47.5962, lon: -120.6615 };
  const rows = [
    { id: "seattle", lat: 47.6038, lon: -122.3301 },
    { id: "wenatchee", lat: 47.4235, lon: -120.3103 },
  ];
  assert.deepEqual(withinDayTripRadius(rows, leavenworth).map((r) => r.id), ["wenatchee"]);
});

// ── Packing follows the forecast ──
const packingNames = async (forecast, children = [{ age: 7 }]) => {
  const result = await generatePackingList(
    { destination: "Somewhere", startDate: "2027-01-12", endDate: "2027-01-14", activities: ["city"], children },
    { summary: "", forecast },
  );
  return result.categories.flatMap((c) => c.items.map((i) => i.name)).join(" | ");
};

test("a freezing trip packs gloves, a hat and boots, and no sun hat", async () => {
  const names = await packingNames([{ high: 22, low: 10, precipitation: 15 }], [{ age: 2 }]);
  assert.match(names, /glove|mitten/i);
  assert.match(names, /boot/i);
  assert.match(names, /thermal|base layer/i);
  assert.doesNotMatch(names, /sun hat/i);
});

test("a 37% rain chance packs a rain item even with a toddler's gear in the list", async () => {
  const names = await packingNames([{ high: 44, low: 35, precipitation: 37 }], [{ age: 2 }]);
  assert.match(names, /rain|umbrella/i);
});
