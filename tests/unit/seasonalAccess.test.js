import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildSeasonalAccessNote,
  checkSeasonalAccess,
  filterSeasonalShortlist,
  seasonalAccessFor,
} from "../../src/backend/services/seasonalAccess.js";
import { buildTripPlanPrompt } from "../../src/backend/services/tripPlanAI.js";

// Two plans recorded in the Oct 28 model comparison for a Dec 27 to Jan 1 Yellowstone trip, both written as if it
// were summer. Every model failed this way, so these are the regression cases for the seasonal-access fix.
const recorded = JSON.parse(readFileSync(new URL("../quality/fixtures/yellowstone-winter-plans.json", import.meta.url), "utf8"));
const WINTER = { destination: "Yellowstone National Park, Wyoming", ...recorded.tripDates };
const SUMMER = { destination: "Yellowstone National Park, Wyoming", startDate: "2027-07-10", endDate: "2027-07-12" };

const plan = (days) => ({
  suggestedActivities: days.flat().map((name, i) => ({ id: `a${i}`, name })),
  dailyItinerary: days.map((names, d) => ({
    day: `Day ${d + 1}`,
    activities: names.map((name) => `a${days.flat().indexOf(name)}`),
    meals: { dinner: { name: "Mammoth Hotel Dining Room" } },
  })),
});

test("seasonal rules apply to Yellowstone in winter and not in summer or elsewhere", () => {
  assert.equal(seasonalAccessFor(WINTER.destination, WINTER.startDate, WINTER.endDate)?.seasons[0].label, "winter");
  assert.equal(seasonalAccessFor(SUMMER.destination, SUMMER.startDate, SUMMER.endDate), null);
  assert.equal(seasonalAccessFor("Seattle, Washington", WINTER.startDate, WINTER.endDate), null);
  // A trip that crosses the reopening date only gets the rules for its winter days.
  const spring = seasonalAccessFor(WINTER.destination, "2027-04-23", "2027-04-26");
  assert.deepEqual(spring.seasons[0].dates, ["2027-04-23", "2027-04-24"]);
});

test("every recorded winter plan fails the check", () => {
  for (const [model, recordedPlan] of Object.entries(recorded).filter(([key]) => !key.startsWith("_") && key !== "tripDates")) {
    const failures = checkSeasonalAccess(recordedPlan, WINTER);
    assert.ok(failures.length > 10, `${model} should fail on interior stops, got ${failures.length}`);
  }
  const lodges = checkSeasonalAccess(recorded["haiku-5-5-nothink"], WINTER).filter((f) => f.includes("lodge closed"));
  assert.equal(lodges.length, 4);
  assert.match(lodges.join("\n"), /Old Faithful Inn/);
});

test("a winter plan on the open road, or with a snowcoach, passes", () => {
  assert.deepEqual(checkSeasonalAccess(plan([["Mammoth Hot Springs", "Lamar Valley"], ["Old Faithful by guided snowcoach"]]), {
    ...WINTER, endDate: "2026-12-28",
  }), []);
});

test("the same interior stops pass in summer, and a closed lodge fails even with a snowcoach", () => {
  assert.deepEqual(checkSeasonalAccess(plan([["Old Faithful", "Grand Prismatic Spring"]]), SUMMER), []);
  const lodgeDinner = plan([["Old Faithful snowcoach tour"]]);
  lodgeDinner.dailyItinerary[0].meals.dinner.name = "Old Faithful Inn Dining Room";
  assert.match(checkSeasonalAccess(lodgeDinner, { ...WINTER, endDate: WINTER.startDate }).join(), /Old Faithful Inn/);
});

test("closed lodges leave the shortlist in winter only", () => {
  const shortlist = [{ canonical_name: "Old Faithful Inn" }, { canonical_name: "Old Faithful" }, { name: "Lamar Valley" }];
  const winter = seasonalAccessFor(WINTER.destination, WINTER.startDate, WINTER.endDate);
  assert.deepEqual(filterSeasonalShortlist(shortlist, winter).map((a) => a.canonical_name || a.name), ["Old Faithful", "Lamar Valley"]);
  assert.equal(filterSeasonalShortlist(shortlist, null), shortlist);
});

test("the itinerary prompt carries the seasonal note in winter and drops the claim that every place is open", () => {
  const prompt = (trip) => {
    const p = buildTripPlanPrompt(trip.destination, trip.startDate, trip.endDate, ["wildlife"], [{ age: 7 }], { summary: "", forecast: [] }, {
      cachedAttractions: [{ canonical_name: "Old Faithful Inn", category: "landmark" }, { canonical_name: "Lamar Valley", category: "wildlife" }],
    });
    return `${p.system}\n${p.user}`;
  };
  const winter = prompt(WINTER);
  assert.match(winter, /SEASONAL ACCESS — Yellowstone National Park, winter/);
  assert.match(winter, /closed to private cars/);
  assert.match(winter, /2-4 activities/);
  assert.doesNotMatch(winter, /confirms each one exists and is open/);
  assert.doesNotMatch(winter, /Old Faithful Inn \|/);

  const summer = prompt(SUMMER);
  assert.doesNotMatch(summer, /SEASONAL ACCESS/);
  assert.match(summer, /4-6 activities/);
  assert.match(summer, /Old Faithful Inn \|/);
  assert.equal(buildSeasonalAccessNote(null), "");
});
