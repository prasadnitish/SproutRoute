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
  await expect(page.getByRole("region", { name: /route map multi-stop route/i })).toBeVisible();
  await expect(page.locator('input[aria-label="Stop 1 name"]')).toHaveValue("Amsterdam");
  await expect(page.locator('input[aria-label="Stop 2 name"]')).toHaveValue("Berlin");

  await page.getByRole("button", { name: /continue/i }).click();

  await expect(page.getByRole("heading", { name: /Amsterdam to Berlin/i })).toBeVisible({ timeout: 10000 });
  await expect(page.getByText("Amsterdam Museum").first()).toBeVisible();
  await expect(page.getByText("Berlin").first()).toBeVisible();
});

test("route results day map falls back to the active route stop when activities lack coordinates", async ({ page }) => {
  const routePlanWithCoords = {
    ...routePlan,
    stops: routePlan.stops.map((stop) => ({ ...stop })),
  };
  const scheduledItinerary = [
    {
      day: "Day 1: Amsterdam",
      stopId: "amsterdam",
      stopName: "Amsterdam",
      routeDay: 1,
      scheduled: [
        {
          id: "ams-museum",
          name: "Amsterdam Museum",
          category: "museum",
          scheduledStart: "10:00 AM",
          scheduledEnd: "12:00 PM",
          duration: 120,
          status: "scheduled",
          enriched: null,
        },
      ],
      warnings: [],
      routeMeta: {
        orderedBy: "input",
        mappedStopCount: 0,
        totalDistanceMiles: 0,
        totalTravelMinutes: 0,
      },
    },
  ];

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
      body: [
        `event: route\ndata: ${JSON.stringify({
          routePlan: routePlanWithCoords,
          trip: {
            destination: "Europe multi-city trip",
            startDate: "2026-06-01",
            endDate: "2026-06-05",
            duration: 5,
            activities: ["international"],
            children: [],
            pets: [],
          },
        })}\n`,
        `event: stop-itinerary\ndata: ${JSON.stringify({
          stop: routePlanWithCoords.stops[0],
          tripPlan: {
            overview: "Amsterdam first.",
            suggestedActivities: [{ id: "ams-museum", name: "Amsterdam Museum", category: "museum" }],
            dailyItinerary: [{ day: "Day 1: Amsterdam", activities: ["ams-museum"] }],
            tips: [],
          },
          scheduledItinerary,
        })}\n`,
        `event: done\ndata: ${JSON.stringify({
          trip: { destination: "Europe multi-city trip" },
          routePlan: routePlanWithCoords,
          tripPlan: {
            overview: "Amsterdam first.",
            suggestedActivities: [{ id: "ams-museum", name: "Amsterdam Museum", category: "museum" }],
            dailyItinerary: [{ day: "Day 1: Amsterdam", activities: ["ams-museum"] }],
            tips: [],
          },
        })}\n`,
      ].join("\n"),
    }),
  );

  await page.goto("/");
  await page.locator("textarea").fill("Europe trip with best friend cover Amsterdam and Berlin in 5 days");
  await page.getByRole("button", { name: /plan it/i }).click();
  await page.getByRole("button", { name: /continue/i }).click();

  await expect(page.getByRole("region", { name: /day map day 1 route/i })).toBeVisible();
  await expect(page.getByText("Map appears once we have coordinates.")).not.toBeVisible();
  const dayMapIframe = page.getByRole("region", { name: /day map day 1 route/i }).locator("iframe");
  await expect(dayMapIframe).toBeVisible();
  const src = await dayMapIframe.getAttribute("src");
  expect(src).toContain("52.37");
  expect(src).toContain("4.9");
});

test("route review prefetches city ideas and sends reordered stops on continue", async ({ page }) => {
  let prefetchRequests = 0;
  let streamPayload: any = null;
  await mockAllApis(page);
  await page.route("**/api/v1/trip/parse-input", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
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
        ],
        countryTour: {
          country: "Japan",
          countryCode: "JP",
          requestedRegions: ["Tokyo", "Kyoto", "Osaka"],
          suggestedStopCount: 3,
        },
      }),
    }),
  );
  await page.route("**/api/v1/trip/route-attractions", async (route) => {
    prefetchRequests += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        tripRequestId: "mock-trip",
        statusByStopId: { tokyo: "ready", kyoto: "ready", osaka: "ready" },
        attractionsByStopId: {
          tokyo: [{ canonical_name: "Tokyo Disneyland", category: "theme_park" }],
          kyoto: [{ canonical_name: "Fushimi Inari", category: "culture" }],
          osaka: [{ canonical_name: "Dotonbori", category: "city" }],
        },
      }),
    });
  });
  await page.route("**/api/v1/trip/stream", async (route) => {
    streamPayload = route.request().postDataJSON();
    await route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body: routeSseBody(),
    });
  });

  await page.goto("/");
  await page.locator("textarea").fill("trip to Japan");
  await page.getByRole("button", { name: /plan it/i }).click();

  await expect(page.getByRole("heading", { name: /Japan route/i })).toBeVisible();
  await expect(page.getByRole("region", { name: /route map Japan route/i })).toBeVisible();
  await expect.poll(() => prefetchRequests).toBe(1);
  await expect(page.getByText(/ideas ready/i)).toBeVisible();

  await page.getByRole("button", { name: /move Osaka up/i }).click();
  await expect(page.locator('input[aria-label="Stop 2 name"]')).toHaveValue("Osaka");
  await page.getByRole("button", { name: /continue/i }).click();

  await expect.poll(() => streamPayload?.stops?.map((stop: any) => stop.name).join(" > ")).toBe("Tokyo > Osaka > Kyoto");
  expect(streamPayload.prefetchedAttractionsByStopId.osaka[0].canonical_name).toBe("Dotonbori");
});

