import test from "node:test";
import assert from "node:assert/strict";
import { allocateRoute, buildRouteStopId } from "../../src/backend/services/routeAllocator.js";

test("allocateRoute preserves explicit stop order and distributes nights across 10 days", () => {
  const route = allocateRoute({
    tripShape: "multi_stop",
    destination: "Europe multi-city trip",
    startDate: "2026-06-01",
    endDate: "2026-06-10",
    stops: [
      { name: "Amsterdam", role: "must_visit" },
      { name: "Greece", role: "must_visit", notes: ["Broad region; confirm city"] },
      { name: "Berlin", role: "must_visit" },
      { name: "Budapest", role: "must_visit" },
    ],
  });

  assert.equal(route.tripShape, "multi_stop");
  assert.equal(route.totalDays, 10);
  assert.equal(route.optimizationMode, "user_order");
  assert.equal(route.routeRationale, "We kept your city order because you listed the stops directly.");
  assert.equal(route.routeQuality.confidence, "needs_review");
  assert.deepEqual(route.stops.map((stop) => stop.name), ["Amsterdam", "Greece", "Berlin", "Budapest"]);
  assert.deepEqual(route.stops.map((stop) => stop.nights), [3, 2, 2, 2]);
  assert.equal(route.stops[0].arrivalDate, "2026-06-01");
  assert.equal(route.stops[3].departureDate, "2026-06-10");
  assert.equal(route.transitLegs.length, 3);
  assert.equal(route.transitLegs[0].mode, "flight");
  assert.ok(route.warnings.some((warning) => warning.includes("Greece")));
  assert.deepEqual(
    route.alternativeRoute.stops.map((stop) => stop.name),
    ["Amsterdam", "Berlin", "Budapest", "Greece"],
  );
  assert.equal(route.alternativeRoute.mode, "suggested_improvement");
  assert.ok(route.alternativeRoute.rationale.includes("train-friendly"));
});

test("allocateRoute proposes default Japan country-tour stops when parser only identifies country", () => {
  const route = allocateRoute({
    tripShape: "country_tour",
    destination: "Japan",
    startDate: "2026-11-01",
    endDate: "2026-11-14",
    stops: [],
    countryTour: {
      country: "Japan",
      countryCode: "JP",
      requestedRegions: [],
      suggestedStopCount: 4,
    },
  });

  assert.equal(route.tripShape, "country_tour");
  assert.equal(route.optimizationMode, "recommended");
  assert.equal(route.routeQuality.confidence, "medium");
  assert.ok(route.routeRationale.includes("Classic first-time route"));
  assert.deepEqual(route.stops.map((stop) => stop.name), ["Tokyo", "Kyoto", "Osaka", "Hakone"]);
  assert.equal(route.stops.reduce((sum, stop) => sum + stop.nights, 0), 13);
  assert.equal(route.confidence, "medium");
});

test("allocateRoute preserves manually reordered country stops when user_order is explicit", () => {
  const route = allocateRoute({
    tripShape: "country_tour",
    routeOptimizationMode: "user_order",
    destination: "Japan",
    startDate: "2026-11-01",
    endDate: "2026-11-08",
    stops: [
      { name: "Kyoto", role: "suggested" },
      { name: "Tokyo", role: "suggested" },
      { name: "Osaka", role: "suggested" },
    ],
    countryTour: {
      country: "Japan",
      countryCode: "JP",
      suggestedStopCount: 3,
    },
  });

  assert.equal(route.optimizationMode, "user_order");
  assert.deepEqual(route.stops.map((stop) => stop.name), ["Kyoto", "Tokyo", "Osaka"]);
  assert.ok(route.routeRationale.includes("your edited route"));
});

test("buildRouteStopId creates stable safe identifiers", () => {
  assert.equal(buildRouteStopId("Sao Paulo, Brazil", 0), "sao-paulo-brazil");
  assert.equal(buildRouteStopId("", 2), "stop-3");
});
