import { test, expect } from "@playwright/test";
import { mockAllApis, goToResults } from "../fixtures/mock-api";

test.describe("SafetyTile", () => {
  test.beforeEach(async ({ page }) => {
    await mockAllApis(page);
    await goToResults(page);
    await page.getByRole("button", { name: /Safety/i }).click();
  });

  test("renders advisory level", async ({ page }) => {
    // MOCK_SAFETY.advisoryLevel = "low" — rendered in Badge component
    await expect(page.getByText(/low/i, { exact: false })).toBeVisible();
  });

  test("renders emergency number", async ({ page }) => {
    await expect(page.getByText("911")).toBeVisible();
  });

  test("renders health tip", async ({ page }) => {
    await expect(page.getByText(/stay hydrated/i, { exact: false })).toBeVisible();
  });

  test("renders family tip", async ({ page }) => {
    await expect(page.getByText(/life jackets/i, { exact: false })).toBeVisible();
  });

  test("renders water safety info", async ({ page }) => {
    await expect(page.getByText(/safe to drink/i, { exact: false })).toBeVisible();
  });

  test("renders gracefully when safety data is empty", async ({ page }) => {
    await page.route("**/api/safety/travel-tips", (r) =>
      r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({}) })
    );
    await page.goto("/");
    await page.locator("textarea").fill("Beach vacation in Maui with kids age 4 and 8");
    await page.getByRole("button", { name: /plan it/i }).click();
    await page.getByRole("heading", { name: /Maui, Hawaii/i }).waitFor({ timeout: 15000 });
    await expect(page.locator("body")).not.toContainText("TypeError");
  });
});
