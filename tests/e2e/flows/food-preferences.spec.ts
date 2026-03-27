import { test, expect } from "@playwright/test";
import { mockAllApis } from "../fixtures/mock-api";
import { MOCK_PARSED_INPUT, MOCK_VEGAN_TRIP_PLAN } from "../fixtures/trip-data";

test.describe("Food Preferences — dietary input flows through to meal cards", () => {
  test("vegan trip shows vegan cuisine badges in meal cards", async ({ page }) => {
    await mockAllApis(page);

    await page.route("**/api/v1/trip/parse-input", (r) =>
      r.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ...MOCK_PARSED_INPUT, vibe: "dining", foodPreferences: { dietary: ["vegan"] } }),
      })
    );
    await page.route("**/api/trip-plan", (r) =>
      r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(MOCK_VEGAN_TRIP_PLAN) })
    );

    await page.goto("/");
    await page.locator("textarea").fill("vegan family trip to Maui");
    await page.getByRole("button", { name: /plan it/i }).click();
    await page.getByRole("heading", { name: /Maui, Hawaii/i }).waitFor({ timeout: 15000 });

    // Meal cards should show vegan restaurant and cuisine labels
    await expect(page.getByText("Alive & Well")).toBeVisible();
    await expect(page.getByText("Vegan Ramen")).toBeVisible();
  });
});
