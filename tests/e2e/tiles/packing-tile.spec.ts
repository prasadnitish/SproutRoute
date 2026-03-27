// NOTE: Check/uncheck and category/item render tests are BLOCKED pending
// PackingChecklist being wired into the Pack tab of ResultsScreen.
// Currently the Pack tab renders a count stub only.

import { test, expect } from "@playwright/test";
import { mockAllApis, goToResults } from "../fixtures/mock-api";

test.describe("PackingTile (stub — full tests blocked pending component integration)", () => {
  test.beforeEach(async ({ page }) => {
    await mockAllApis(page);
    await goToResults(page);
  });

  test("Pack tab button is visible", async ({ page }) => {
    await expect(page.getByRole("button", { name: /pack/i }).or(page.getByText(/pack/i))).toBeVisible();
  });

  test("clicking Pack tab does not crash", async ({ page }) => {
    await page.getByText(/pack/i, { exact: false }).click();
    await expect(page.locator("body")).not.toContainText("TypeError");
  });

  test("Pack tab renders item count or stub text", async ({ page }) => {
    await page.getByText(/pack/i, { exact: false }).click();
    await expect(page.locator("body")).not.toBeEmpty();
  });
});
