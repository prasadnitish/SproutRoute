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

const popularRouteCases = [
  {
    name: "Japan country tour",
    prompt: "2 weeks in Japan with food, trains, Tokyo, Kyoto, Osaka and Hakone",
    parsed: {
      destination: "Japan",
      suggestedDestinations: [],
      startDate: "2026-11-01",
      endDate: "2026-11-14",
      adults: 2,
      childrenAges: [],
      pets: [],
      vibe: "international",
      tripShape: "country_tour",
      stops: [
        { id: "tokyo", name: "Tokyo", role: "suggested" },
        { id: "kyoto", name: "Kyoto", role: "suggested" },
        { id: "osaka", name: "Osaka", role: "suggested" },
        { id: "hakone", name: "Hakone", role: "suggested" },
      ],
      countryTour: {
        country: "Japan",
        countryCode: "JP",
        requestedRegions: ["Tokyo", "Kyoto", "Osaka", "Hakone"],
        suggestedStopCount: 4,
      },
    },
    heading: /Japan route/i,
    stops: ["Tokyo", "Kyoto", "Osaka", "Hakone"],
  },
  {
    name: "plain Japan country prompt",
    prompt: "trip to Japan",
    parsed: {
      destination: "Japan",
      suggestedDestinations: [],
      startDate: "2026-11-01",
      endDate: "2026-11-08",
      adults: 2,
      childrenAges: [],
      pets: [],
      vibe: "international",
      tripShape: "country_tour",
      stops: [
        { id: "tokyo", name: "Tokyo", countryCode: "JP", role: "suggested" },
        { id: "kyoto", name: "Kyoto", countryCode: "JP", role: "suggested" },
        { id: "osaka", name: "Osaka", countryCode: "JP", role: "suggested" },
        { id: "hakone", name: "Hakone", countryCode: "JP", role: "suggested" },
      ],
      countryTour: {
        country: "Japan",
        countryCode: "JP",
        requestedRegions: ["Tokyo", "Kyoto", "Osaka", "Hakone"],
        suggestedStopCount: 4,
      },
    },
    heading: /Japan route/i,
    stops: ["Tokyo", "Kyoto", "Osaka", "Hakone"],
  },
  {
    name: "Europe friend trip",
    prompt: "Europe trip with best friend cover Amsterdam, Greece, Berlin, Budapest in 10 days",
    parsed: {
      destination: "Europe multi-city trip",
      suggestedDestinations: [],
      startDate: "2026-06-01",
      endDate: "2026-06-10",
      adults: 2,
      childrenAges: [],
      pets: [],
      vibe: "international",
      tripShape: "multi_stop",
      stops: [
        { id: "amsterdam", name: "Amsterdam", role: "must_visit" },
        { id: "greece", name: "Greece", role: "must_visit", notes: ["Broad region; confirm exact city"] },
        { id: "berlin", name: "Berlin", role: "must_visit" },
        { id: "budapest", name: "Budapest", role: "must_visit" },
      ],
      countryTour: null,
    },
    heading: /multi-stop route/i,
    stops: ["Amsterdam", "Greece", "Berlin", "Budapest"],
    warning: /Greece: Broad region/i,
  },
  {
    name: "Italy classic route",
    prompt: "Italy in 12 days cover Rome Florence Venice and Milan",
    parsed: {
      destination: "Italy multi-city trip",
      suggestedDestinations: [],
      startDate: "2026-09-01",
      endDate: "2026-09-12",
      adults: 2,
      childrenAges: [],
      pets: [],
      vibe: "international",
      tripShape: "multi_stop",
      stops: [
        { id: "rome", name: "Rome", role: "must_visit" },
        { id: "florence", name: "Florence", role: "must_visit" },
        { id: "venice", name: "Venice", role: "must_visit" },
        { id: "milan", name: "Milan", role: "must_visit" },
      ],
      countryTour: null,
    },
    heading: /multi-stop route/i,
    stops: ["Rome", "Florence", "Venice", "Milan"],
  },
];

for (const routeCase of popularRouteCases) {
  test(`popular multi-hop route review: ${routeCase.name}`, async ({ page }) => {
    await mockAllApis(page);
    await page.route("**/api/v1/trip/parse-input", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(routeCase.parsed),
      }),
    );

    await page.goto("/");
    await page.locator("textarea").fill(routeCase.prompt);
    await page.getByRole("button", { name: /plan it/i }).click();

    await expect(page.getByRole("heading", { name: routeCase.heading })).toBeVisible();
    for (const [index, stop] of routeCase.stops.entries()) {
      await expect(page.locator(`input[aria-label="Stop ${index + 1} name"]`)).toHaveValue(stop);
    }
    if (routeCase.warning) {
      await expect(page.getByText(routeCase.warning)).toBeVisible();
    }
  });
}
