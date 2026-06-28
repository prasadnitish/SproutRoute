import { test, expect } from "@playwright/test";
import { mockAllApis, goToResults, overrideSSE, buildSSEBody } from "../fixtures/mock-api";
import { MOCK_TRIP_PLAN } from "../fixtures/trip-data";

test.describe("MapTile", () => {
  test.beforeEach(async ({ page }) => {
    await mockAllApis(page);
    await goToResults(page);
  });

  test("renders a Leaflet map", async ({ page }) => {
    await expect(page.getByText(/map/i).first()).toBeVisible();
    await expect(page.locator(".leaflet-container").first()).toBeVisible();
  });

  test("Google Maps link contains trip coordinates", async ({ page }) => {
    await expect(page.getByRole("link", { name: /explore on google maps/i })).toHaveAttribute(
      "href",
      /20\.7984,-156\.3319/,
    );
  });

  test("renders without crashing when lat/lon are null", async ({ page }) => {
    // Override SSE stream to return null coordinates
    await overrideSSE(page, {
      body: buildSSEBody({
        trip: { ...MOCK_TRIP_PLAN.trip, lat: null, lon: null },
      }),
    });
    await page.goto("/");
    await page.locator("textarea").fill("Beach vacation in Maui with kids age 4 and 8");
    await page.getByRole("button", { name: /plan it/i }).click();
    await page.getByRole("heading", { name: /Maui, Hawaii/i }).waitFor({ timeout: 15000 });
    await expect(page.getByText(/map/i).first()).toBeVisible();
    await expect(page.locator("body")).not.toContainText("TypeError");
  });
});
