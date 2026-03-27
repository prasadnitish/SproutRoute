import { test, expect } from "@playwright/test";
import { mockAllApis, goToResults } from "../fixtures/mock-api";
import { MOCK_TRIP_PLAN } from "../fixtures/trip-data";

test.describe("WeatherTile", () => {
  test.beforeEach(async ({ page }) => {
    await mockAllApis(page);
    await goToResults(page);
  });

  test("renders forecast day labels", async ({ page }) => {
    // formatDayLabel computes day name from the date itself (not the name field)
    // 2026-04-12 is a Sunday → "Sun"; 2026-04-13 is a Monday → "Mon"
    await expect(page.getByText(/Sun/, { exact: false }).first()).toBeVisible();
    await expect(page.getByText(/Mon/, { exact: false }).first()).toBeVisible();
  });

  test("renders high temperature", async ({ page }) => {
    // Multiple elements may contain "76" — use first() to avoid strict mode error
    await expect(page.getByText(/76/, { exact: false }).first()).toBeVisible();
  });

  test("renders low temperature", async ({ page }) => {
    await expect(page.getByText(/68/, { exact: false })).toBeVisible();
  });

  test("shows historical avg badge when forecast dates mismatch trip dates", async ({ page }) => {
    await page.route("**/api/trip-plan", (r) =>
      r.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ...MOCK_TRIP_PLAN,
          weather: {
            ...MOCK_TRIP_PLAN.weather,
            forecast: [
              { date: "2026-01-01", name: "Thursday", high: 70, low: 60, condition: "Cloudy", precipitation: 20 },
            ],
          },
        }),
      })
    );
    await page.goto("/");
    await page.locator("textarea").fill("Beach vacation in Maui with kids age 4 and 8");
    await page.getByRole("button", { name: /plan it/i }).click();
    await page.getByRole("heading", { name: /Maui, Hawaii/i }).waitFor({ timeout: 15000 });
    await expect(page.getByText(/historical/i, { exact: false })).toBeVisible();
  });

  test("renders gracefully with empty forecast", async ({ page }) => {
    await page.route("**/api/trip-plan", (r) =>
      r.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ...MOCK_TRIP_PLAN, weather: { forecast: [], summary: "" } }),
      })
    );
    await page.goto("/");
    await page.locator("textarea").fill("Beach vacation in Maui with kids age 4 and 8");
    await page.getByRole("button", { name: /plan it/i }).click();
    await page.getByRole("heading", { name: /Maui, Hawaii/i }).waitFor({ timeout: 15000 });
    await expect(page.locator("body")).not.toContainText("Error");
  });
});
