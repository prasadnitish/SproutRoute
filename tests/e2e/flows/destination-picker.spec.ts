import { test, expect } from "@playwright/test";
import { mockAllApis } from "../fixtures/mock-api";
import { MOCK_DESTINATIONS, MOCK_TRIP_PLAN } from "../fixtures/trip-data";

test.describe("Destination Picker — vague input triggers 3 suggestions", () => {
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
    await page.getByRole("heading", { name: /Maui, Hawaii/i }).waitFor({ timeout: 15000 });
    await expect(page.getByText("Road to Hana")).toBeVisible();
  });
});
