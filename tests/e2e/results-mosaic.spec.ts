import { test, expect } from "@playwright/test";

const MOCK_TRIP = {
  trip: {
    destination: "Maui, Hawaii",
    startDate: "2026-04-12",
    endDate: "2026-04-19",
  },
  weather: {
    forecast: [
      { date: "2026-04-12", high: 76, low: 68, condition: "Sunny" },
      { date: "2026-04-13", high: 75, low: 67, condition: "Partly cloudy" },
    ],
    summary: "Expect warm weather.",
  },
  itinerary: {
    dailyItinerary: [
      {
        day: 1,
        date: "2026-04-12",
        activities: [
          { name: "Road to Hana", time: "9:00 AM", description: "Scenic drive with waterfalls", category: "scenic", tags: ["scenic", "kid-friendly"] },
          { name: "Mama's Fish House", time: "6:30 PM", description: "Iconic oceanfront restaurant", category: "restaurant", tags: ["dinner"] },
        ],
      },
      {
        day: 2,
        date: "2026-04-13",
        activities: [
          { name: "Snorkeling at Molokini", time: "9:00 AM", description: "Great for kids", category: "water", tags: ["water"] },
        ],
      },
    ],
  },
};

test.describe("Results Mosaic", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/api/v1/trip/parse-input", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          destination: "Maui, Hawaii",
          suggestedDestinations: [],
          startDate: "2026-04-12",
          endDate: "2026-04-19",
          adults: 2,
          childrenAges: [4, 8],
          vibe: "beach",
          detectedRegion: null,
        }),
      });
    });
    await page.route("**/api/trip-plan", async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(MOCK_TRIP) });
    });
    await page.route("**/api/generate", async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ categories: [{ name: "Beach", items: [{ name: "Sunscreen" }] }] }) });
    });
    await page.route("**/api/safety/**", async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ state: "HI", rules: [{ age: "under 4", requirement: "rear-facing" }] }) });
    });
    await page.route("**/api/v1/places/enrich", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          placeId: "ChIJ123",
          name: "Road to Hana",
          rating: 4.8,
          userRatingsTotal: 2847,
          address: "Hana Hwy, Maui, HI",
          phone: "(808) 984-8109",
          photos: [],
          mapsUrl: "https://maps.google.com",
        }),
      });
    });
    await page.route("**/api/v1/geo/detect", async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ lat: null, lon: null, region: null }) });
    });

    // Navigate through input -> generating -> results
    await page.goto("/");
    await page.locator("textarea").fill("Beach trip to Maui with kids age 4 and 8");
    await page.getByRole("button", { name: /plan it/i }).click();
  });

  test("renders hero tile with destination", async ({ page }) => {
    await expect(page.getByText("Maui, Hawaii")).toBeVisible({ timeout: 15000 });
  });

  test("renders itinerary with activities", async ({ page }) => {
    await expect(page.getByText("Road to Hana")).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("Mama's Fish House")).toBeVisible();
  });

  test("renders weather tile with forecast", async ({ page }) => {
    // The big temperature display: "76°" in the hero weather span
    await expect(page.locator("span").filter({ hasText: /^76°$/ })).toBeVisible({ timeout: 15000 });
  });
});
