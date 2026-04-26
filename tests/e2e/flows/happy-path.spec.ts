import { test, expect } from "@playwright/test";
import { mockAllApis, goToResults } from "../fixtures/mock-api";

test.describe("Happy Path — full input → results journey", () => {
  test("completes full flow and renders all major tiles", async ({ page }) => {
    await mockAllApis(page);
    await goToResults(page);

    // Hero tile
    await expect(page.getByRole("heading", { name: /Maui, Hawaii/i })).toBeVisible();
    // Weather tile — high temp
    await expect(page.getByText("76", { exact: false }).first()).toBeVisible();
    // Itinerary tile — first activity (use .first() because the name appears in both the card and the route panel)
    await expect(page.getByText("Road to Hana").first()).toBeVisible();
    // Premium day map
    await expect(page.getByRole("region", { name: /day map day 1 route/i })).toBeVisible();
    await expect(page.locator("iframe").first()).toBeVisible();
    // Safety tab — emergency number
    await page.getByRole("button", { name: /Safety/i }).click();
    await expect(page.getByText("911")).toBeVisible();
  });
});
