import { test, expect } from "@playwright/test";
import { buildSSEBody, mockAllApis } from "../fixtures/mock-api";
import { MOCK_DESTINATIONS, MOCK_TRIP_PLAN } from "../fixtures/trip-data";

test.describe("Destination Picker — vague input triggers 3 suggestions", () => {
  test("resolved Las Vegas bypasses stale destination options", async ({ page }) => {
    await mockAllApis(page);
    await page.route("**/api/v1/trip/parse-input", r => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
      ...MOCK_DESTINATIONS, destination: "Las Vegas, Nevada",
    }) }));
    await page.route("**/api/v1/trip/stream", async r => {
      await new Promise(resolve => setTimeout(resolve, 1000));
      await r.fulfill({ status: 200, contentType: "text/event-stream", body: buildSSEBody({ trip: { ...MOCK_TRIP_PLAN.trip, destination: "Las Vegas, Nevada" } }) });
    });
    await page.goto("/");
    await page.locator("textarea").fill("trip to Las Vegas with my six-year-old");
    await page.getByRole("button", { name: /plan it/i }).click();
    await expect(page.getByText(/Building your trip plan/i)).toBeVisible();
    await expect(page.getByText("Cancun, Mexico")).not.toBeVisible();
    await expect(page.getByRole("heading", { name: /Las Vegas, Nevada/i, level: 2 })).toBeVisible();
  });
  test("shows 3 destination cards, picks one, loads results", async ({ page }) => {
    await mockAllApis(page);

    // Override parse-input to return no destination + 3 suggestions
    await page.route("**/api/v1/trip/parse-input", (r) =>
      r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(MOCK_DESTINATIONS) })
    );

    await page.goto("/");
    await page.locator("textarea").fill("beach trip for spring break");
    await page.getByRole("button", { name: /plan it/i }).click();

    // Destination picker should appear
    await expect(page.getByText("Maui, Hawaii")).toBeVisible({ timeout: 5000 });
    await expect(page.getByText("Cancun, Mexico")).toBeVisible();
    await expect(page.getByText("San Diego, CA")).toBeVisible();

    // Pick Maui
    await page.getByText("Maui, Hawaii").click();

    // Results should load
    await page.getByRole("heading", { name: /Maui, Hawaii/i, level: 2 }).waitFor({ timeout: 15000 });
    await expect(page.getByText("Road to Hana").first()).toBeVisible();
  });
});
