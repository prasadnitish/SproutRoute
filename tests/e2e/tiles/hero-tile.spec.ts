import { test, expect } from "@playwright/test";
import { mockAllApis, goToResults } from "../fixtures/mock-api";
import { MOCK_TRIP_PLAN } from "../fixtures/trip-data";

test.describe("HeroTile", () => {
  test.beforeEach(async ({ page }) => {
    await mockAllApis(page);
    await goToResults(page);
  });

  test("renders destination name", async ({ page }) => {
    await expect(page.getByRole("heading", { name: /Maui, Hawaii/i })).toBeVisible();
  });

  test("renders human-readable dates (not ISO)", async ({ page }) => {
    // formatDate("2026-04-12") => "Apr 12", formatDate("2026-04-19") => "Apr 19"
    // The HeroTile renders "Apr 12 – Apr 19 · 7 days" in a <p> tag
    await expect(page.getByText(/Apr 12.*Apr 19/, { exact: false })).toBeVisible();
    // HeroTile itself must not render a raw ISO date — check inside the heading's parent section
    const heroHeading = page.getByRole("heading", { name: /Maui, Hawaii/i });
    const heroSection = heroHeading.locator("..");
    await expect(heroSection.getByText("2026-04-12", { exact: true })).not.toBeVisible();
  });

  test("renders multiple kids display", async ({ page }) => {
    // HeroTile renders "2 kids, ages 4 & 8" in the bottom summary line
    await expect(page.getByText(/2 kids/i, { exact: false })).toBeVisible();
  });

  test("no international badge for US destination", async ({ page }) => {
    // countryCode "US" renders "Domestic" chip, not "International"
    await expect(page.getByText(/international/i)).not.toBeVisible();
  });

  test("adults-only trip shows no kids line", async ({ page }) => {
    await page.route("**/api/v1/trip/parse-input", (r) =>
      r.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ destination: "Maui, Hawaii", startDate: "2026-04-12", endDate: "2026-04-19", adults: 2, childrenAges: [], vibe: "beach", suggestedDestinations: [] }),
      })
    );
    await page.route("**/api/trip-plan", (r) =>
      r.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ...MOCK_TRIP_PLAN, trip: { ...MOCK_TRIP_PLAN.trip, children: [] } }),
      })
    );
    await page.goto("/");
    await page.locator("textarea").fill("Adults trip to Maui");
    await page.getByRole("button", { name: /plan it/i }).click();
    await page.getByRole("heading", { name: /Maui, Hawaii/i }).waitFor({ timeout: 15000 });
    // Scope to the HeroTile: the bottom summary line should not contain "kid"
    const heroSection = page.getByRole("heading", { name: /Maui, Hawaii/i }).locator("../..");
    await expect(heroSection.getByText(/kid/i)).not.toBeVisible();
  });

  test("shows international badge for non-US destination", async ({ page }) => {
    // Override both parse-input and trip-plan to return Tokyo
    await page.route("**/api/v1/trip/parse-input", (r) =>
      r.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          destination: "Tokyo, Japan",
          startDate: "2026-04-12",
          endDate: "2026-04-19",
          adults: 2,
          childrenAges: [4, 8],
          vibe: "city",
          suggestedDestinations: [],
        }),
      })
    );
    await page.route("**/api/trip-plan", (r) =>
      r.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ...MOCK_TRIP_PLAN,
          trip: { ...MOCK_TRIP_PLAN.trip, destination: "Tokyo, Japan", countryCode: "JP", lat: 35.6762, lon: 139.6503 },
        }),
      })
    );
    await page.goto("/");
    await page.locator("textarea").fill("Family trip to Tokyo");
    await page.getByRole("button", { name: /plan it/i }).click();
    await page.getByRole("heading", { name: /Tokyo, Japan/i }).waitFor({ timeout: 15000 });
    await expect(page.getByText(/international/i)).toBeVisible();
  });

  test("renders single kid display", async ({ page }) => {
    await page.route("**/api/v1/trip/parse-input", (r) =>
      r.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ destination: "Maui, Hawaii", startDate: "2026-04-12", endDate: "2026-04-19", adults: 2, childrenAges: [5], vibe: "beach", suggestedDestinations: [] }),
      })
    );
    await page.route("**/api/trip-plan", (r) =>
      r.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ...MOCK_TRIP_PLAN, trip: { ...MOCK_TRIP_PLAN.trip, children: [{ age: 5 }] } }),
      })
    );
    await page.goto("/");
    await page.locator("textarea").fill("Maui trip");
    await page.getByRole("button", { name: /plan it/i }).click();
    await page.getByRole("heading", { name: /Maui, Hawaii/i }).waitFor({ timeout: 15000 });
    await expect(page.getByText(/1 kid/i, { exact: false })).toBeVisible();
  });
});
