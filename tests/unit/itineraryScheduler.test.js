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

test("scheduleItinerary treats full-day attractions as a real full day", () => {
  const tripPlan = {
    suggestedActivities: [
      makeActivity("act-1", "Tokyo Disneyland", "full day"),
    ],
    dailyItinerary: [
      {
        day: "Day 1",
        activities: ["act-1"],
        meals: { dinner: { name: "Dinner One" } },
        notes: "",
      },
    ],
  };

  const scheduled = scheduleItinerary(tripPlan, {}, "2026-05-21");
  const disney = scheduled[0].scheduled.find((item) => item.name === "Tokyo Disneyland");

  assert.equal(disney.duration, 480);
  assert.equal(disney.scheduledStart, "9:00 AM");
  assert.equal(disney.scheduledEnd, "5:00 PM");
});

test("scheduleItinerary treats major theme parks as full-day even when raw duration is too short", () => {
  const tripPlan = {
    suggestedActivities: [
      makeActivity("act-1", "Tokyo Disneyland", "2 hours"),
    ],
    dailyItinerary: [
      {
        day: "Day 1",
        activities: ["act-1"],
        meals: { dinner: { name: "Dinner One" } },
        notes: "",
      },
    ],
  };

  const scheduled = scheduleItinerary(tripPlan, {}, "2026-05-21", { hasChildren: true });
  const disney = scheduled[0].scheduled.find((item) => item.name === "Tokyo Disneyland");

  assert.equal(disney.duration, 480);
  assert.equal(disney.scheduledStart, "9:00 AM");
  assert.equal(disney.scheduledEnd, "5:00 PM");
});

test("scheduleItinerary does not schedule long child-trip attractions into the evening", () => {
  const tripPlan = {
    suggestedActivities: [
      makeActivity("act-1", "Morning Museum", "2 hours"),
      makeActivity("act-2", "City Zoo", "2 hours"),
      makeActivity("act-3", "Neighborhood Park", "2 hours"),
      makeActivity("act-4", "Night Aquarium Visit", "4 hours"),
    ],
    dailyItinerary: [
      {
        day: "Day 1",
        activities: ["act-1", "act-2", "act-3", "act-4"],
        meals: { dinner: { name: "Dinner One" } },
        notes: "",
      },
    ],
  };

  const scheduled = scheduleItinerary(tripPlan, {}, "2026-05-21", { hasChildren: true });
  const activities = scheduled[0].scheduled.filter((item) => !item.isMeal);

  assert.equal(
    activities.some((item) => item.name === "Night Aquarium Visit"),
    false,
    "a 4-hour attraction should not start late afternoon and run into the evening on a child trip",
  );
  assert.deepEqual(activities.map((item) => item.scheduledEnd), ["11:00 AM", "1:20 PM", "3:40 PM"]);
  assert.ok(
    scheduled[0].warnings.some((warning) => warning.type === "too_late"),
    "scheduler should explain that the late long activity was skipped",
  );
});
