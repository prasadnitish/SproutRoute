import { test, expect } from "@playwright/test";

test.describe("Input Flow", () => {
  test.beforeEach(async ({ page }) => {
    // Mock parse-input API
    await page.route("**/api/v1/trip/parse-input", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          destination: "Maui, Hawaii",
          startDate: "2026-04-12",
          endDate: "2026-04-19",
          adults: 2,
          childrenAges: [4, 8],
          vibe: "beach",
          suggestedDestinations: [],
          detectedRegion: null,
        }),
      });
    });

    await page.route("**/api/trip-plan", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          trip: {
            destination: "Maui, Hawaii",
            startDate: "2026-04-12",
            endDate: "2026-04-19",
          },
          weather: {
            forecast: [{ date: "2026-04-12", high: 76, low: 68, condition: "Sunny" }],
            summary: "Expect warm weather.",
          },
          itinerary: {
            dailyItinerary: [{
              day: 1,
              date: "2026-04-12",
              activities: [{
                name: "Road to Hana",
                time: "9:00 AM",
                description: "Scenic drive with waterfalls",
                category: "scenic",
                tags: ["scenic", "kid-friendly"],
              }],
            }],
          },
        }),
      });
    });

    await page.route("**/api/generate", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ categories: [] }),
      });
    });

    await page.route("**/api/safety/**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({}),
      });
    });

    // Mock geo detect (prevent real IP lookup)
    await page.route("**/api/v1/geo/detect", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ lat: 41.8781, lon: -87.6298, region: "Chicago, IL" }),
      });
    });
  });

  test("shows input screen with textarea and chips", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("textarea")).toBeVisible();
    await expect(page.getByRole("button", { name: /plan it/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /beach trip/i })).toBeVisible();
  });

  test("types trip idea and sees generating screen", async ({ page }) => {
    await page.goto("/");
    const textarea = page.locator("textarea");
    await textarea.fill("Beach vacation in Maui with kids age 4 and 8");
    await page.getByRole("button", { name: /plan it/i }).click();
    await expect(page.getByText("Building your trip plan")).toBeVisible({ timeout: 5000 });
    await expect(page.getByText("Maui, Hawaii")).toBeVisible();
  });

  test("transitions to results screen after generation", async ({ page }) => {
    await page.goto("/");
    await page.locator("textarea").fill("Beach vacation in Maui with kids age 4 and 8");
    await page.getByRole("button", { name: /plan it/i }).click();
    // Wait for results (all mocked APIs return instantly)
    await expect(page.getByText("Road to Hana")).toBeVisible({ timeout: 15000 });
  });
});
