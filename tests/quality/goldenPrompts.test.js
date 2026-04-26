import test from "node:test";
import assert from "node:assert/strict";

import { allocateRoute } from "../../src/backend/services/routeAllocator.js";
import { scheduleItinerary } from "../../src/backend/services/itineraryScheduler.js";
import { routeQualityPrompts } from "./fixtures/routeQualityPrompts.js";

function minutesFromDisplay(value) {
  const match = String(value || "").match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  assert.ok(match, `Expected display time, got ${value}`);
  let hour = Number(match[1]);
  const minutes = Number(match[2]);
  const meridiem = match[3].toUpperCase();
  if (meridiem === "PM" && hour !== 12) hour += 12;
  if (meridiem === "AM" && hour === 12) hour = 0;
  return hour * 60 + minutes;
}

test("golden popular route prompts satisfy route quality guardrails", () => {
  for (const fixture of routeQualityPrompts.filter((item) => item.intent)) {
    const route = allocateRoute(fixture.intent);
    const stops = route.stops.map((stop) => stop.name);

    if (fixture.expectations.noDuplicateStops) {
      const keys = route.stops.map((stop) => stop.canonicalKey || stop.id);
      assert.equal(new Set(keys).size, keys.length, `${fixture.id} should not duplicate stops`);
    }

    if (fixture.expectations.mustIncludeStops) {
      for (const stopName of fixture.expectations.mustIncludeStops) {
        assert.ok(stops.includes(stopName), `${fixture.id} should include ${stopName}`);
      }
    }

    if (fixture.expectations.suggestedOrder) {
      assert.deepEqual(
        route.alternativeRoute?.stops.map((stop) => stop.name),
        fixture.expectations.suggestedOrder,
        `${fixture.id} should offer a more realistic order`,
      );
    }

    if (fixture.expectations.minStopNights) {
      assert.ok(
        route.stops.every((stop) => stop.nights >= fixture.expectations.minStopNights),
        `${fixture.id} should avoid one-night base hopping`,
      );
    }

    if (fixture.expectations.maxStops) {
      assert.ok(route.stops.length <= fixture.expectations.maxStops, `${fixture.id} should cap stop count for the trip length`);
    }

    if (fixture.expectations.mustWarnPacked) {
      assert.ok(route.warnings.some((warning) => /packed|aggressive/i.test(warning)), `${fixture.id} should warn when packed`);
    }

    if (fixture.expectations.mustWarnBroad) {
      assert.ok(route.warnings.some((warning) => /broad|confirm/i.test(warning)), `${fixture.id} should warn on broad stops`);
    }

    if (fixture.expectations.feasibilityLabels) {
      assert.ok(
        fixture.expectations.feasibilityLabels.includes(route.routeQuality.feasibility.label),
        `${fixture.id} feasibility should be acceptable`,
      );
    }
  }
});

test("golden family anchor prompts schedule major parks as full-day before child cutoff", () => {
  const fixture = routeQualityPrompts.find((item) => item.schedulerPlan);
  const scheduled = scheduleItinerary(fixture.schedulerPlan, {}, "2026-12-01", { hasChildren: true });
  const day = scheduled[0];
  const anchor = day.scheduled.find((item) => item.name === fixture.expectations.anchorName);
  const nonMeals = day.scheduled.filter((item) => !item.isMeal && item.status === "scheduled");

  assert.equal(anchor.duration, fixture.expectations.anchorDuration);
  assert.notEqual(anchor.duration, 120, "Disney/theme parks should never be normalized to two hours");
  assert.ok(
    nonMeals.every((item) => minutesFromDisplay(item.scheduledEnd) <= fixture.expectations.latestChildNonMealEndMinutes),
    "child-trip activities should finish by the family cutoff",
  );
});
