import { test, expect } from "@playwright/test";
import { mockAllApis, goToResults, overrideSSE, buildSSEBody } from "../fixtures/mock-api";
import { MOCK_TRIP_PLAN } from "../fixtures/trip-data";

test.describe("MapTile", () => {
  test.beforeEach(async ({ page }) => {
    await mockAllApis(page);
    await goToResults(page);
  });

  test("renders the premium day map", async ({ page }) => {
    await expect(page.getByRole("region", { name: /day map day 1 route/i })).toBeVisible();
    await expect(page.getByText(/mapped travel/i)).toBeVisible();
    await expect(page.locator("iframe").first()).toBeVisible();
  });

  test("iframe src contains mapped day coordinates", async ({ page }) => {
    const iframe = page.locator("iframe").first();
    const src = await iframe.getAttribute("src");
    expect(src).toContain("maps.google.com");
    expect(src).toContain("20.7984");
    expect(src).toContain("156.3319");
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
    await expect(page.locator("body")).not.toContainText("TypeError");
  });

  test("renders hostile destination text without executing markup", async ({ page }) => {
    const hostileDestination = `<img src=x onerror="window.__mapXss = true">Maui`;
    await overrideSSE(page, {
      body: buildSSEBody({
        trip: { ...MOCK_TRIP_PLAN.trip, destination: hostileDestination },
      }),
    });

    await page.goto("/");
    await page.locator("textarea").fill("Beach vacation in Maui with kids age 4 and 8");
    await page.getByRole("button", { name: /plan it/i }).click();
    await page.getByRole("region", { name: /day map day 1 route/i }).waitFor({ timeout: 15000 });

    await expect(page.locator("img[src='x']")).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => Boolean((window as typeof window & { __mapXss?: boolean }).__mapXss)))
      .toBe(false);
  });
});
