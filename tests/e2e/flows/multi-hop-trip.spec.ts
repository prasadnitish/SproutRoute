import { test, expect } from "@playwright/test";
import { mockAllApis } from "../fixtures/mock-api";

const routePlan = {
  tripShape: "multi_stop",
  title: "Amsterdam to Berlin",
  totalDays: 5,
  optimizationMode: "user_order",
  warnings: [],
  confidence: "high",
  stops: [
    {
      id: "amsterdam",
      name: "Amsterdam",
      displayName: "Amsterdam",
      countryCode: "NL",
      regionCode: null,
      lat: 52.37,
      lon: 4.9,
      arrivalDate: "2026-06-01",
      departureDate: "2026-06-03",
      nights: 2,
      dayStart: 1,
      dayEnd: 2,
      role: "must_visit",
    },
    {
      id: "berlin",
      name: "Berlin",
      displayName: "Berlin",
      countryCode: "DE",
      regionCode: null,
      lat: 52.52,
      lon: 13.4,
      arrivalDate: "2026-06-03",
      departureDate: "2026-06-05",
      nights: 2,
      dayStart: 3,
      dayEnd: 5,
      role: "must_visit",
    },
  ],
  transitLegs: [
    { fromStopId: "amsterdam", toStopId: "berlin", mode: "train", estimatedHours: 6.5 },
  ],
};

function routeSseBody() {
  const trip = {
    destination: "Europe multi-city trip",
    startDate: "2026-06-01",
    endDate: "2026-06-05",
    duration: 5,
    activities: ["international"],
    children: [],
    pets: [],
  };
  const amsterdamPlan = {
    overview: "Amsterdam canals and museums.",
    suggestedActivities: [{ id: "ams-museum", name: "Amsterdam Museum", category: "museum", description: "City history" }],
    dailyItinerary: [{ day: "Day 1", activities: ["ams-museum"], notes: "Canal district first." }],
    tips: ["Book timed museum tickets."],
  };
  const berlinPlan = {
    overview: "Berlin history and food.",
    suggestedActivities: [{ id: "berlin-wall", name: "Berlin Wall Memorial", category: "history", description: "Cold War history" }],
    dailyItinerary: [{ day: "Day 3", activities: ["berlin-wall"], notes: "Use transit day lightly." }],
    tips: ["Validate train tickets."],
  };
  const mergedPlan = {
    overview: "A two-stop Europe route.",
    suggestedActivities: [...amsterdamPlan.suggestedActivities, ...berlinPlan.suggestedActivities],
    dailyItinerary: [...amsterdamPlan.dailyItinerary, ...berlinPlan.dailyItinerary],
    tips: [...amsterdamPlan.tips, ...berlinPlan.tips],
  };
  const stopWeather = {
    amsterdam: { summary: "Mild", forecast: [{ date: "2026-06-01", high: 68, condition: "Cloudy" }] },
    berlin: { summary: "Sunny", forecast: [{ date: "2026-06-03", high: 72, condition: "Sunny" }] },
  };

  return [
    `event: route\ndata: ${JSON.stringify({ routePlan, trip })}\n`,
    `event: stop-weather\ndata: ${JSON.stringify({ stop: routePlan.stops[0], weather: stopWeather.amsterdam })}\n`,
    `event: stop-itinerary\ndata: ${JSON.stringify({ stop: routePlan.stops[0], tripPlan: amsterdamPlan })}\n`,
    `event: stop-weather\ndata: ${JSON.stringify({ stop: routePlan.stops[1], weather: stopWeather.berlin })}\n`,
    `event: stop-itinerary\ndata: ${JSON.stringify({ stop: routePlan.stops[1], tripPlan: berlinPlan })}\n`,
    `event: done\ndata: ${JSON.stringify({ trip, routePlan, stopWeather, stopItineraries: { amsterdam: amsterdamPlan, berlin: berlinPlan }, tripPlan: mergedPlan })}\n`,
  ].join("\n");
}

test("multi-hop trip shows route review before streaming route-aware results", async ({ page }) => {
  await mockAllApis(page);
  await page.route("**/api/v1/trip/parse-input", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        destination: "Europe multi-city trip",
        suggestedDestinations: [],
        startDate: "2026-06-01",
        endDate: "2026-06-05",
        adults: 2,
        childrenAges: [],
        pets: [],
        vibe: "international",
        tripShape: "multi_stop",
        stops: [
          { id: "amsterdam", name: "Amsterdam", role: "must_visit" },
          { id: "berlin", name: "Berlin", role: "must_visit" },
        ],
        countryTour: null,
      }),
    }),
  );
  await page.route("**/api/v1/trip/stream", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body: routeSseBody(),
    }),
  );

  await page.goto("/");
  await page.locator("textarea").fill("Europe trip with best friend cover Amsterdam and Berlin in 5 days");
  await page.getByRole("button", { name: /plan it/i }).click();

  await expect(page.getByRole("heading", { name: /multi-stop route/i })).toBeVisible();
  await expect(page.locator('input[aria-label="Stop 1 name"]')).toHaveValue("Amsterdam");
  await expect(page.locator('input[aria-label="Stop 2 name"]')).toHaveValue("Berlin");

  await page.getByRole("button", { name: /continue/i }).click();

  await expect(page.getByRole("heading", { name: /Amsterdam to Berlin/i })).toBeVisible({ timeout: 10000 });
  await expect(page.getByText("Amsterdam Museum")).toBeVisible();
  await expect(page.getByText("Berlin").first()).toBeVisible();
});
