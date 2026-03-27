import { test, expect } from "@playwright/test";

test.describe("Generic Input Flow", () => {
  test("shows destination picker for vague input", async ({ page }) => {
    await page.route("**/api/v1/trip/parse-input", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          destination: null,
          suggestedDestinations: [
            { name: "Maui, Hawaii", emoji: "\uD83C\uDF34", description: "Stunning beaches", season_note: "Perfect spring weather" },
            { name: "Cancun, Mexico", emoji: "\uD83C\uDFD6", description: "All-inclusive resorts", season_note: "Warm and sunny" },
            { name: "San Diego, CA", emoji: "\u2600\uFE0F", description: "Family-friendly coast", season_note: "Mild spring temps" },
          ],
          startDate: "2026-04-12",
          endDate: "2026-04-19",
          adults: 2,
          childrenAges: [],
          vibe: "beach",
          detectedRegion: null,
        }),
      });
    });

    await page.route("**/api/v1/geo/detect", async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ lat: null, lon: null, region: null }) });
    });

    await page.goto("/");
    await page.locator("textarea").fill("beach trip for spring break");
    await page.getByRole("button", { name: /plan it/i }).click();

    // Should show destination picker with 3 options
    await expect(page.getByText("Maui, Hawaii")).toBeVisible({ timeout: 5000 });
    await expect(page.getByText("Cancun, Mexico")).toBeVisible();
    await expect(page.getByText("San Diego, CA")).toBeVisible();
  });
});
