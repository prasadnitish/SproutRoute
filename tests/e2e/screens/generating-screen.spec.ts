import { test, expect } from "@playwright/test";
import { mockAllApis } from "../fixtures/mock-api";

test.describe("GeneratingScreen", () => {
  test.beforeEach(async ({ page }) => {
    await mockAllApis(page);
    await page.goto("/");
    await page.locator("textarea").fill("Beach vacation in Maui with kids age 4 and 8");
    await page.getByRole("button", { name: /plan it/i }).click();
  });

  test("shows Building your trip plan heading", async ({ page }) => {
    // Heading includes … ellipsis character — use regex to match
    await expect(page.getByText(/Building your trip plan/i)).toBeVisible({ timeout: 5000 });
  });

  test("shows step labels", async ({ page }) => {
    // Step label text from GeneratingScreen.jsx STEP_LABELS:
    // { resolve: "Understanding your trip", weather: "Checking the weather", itinerary: "Crafting your itinerary", ... }
    const stepText = page.getByText(/Understanding your trip|Checking the weather|Crafting your itinerary/).first();
    await expect(stepText).toBeVisible({ timeout: 5000 });
  });
});
