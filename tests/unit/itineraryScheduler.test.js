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

test("scheduleItinerary keeps a full-day anchor first even when other mapped stops are closer together", () => {
  const tripPlan = {
    suggestedActivities: [
      makeActivity("act-1", "Tokyo Disneyland", "2 hours"),
      makeActivity("act-2", "Asakusa Walk", "1 hour"),
      makeActivity("act-3", "Ueno Park", "1 hour"),
    ],
    dailyItinerary: [
      {
        day: "Day 1",
        activities: ["act-1", "act-2", "act-3"],
        meals: { dinner: { name: "Dinner One" } },
        notes: "",
      },
    ],
  };
  const enrichedMap = {
    "Tokyo Disneyland": { latitude: 35.6329, longitude: 139.8804 },
    "Asakusa Walk": { latitude: 35.7148, longitude: 139.7967 },
    "Ueno Park": { latitude: 35.7148, longitude: 139.7731 },
  };

  const scheduled = scheduleItinerary(tripPlan, enrichedMap, "2026-11-01", { hasChildren: true });
  const activities = scheduled[0].scheduled.filter((item) => !item.isMeal);

  assert.equal(activities[0].name, "Tokyo Disneyland");
  assert.equal(activities[0].duration, 480);
  assert.equal(scheduled[0].routeMeta.orderedBy, "input");
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

test("scheduleItinerary skips activities outside the current route stop", () => {
  const tripPlan = {
    suggestedActivities: [
      { ...makeActivity("act-1", "Tokyo National Museum", "2 hours"), cityDisplayName: "Tokyo" },
      { ...makeActivity("act-2", "Fushimi Inari Shrine", "2 hours"), cityDisplayName: "Kyoto" },
    ],
    dailyItinerary: [
      {
        day: "Day 1",
        activities: ["act-1", "act-2"],
        meals: { dinner: { name: "Dinner One" } },
        notes: "",
      },
    ],
  };

  const scheduled = scheduleItinerary(tripPlan, {}, "2026-11-01", {
    routeStop: { id: "tokyo", name: "Tokyo" },
  });
  const activities = scheduled[0].scheduled.filter((item) => !item.isMeal);

  assert.deepEqual(activities.map((item) => item.name), ["Tokyo National Museum"]);
  assert.ok(
    scheduled[0].warnings.some((warning) => warning.type === "wrong_route_stop"),
    "scheduler should explain cross-stop activities are skipped",
  );
});

test("scheduleItinerary reorders geocoded same-day attractions to reduce backtracking", () => {
  const tripPlan = {
    suggestedActivities: [
      makeActivity("act-1", "Old Town", "1 hour"),
      makeActivity("act-2", "Far Museum", "1 hour"),
      makeActivity("act-3", "Canal Walk", "1 hour"),
    ],
    dailyItinerary: [
      {
        day: "Day 1",
        activities: ["act-1", "act-2", "act-3"],
        meals: { dinner: { name: "Dinner One" } },
        notes: "",
      },
    ],
  };
  const enrichedMap = {
    "Old Town": { latitude: 35.000, longitude: 139.000 },
    "act-1": { latitude: 35.000, longitude: 139.000 },
    "Far Museum": { latitude: 35.120, longitude: 139.120 },
    "act-2": { latitude: 35.120, longitude: 139.120 },
    "Canal Walk": { latitude: 35.010, longitude: 139.010 },
    "act-3": { latitude: 35.010, longitude: 139.010 },
  };

  const scheduled = scheduleItinerary(tripPlan, enrichedMap, "2026-11-01");
  const activities = scheduled[0].scheduled.filter((item) => !item.isMeal);

  assert.deepEqual(
    activities.map((item) => item.name),
    ["Old Town", "Canal Walk", "Far Museum"],
  );
  assert.equal(scheduled[0].routeMeta.orderedBy, "spatial");
  assert.equal(scheduled[0].routeMeta.mappedStopCount, 3);
  assert.ok(scheduled[0].routeMeta.totalTravelMinutes > 0);
  assert.ok(activities[1].travelFromPreviousMinutes > 0);
  assert.ok(
    scheduled[0].warnings.some((warning) => warning.type === "spatial_order"),
    "scheduler should explain that it smoothed the day order",
  );
});

test("scheduleItinerary warns when one mapped day has excessive cross-town travel", () => {
  const tripPlan = {
    suggestedActivities: [
      makeActivity("act-1", "North Museum", "1 hour"),
      makeActivity("act-2", "South Beach", "1 hour"),
      makeActivity("act-3", "Airport Viewpoint", "1 hour"),
    ],
    dailyItinerary: [
      {
        day: "Day 1",
        activities: ["act-1", "act-2", "act-3"],
        meals: { dinner: { name: "Dinner One" } },
        notes: "",
      },
    ],
  };
  const enrichedMap = {
    "North Museum": { latitude: 35.800, longitude: 139.000 },
    "act-1": { latitude: 35.800, longitude: 139.000 },
    "South Beach": { latitude: 34.800, longitude: 139.000 },
    "act-2": { latitude: 34.800, longitude: 139.000 },
    "Airport Viewpoint": { latitude: 35.550, longitude: 139.780 },
    "act-3": { latitude: 35.550, longitude: 139.780 },
  };

  const scheduled = scheduleItinerary(tripPlan, enrichedMap, "2026-11-01");

  assert.ok(scheduled[0].routeMeta.totalDistanceMiles > 60);
  assert.ok(
    scheduled[0].warnings.some((warning) => warning.type === "high_travel"),
    "scheduler should flag overly spread out mapped days",
  );
});
