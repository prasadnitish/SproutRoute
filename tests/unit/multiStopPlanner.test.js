import test from "node:test";
import assert from "node:assert/strict";
import { planRouteStops } from "../../src/backend/services/multiStopPlanner.js";

test("planRouteStops geocodes and plans each stop independently", async () => {
  const calls = [];
  const routePlan = {
    tripShape: "multi_stop",
    totalDays: 5,
    stops: [
      { id: "amsterdam", name: "Amsterdam", displayName: "Amsterdam", arrivalDate: "2026-06-01", departureDate: "2026-06-03", nights: 2, dayStart: 1, dayEnd: 2, role: "must_visit" },
      { id: "berlin", name: "Berlin", displayName: "Berlin", arrivalDate: "2026-06-03", departureDate: "2026-06-05", nights: 2, dayStart: 3, dayEnd: 4, role: "must_visit" },
    ],
    transitLegs: [],
    warnings: [],
  };

  const events = [];
  const result = await planRouteStops({
    routePlan,
    baseTrip: {
      activities: ["international"],
      children: [],
      pets: [],
      foodPreferences: null,
      plannerSummary: "likes trains",
    },
    geocodeLocationFn: async (name) => {
      calls.push(["geocode", name]);
      return { lat: name === "Amsterdam" ? 52.37 : 52.52, lon: name === "Amsterdam" ? 4.9 : 13.4, displayName: `${name}, Test`, countryCode: name === "Amsterdam" ? "NL" : "DE" };
    },
    getWeatherForecastFn: async (lat, lon, countryCode, startDate, endDate) => {
      calls.push(["weather", countryCode, startDate, endDate]);
      return { summary: `${countryCode} weather`, forecast: [{ date: startDate, high: 70, condition: "Clear" }] };
    },
    generateTripPlanChunkedFn: async (tripInput, weather, onChunk) => {
      calls.push(["plan", tripInput.destination, weather.summary]);
      const plan = {
        overview: `Plan for ${tripInput.destination}`,
        suggestedActivities: [{ id: `${tripInput.destination}-museum`, name: `${tripInput.destination} Museum`, category: "museum" }],
        dailyItinerary: [{ day: "Day 1", activities: [`${tripInput.destination}-museum`], notes: "" }],
        tips: [`Tip for ${tripInput.destination}`],
      };
      onChunk(plan, { chunk: 1, totalChunks: 1, dayOffset: tripInput.dayOffset || 0 });
      return plan;
    },
    scheduleItineraryFn: (plan) => plan.dailyItinerary.map((day) => ({ ...day, scheduled: [] })),
    onEvent: (event, payload) => events.push([event, payload]),
  });

  assert.deepEqual(calls.filter(([kind]) => kind === "geocode").map(([, name]) => name), ["Amsterdam", "Berlin"]);
  assert.deepEqual(events.map(([event]) => event), ["stop-weather", "stop-itinerary", "stop-weather", "stop-itinerary"]);
  assert.equal(result.stopWeather.amsterdam.summary, "NL weather");
  assert.equal(result.stopItineraries.berlin.overview, "Plan for Berlin");
  assert.equal(result.tripPlan.dailyItinerary.length, 2);
  assert.equal(result.tripPlan.tips.length, 2);
});

