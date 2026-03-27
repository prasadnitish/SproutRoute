import { test, expect } from "@playwright/test";
import { mockAllApis, goToResults } from "../fixtures/mock-api";
import { MOCK_TRIP_PLAN } from "../fixtures/trip-data";

test.describe("MapTile", () => {
  test.beforeEach(async ({ page }) => {
    await mockAllApis(page);
    await goToResults(page);
  });

  test("renders an iframe", async ({ page }) => {
    await expect(page.locator("iframe")).toBeVisible();
  });

  test("iframe src contains trip coordinates", async ({ page }) => {
    const iframe = page.locator("iframe").first();
    const src = await iframe.getAttribute("src");
    expect(src).toContain("20.7984");
    expect(src).toContain("156.3319");
  });

  test("renders without crashing when lat/lon are null", async ({ page }) => {
    await page.route("**/api/trip-plan", (r) =>
      r.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ...MOCK_TRIP_PLAN,
          trip: { ...MOCK_TRIP_PLAN.trip, lat: null, lon: null },
        }),
      })
    );
    await page.goto("/");
    await page.locator("textarea").fill("Beach vacation in Maui with kids age 4 and 8");
    await page.getByRole("button", { name: /plan it/i }).click();
    await page.getByRole("heading", { name: /Maui, Hawaii/i }).waitFor({ timeout: 15000 });
    await expect(page.locator("body")).not.toContainText("TypeError");
  });
});
