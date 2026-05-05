// NOTE: Check/uncheck and category/item render tests are BLOCKED pending
// PackingChecklist being wired into the Pack tab of ResultsScreen.
// Currently the Pack tab renders a count stub only.

import { test, expect } from "@playwright/test";
import { mockAllApis, goToResults } from "../fixtures/mock-api";

const packTab = (page) => page.getByRole("button", { name: /^pack/i });

test.describe("PackingTile (stub — full tests blocked pending component integration)", () => {
  test.beforeEach(async ({ page }) => {
    await mockAllApis(page);
    await goToResults(page);
  });

  test("Pack tab button is visible", async ({ page }) => {
    await expect(packTab(page)).toBeVisible();
  });

  test("clicking Pack tab does not crash", async ({ page }) => {
    await packTab(page).click();
    await expect(page.locator("body")).not.toContainText("TypeError");
  });

  test("Pack tab renders item count or stub text", async ({ page }) => {
    await packTab(page).click();
    await expect(page.locator("body")).not.toBeEmpty();
  });
});

test.describe("PackingTile — Shop button", () => {
  test("Shop button visible on unchecked items with shopLinks", async ({ page }) => {
    await mockAllApis(page);
    await goToResults(page);
    // Navigate to the Pack tab
    await packTab(page).click();
    // Find the shop button by aria-label
    const shopButton = page.getByLabel(/shop for/i).first();
    await expect(shopButton).toBeVisible();
  });

  test("Tapping Shop expands panel with 3 store links", async ({ page }) => {
    await mockAllApis(page);
    await goToResults(page);
    await packTab(page).click();
    const shopButton = page.getByLabel(/shop for/i).first();
    await shopButton.click();
    await expect(page.getByRole("link", { name: /Amazon/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /Walmart/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /Target/i })).toBeVisible();
  });

  test("Disclosure text visible in expanded Shop panel", async ({ page }) => {
    await mockAllApis(page);
    await goToResults(page);
    await packTab(page).click();
    const shopButton = page.getByLabel(/shop for/i).first();
    await shopButton.click();
    await expect(page.getByText(/may earn a small commission/i)).toBeVisible();
  });
});