test("planRouteStops plans one city at a time without overlapping departure days", async () => {
  const planInputs = [];
  const routePlan = {
    tripShape: "country_tour",
    totalDays: 8,
    stops: [
      { id: "tokyo", name: "Tokyo", displayName: "Tokyo", arrivalDate: "2026-11-01", departureDate: "2026-11-03", nights: 2, dayStart: 1, dayEnd: 2, role: "suggested" },
      { id: "kyoto", name: "Kyoto", displayName: "Kyoto", arrivalDate: "2026-11-03", departureDate: "2026-11-05", nights: 2, dayStart: 3, dayEnd: 4, role: "suggested" },
      { id: "osaka", name: "Osaka", displayName: "Osaka", arrivalDate: "2026-11-05", departureDate: "2026-11-07", nights: 2, dayStart: 5, dayEnd: 6, role: "suggested" },
      { id: "hakone", name: "Hakone", displayName: "Hakone", arrivalDate: "2026-11-07", departureDate: "2026-11-08", nights: 1, dayStart: 7, dayEnd: 8, role: "suggested" },
    ],
    transitLegs: [],
    warnings: [],
  };

  const result = await planRouteStops({
    routePlan,
    baseTrip: {
      activities: ["international"],
      children: [],
      pets: [],
      foodPreferences: null,
      plannerSummary: "",
    },
    geocodeLocationFn: async (name) => ({ lat: 35, lon: 139, displayName: `${name}, Japan`, countryCode: "JP" }),
    getWeatherForecastFn: async (lat, lon, countryCode, startDate, endDate) => ({ summary: `${startDate} to ${endDate}`, forecast: [{ date: startDate, high: 70, condition: "Clear" }] }),
    generateTripPlanChunkedFn: async (tripInput, weather, onChunk) => {
      planInputs.push({ destination: tripInput.destination, startDate: tripInput.startDate, endDate: tripInput.endDate, routeStop: tripInput.routeStop });
      const plan = {
        overview: `Plan for ${tripInput.destination}`,
        suggestedActivities: [
          { id: `${tripInput.destination}-a`, name: `${tripInput.destination} only activity`, category: "city", duration: "2 hours" },
        ],
        dailyItinerary: [
          { day: "Day 1", activities: [`${tripInput.destination}-a`], notes: "" },
          { day: "Day 2", activities: [`${tripInput.destination}-a`], notes: "" },
          { day: "Day 3", activities: [`${tripInput.destination}-a`], notes: "should be trimmed for non-overlap" },
        ],
        tips: [`Tip for ${tripInput.destination}`],
      };
      onChunk(plan, { chunk: 1, totalChunks: 1, dayOffset: 0 });
      return plan;
    },
    scheduleItineraryFn: (plan) => plan.dailyItinerary.map((day) => ({ ...day, scheduled: [] })),
  });

  assert.deepEqual(
    planInputs.map((input) => [input.destination, input.startDate, input.endDate]),
    [
      ["Tokyo", "2026-11-01", "2026-11-02"],
      ["Kyoto", "2026-11-03", "2026-11-04"],
      ["Osaka", "2026-11-05", "2026-11-06"],
      ["Hakone", "2026-11-07", "2026-11-08"],
    ],
  );
  assert.deepEqual(
    result.tripPlan.dailyItinerary.map((day) => day.day),
    [
      "Day 1: Tokyo",
      "Day 2: Tokyo",
      "Day 3: Kyoto",
      "Day 4: Kyoto",
      "Day 5: Osaka",
      "Day 6: Osaka",
      "Day 7: Hakone",
      "Day 8: Hakone",
    ],
  );
  assert.equal(result.tripPlan.dailyItinerary.length, routePlan.totalDays);
  assert.ok(planInputs.every((input) => input.routeStop?.name === input.destination));
});

test("planRouteStops passes prefetched attraction candidates to the matching stop", async () => {
  const cachedByStopId = {
    tokyo: [{ canonical_name: "Tokyo Disneyland", category: "theme_park" }],
    kyoto: [{ canonical_name: "Fushimi Inari", category: "culture" }],
  };
  const seen = {};
  const routePlan = {
    tripShape: "country_tour",
    totalDays: 4,
    stops: [
      { id: "tokyo", name: "Tokyo", arrivalDate: "2026-11-01", departureDate: "2026-11-03", nights: 2, dayStart: 1, dayEnd: 2, role: "suggested" },
      { id: "kyoto", name: "Kyoto", arrivalDate: "2026-11-03", departureDate: "2026-11-04", nights: 1, dayStart: 3, dayEnd: 4, role: "suggested" },
    ],
    transitLegs: [],
    warnings: [],
  };

  await planRouteStops({
    routePlan,
    baseTrip: {
      activities: ["international"],
      children: [],
      pets: [],
      cachedAttractionsByStopId: cachedByStopId,
    },
    geocodeLocationFn: async (name) => ({ lat: 35, lon: 139, displayName: `${name}, Japan`, countryCode: "JP" }),
    getWeatherForecastFn: async () => ({ summary: "Clear", forecast: [] }),
    generateTripPlanChunkedFn: async (tripInput) => {
      seen[tripInput.routeStop.id] = tripInput.cachedAttractions;
      return {
        overview: tripInput.destination,
        suggestedActivities: [],
        dailyItinerary: [{ day: "Day 1", activities: [], notes: "" }],
        tips: [],
      };
    },
    scheduleItineraryFn: (plan) => plan.dailyItinerary,
  });

  assert.deepEqual(seen.tokyo, cachedByStopId.tokyo);
  assert.deepEqual(seen.kyoto, cachedByStopId.kyoto);
});
