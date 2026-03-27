import { test, expect } from "@playwright/test";
import { mockAllApis } from "../fixtures/mock-api";
import { MOCK_TRIP_PLAN } from "../fixtures/trip-data";

test.describe("Error States", () => {
  test("parse-input 500 → error message shown", async ({ page }) => {
    await mockAllApis(page);
    await page.route("**/api/v1/trip/parse-input", (r) =>
      r.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "Server error" }) })
    );
    await page.goto("/");
    await page.locator("textarea").fill("Beach vacation in Maui");
    await page.getByRole("button", { name: /plan it/i }).click();
    await expect(page.getByText(/something went wrong/i)).toBeVisible({ timeout: 10000 });
  });

  test("trip-plan 500 → error message shown", async ({ page }) => {
    await mockAllApis(page);
    await page.route("**/api/trip-plan", (r) =>
      r.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "Server error" }) })
    );
    await page.goto("/");
    await page.locator("textarea").fill("Beach vacation in Maui");
    await page.getByRole("button", { name: /plan it/i }).click();
    await expect(page.getByText(/something went wrong/i)).toBeVisible({ timeout: 10000 });
  });

  test("trip-plan 429 → rate limit message shown", async ({ page }) => {
    await mockAllApis(page);
    await page.route("**/api/trip-plan", (r) =>
      r.fulfill({
        status: 429,
        contentType: "application/json",
        body: JSON.stringify({ error: "Too many requests. Please try again in 15 minutes." }),
      })
    );
    await page.goto("/");
    await page.locator("textarea").fill("Beach vacation in Maui");
    await page.getByRole("button", { name: /plan it/i }).click();
    await expect(page.getByText(/something went wrong|too many requests/i)).toBeVisible({ timeout: 10000 });
  });

  test("empty itinerary → 'No itinerary data yet' shown in tile", async ({ page }) => {
    await mockAllApis(page);
    await page.route("**/api/trip-plan", (r) =>
      r.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ...MOCK_TRIP_PLAN,
          scheduledItinerary: [],
          tripPlan: { ...MOCK_TRIP_PLAN.tripPlan, dailyItinerary: [] },
        }),
      })
    );
    await page.goto("/");
    await page.locator("textarea").fill("Beach vacation in Maui");
    await page.getByRole("button", { name: /plan it/i }).click();
    await page.getByRole("heading", { name: /Maui, Hawaii/i }).waitFor({ timeout: 15000 });
    await expect(page.getByText(/no itinerary data/i, { exact: false })).toBeVisible();
  });

  test("null safety data → safety tile renders without crash", async ({ page }) => {
    await mockAllApis(page);
    await page.route("**/api/safety/travel-tips", (r) =>
      r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({}) })
    );
    await page.goto("/");
    await page.locator("textarea").fill("Beach vacation in Maui");
    await page.getByRole("button", { name: /plan it/i }).click();
    await page.getByRole("heading", { name: /Maui, Hawaii/i }).waitFor({ timeout: 15000 });
    await expect(page.locator("body")).not.toContainText("TypeError");
  });
});
