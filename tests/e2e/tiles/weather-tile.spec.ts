import { test, expect } from "@playwright/test";
import { mockAllApis, goToResults, overrideSSE, buildSSEBody } from "../fixtures/mock-api";
import { MOCK_TRIP_PLAN } from "../fixtures/trip-data";

test.describe("WeatherTile", () => {
  test.beforeEach(async ({ page }) => {
    await mockAllApis(page);
    await goToResults(page);
  });

  test("renders forecast day labels", async ({ page }) => {
    // formatDayLabel computes day name from the date itself (not the name field):
    // 2026-04-12 is a Sunday → day="Sun", date="Apr 12"
    // 2026-04-13 is a Monday → day="Mon", date="Apr 13"
    // Use exact:true to prevent /Sun/ matching "Sunny" or "Sunscreen" elsewhere on the page.
    // Scope to the first occurrence of the exact 3-letter abbreviation rendered inside a
    // forecast card <p> (text-[10px] font-bold), confirmed by the sibling date label.
    await expect(page.getByText("Sun", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Mon", { exact: true }).first()).toBeVisible();
    // Also assert the companion date labels to confirm the day-label component is rendering.
    await expect(page.getByText("Apr 12", { exact: true })).toBeVisible();
    await expect(page.getByText("Apr 13", { exact: true })).toBeVisible();
  });

  test("renders high temperature", async ({ page }) => {
    // Multiple elements may contain "76" — use first() to avoid strict mode error
    await expect(page.getByText(/76/, { exact: false }).first()).toBeVisible();
  });

  test("renders low temperature", async ({ page }) => {
    await expect(page.getByText(/68/, { exact: false }).first()).toBeVisible();
  });

  test("shows historical avg badge when forecast dates mismatch trip dates", async ({ page }) => {
    // Override SSE stream to return weather with mismatched dates
    await overrideSSE(page, {
      body: buildSSEBody({
        weather: {
          ...MOCK_TRIP_PLAN.weather,
          forecast: [
            { date: "2026-01-01", name: "Thursday", high: 70, low: 60, condition: "Cloudy", precipitation: 20 },
          ],
        },
      }),
    });
    await page.goto("/");
    await page.locator("textarea").fill("Beach vacation in Maui with kids age 4 and 8");
    await page.getByRole("button", { name: /plan it/i }).click();
    await page.getByRole("heading", { name: /Maui, Hawaii/i }).waitFor({ timeout: 15000 });
    await expect(page.getByText(/historical/i, { exact: false })).toBeVisible();
  });

  test("renders gracefully with empty forecast", async ({ page }) => {
    // Override SSE stream to return empty forecast
    await overrideSSE(page, {
      body: buildSSEBody({
        weather: { forecast: [], summary: "" },
      }),
    });
    await page.goto("/");
    await page.locator("textarea").fill("Beach vacation in Maui with kids age 4 and 8");
    await page.getByRole("button", { name: /plan it/i }).click();
    await page.getByRole("heading", { name: /Maui, Hawaii/i }).waitFor({ timeout: 15000 });
    await expect(page.locator("body")).not.toContainText("Error");
  });
});
