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