test("blanket Europe prompt shows route bundles and selectable city candidates", async ({ page }) => {
  let streamPayload: any = null;
  await mockAllApis(page);
  await page.route("**/api/v1/trip/parse-input", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        destination: "Europe",
        suggestedDestinations: [],
        startDate: "2026-06-01",
        endDate: "2026-06-10",
        adults: 2,
        childrenAges: [],
        pets: [],
        vibe: "international",
        tripShape: "country_tour",
        stops: [
          { id: "amsterdam", name: "Amsterdam", role: "suggested" },
          { id: "berlin", name: "Berlin", role: "suggested" },
          { id: "budapest", name: "Budapest", role: "suggested" },
          { id: "prague", name: "Prague", role: "suggested" },
          { id: "vienna", name: "Vienna", role: "suggested" },
          { id: "athens", name: "Athens", role: "suggested" },
          { id: "barcelona", name: "Barcelona", role: "suggested" },
        ],
        countryTour: {
          country: "Europe",
          countryCode: null,
          requestedRegions: [],
          suggestedStopCount: 5,
        },
      }),
    }),
  );
  await page.route("**/api/v1/trip/stream", async (route) => {
    streamPayload = route.request().postDataJSON();
    await route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body: routeSseBody(),
    });
  });

  await page.goto("/");
  await page.locator("textarea").fill("Europe for 10 days with my best friend");
  await page.getByRole("button", { name: /plan it/i }).click();

  await expect(page.getByRole("heading", { name: /Europe route/i })).toBeVisible();
  await expect(page.getByRole("region", { name: /route map Europe route/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /relaxed/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /balanced/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /ambitious/i })).toBeVisible();
  await expect(page.getByLabel(/include Prague/i)).toBeVisible();

  await page.getByRole("button", { name: /ambitious/i }).click();
  await page.getByLabel(/include Athens/i).uncheck();
  await page.getByLabel(/include Prague/i).check();
  await page.getByRole("button", { name: /continue/i }).click();

  await expect.poll(() => streamPayload?.stops?.length).toBeGreaterThan(3);
  await expect.poll(() => streamPayload?.stops?.some((stop: any) => stop.name === "Prague")).toBe(true);
  await expect.poll(() => streamPayload?.stops?.some((stop: any) => stop.name === "Athens")).toBe(false);
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
  {
    name: "USA family road trip",
    prompt: "USA road trip with a 5 year old next summer",
    parsed: {
      destination: "United States",
      suggestedDestinations: [],
      startDate: "2026-07-01",
      endDate: "2026-07-12",
      adults: 2,
      childrenAges: [5],
      pets: [],
      vibe: "adventure",
      tripShape: "country_tour",
      stops: [
        { id: "san-francisco", name: "San Francisco", countryCode: "US", role: "suggested" },
        { id: "monterey", name: "Monterey", countryCode: "US", role: "suggested" },
        { id: "los-angeles", name: "Los Angeles", countryCode: "US", role: "suggested" },
        { id: "san-diego", name: "San Diego", countryCode: "US", role: "suggested" },
      ],
      countryTour: {
        country: "United States",
        countryCode: "US",
        requestedRegions: ["California"],
        suggestedStopCount: 4,
      },
    },
    heading: /United States route/i,
    stops: ["San Francisco", "Monterey", "Los Angeles", "San Diego"],
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
      const stopInput = page.locator(`input[aria-label="Stop ${index + 1} name"]`);
      if (await stopInput.count()) {
        await expect(stopInput).toHaveValue(stop);
      } else {
        await expect(page.getByLabel(`Include ${stop}`)).toBeVisible();
      }
    }
    if (routeCase.warning) {
      await expect(page.getByText(routeCase.warning)).toBeVisible();
    }
  });
}
