import { test, expect } from "@playwright/test";
import { mockAllApis, goToResults, overrideSSE, buildSSEBody } from "../fixtures/mock-api";
import { MOCK_TRIP_PLAN } from "../fixtures/trip-data";

test.describe("ItineraryTile", () => {
  test.beforeEach(async ({ page }) => {
    await mockAllApis(page);
    await goToResults(page);
  });

  test("renders day tabs", async ({ page }) => {
    await expect(page.getByRole("button", { name: /apr 12/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /apr 13/i })).toBeVisible();
  });

  test("day 1 activities are visible by default", async ({ page }) => {
    await expect(page.getByText("Road to Hana").first()).toBeVisible();
  });

  test("switching to day 2 shows day 2 activities", async ({ page }) => {
    await page.getByRole("button", { name: /apr 13/i }).click();
    await expect(page.getByText("Snorkeling at Molokini").first()).toBeVisible();
    await expect(page.getByText("Road to Hana")).not.toBeVisible();
  });

  test("renders scheduled start time", async ({ page }) => {
    await expect(page.getByText("9:00 AM").first()).toBeVisible();
  });

  test("renders star rating for enriched activity", async ({ page }) => {
    await expect(page.getByText("4.8")).toBeVisible();
  });

  test("renders price level for enriched activity", async ({ page }) => {
    // priceLevel: 1 renders as "$" in PriceLevel component (exact match avoids matching "$$$")
    await expect(page.getByText("$", { exact: true }).first()).toBeVisible();
  });

  test("renders photo thumbnail when enriched.photos is set", async ({ page }) => {
    const img = page.locator("img[alt='Road to Hana']");
    await expect(img).toBeVisible();
  });

  test("renders closed activity warning", async ({ page }) => {
    // Day-level warning: "1 activity(ies) closed on this day" (strict mode: use first())
    await expect(page.getByText(/closed on this day/i).first()).toBeVisible();
  });

  test("renders dinner meal card with cuisine badge", async ({ page }) => {
    await expect(page.getByText("Mama's Fish House").first()).toBeVisible();
    await expect(page.getByText("Seafood").first()).toBeVisible();
  });

  test("renders meal note", async ({ page }) => {
    await expect(page.getByText("Iconic oceanfront")).toBeVisible();
  });

  test("renders activity address", async ({ page }) => {
    await expect(page.getByText(/Hana Hwy/i, { exact: false })).toBeVisible();
  });

  test("renders tap-for-details hint", async ({ page }) => {
    // Renders "↑ Tap any activity for details"
    await expect(page.getByText(/tap any activity/i, { exact: false })).toBeVisible();
  });

  test("shows empty state when no itinerary data", async ({ page }) => {
    // Override SSE stream to return empty itinerary
    await overrideSSE(page, {
      body: buildSSEBody({
        scheduledItinerary: [],
        tripPlan: { ...MOCK_TRIP_PLAN.tripPlan, dailyItinerary: [] },
      }),
    });
    await page.goto("/");
    await page.locator("textarea").fill("Beach vacation in Maui with kids age 4 and 8");
    await page.getByRole("button", { name: /plan it/i }).click();
    await page.getByRole("heading", { name: /Maui, Hawaii/i }).waitFor({ timeout: 15000 });
    // ItineraryTile renders "No itinerary data yet" when days is empty
    await expect(page.getByText(/no itinerary data/i, { exact: false })).toBeVisible();
  });
});
