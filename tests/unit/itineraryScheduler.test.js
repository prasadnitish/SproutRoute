import test from "node:test";
import assert from "node:assert/strict";

import { scheduleItinerary } from "../../src/backend/services/itineraryScheduler.js";

function makeActivity(id, name, duration = "2 hours") {
  return {
    id,
    name,
    category: "general",
    description: `${name} description`,
    duration,
    kidFriendly: true,
    weatherDependent: false,
  };
}

test("scheduleItinerary reuses earlier activities as a last resort when dedup would starve later days", () => {
  const tripPlan = {
    suggestedActivities: [
      makeActivity("act-1", "Beach Morning"),
      makeActivity("act-2", "Zoo Visit"),
      makeActivity("act-3", "Aquarium Stop"),
      makeActivity("act-4", "Boardwalk Walk"),
    ],
    dailyItinerary: [
      {
        day: "Day 1",
        activities: ["act-1", "act-2", "act-3", "act-4"],
        meals: { dinner: { name: "Dinner One" } },
        notes: "",
      },
      {
        day: "Day 2",
        activities: ["act-1", "act-2", "act-3", "act-4"],
        meals: { dinner: { name: "Dinner Two" } },
        notes: "",
      },
    ],
  };

  const scheduled = scheduleItinerary(tripPlan, {}, "2026-05-21");
  const day2Activities = scheduled[1].scheduled.filter((item) => !item.isMeal);

  assert.equal(scheduled[0].scheduled.filter((item) => !item.isMeal).length, 4);
  assert.ok(day2Activities.length >= 3, "later days should keep enough activities to remain usable");
  assert.ok(
    day2Activities.every((item) => item.repeatAcrossTrip === true),
    "fallback activities should be marked when they repeat across the trip",
  );
});

test("scheduleItinerary does not mark unique later-day activities as cross-trip repeats", () => {
  const tripPlan = {
    suggestedActivities: [
      makeActivity("act-1", "Beach Morning"),
      makeActivity("act-2", "Zoo Visit"),
      makeActivity("act-3", "Aquarium Stop"),
      makeActivity("act-4", "Boardwalk Walk"),
    ],
    dailyItinerary: [
      {
        day: "Day 1",
        activities: ["act-1", "act-2"],
        meals: { dinner: { name: "Dinner One" } },
        notes: "",
      },
      {
        day: "Day 2",
        activities: ["act-3", "act-4"],
        meals: { dinner: { name: "Dinner Two" } },
        notes: "",
      },
    ],
  };

  const scheduled = scheduleItinerary(tripPlan, {}, "2026-05-21");
  const day2Activities = scheduled[1].scheduled.filter((item) => !item.isMeal);

  assert.equal(day2Activities.length, 2);
  assert.ok(day2Activities.every((item) => item.repeatAcrossTrip !== true));
});
