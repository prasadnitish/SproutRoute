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
    // Itinerary tile — first activity
    await expect(page.getByText("Road to Hana")).toBeVisible();
    // Safety tile — emergency number
    await expect(page.getByText("911")).toBeVisible();
    // Map tile — iframe
    await expect(page.locator("iframe")).toBeVisible();
  });
});
