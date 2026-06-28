import { test, expect } from "@playwright/test";
import { mockAllApis, goToResults } from "../fixtures/mock-api";

async function openPackTab(page) {
  await page.getByRole("button", { name: /pack/i }).click();
}

test.describe("PackingChecklist", () => {
  test.beforeEach(async ({ page }) => {
    await mockAllApis(page);
    await goToResults(page);
    await openPackTab(page);
  });

  test("renders real checklist categories and items", async ({ page }) => {
    await expect(page.getByRole("heading", { name: /what to pack/i })).toBeVisible();
    await expect(page.getByText("Beach Essentials")).toBeVisible();
    await expect(page.getByText("Sunscreen SPF 50")).toBeVisible();
    await expect(page.getByText("Life jackets")).toBeVisible();
    await expect(page.getByText(/0 of 4 items packed/i)).toBeVisible();
  });

  test("does not render undefined quantities when API items omit quantity", async ({ page }) => {
    await expect(page.locator("body")).not.toContainText("×undefined");
  });

  test("check state updates progress and persists for the same regenerated list", async ({ page }) => {
    await page.getByRole("checkbox", { name: /sunscreen spf 50/i }).check();
    await expect(page.getByText(/1 of 4 items packed/i)).toBeVisible();
    await expect(page.getByRole("progressbar", { name: /packing progress/i })).toHaveAttribute("aria-valuenow", "25");

    await goToResults(page);
    await openPackTab(page);

    await expect(page.getByRole("checkbox", { name: /sunscreen spf 50/i })).toBeChecked();
    await expect(page.getByText(/1 of 4 items packed/i)).toBeVisible();
  });

  test("custom items can be added, packed, and removed", async ({ page }) => {
    await page.getByPlaceholder(/add item to beach essentials/i).fill("Water shoes");
    await page.getByRole("button", { name: /\+ add/i }).first().click();

    await expect(page.getByText("Water shoes")).toBeVisible();
    await expect(page.getByText(/0 of 5 items packed/i)).toBeVisible();

    await page.getByRole("checkbox", { name: /water shoes/i }).check();
    await expect(page.getByText(/1 of 5 items packed/i)).toBeVisible();

    await page.getByLabel(/remove water shoes/i).click();
    await expect(page.getByText("Water shoes")).toHaveCount(0);
    await expect(page.getByText(/0 of 4 items packed/i)).toBeVisible();
  });
});

test.describe("PackingTile — Shop button", () => {
  test("Shop button visible on unchecked items with shopLinks", async ({ page }) => {
    await mockAllApis(page);
    await goToResults(page);
    await openPackTab(page);
    const shopButton = page.getByLabel(/shop for/i).first();
    await expect(shopButton).toBeVisible();
  });

  test("Tapping Shop expands panel with 3 store links", async ({ page }) => {
    await mockAllApis(page);
    await goToResults(page);
    await openPackTab(page);
    const shopButton = page.getByLabel(/shop for/i).first();
    await shopButton.click();
    await expect(page.getByRole("link", { name: /Amazon/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /Walmart/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /Target/i })).toBeVisible();
  });

  test("Disclosure text visible in expanded Shop panel", async ({ page }) => {
    await mockAllApis(page);
    await goToResults(page);
    await openPackTab(page);
    const shopButton = page.getByLabel(/shop for/i).first();
    await shopButton.click();
    await expect(page.getByText(/may earn a small commission/i)).toBeVisible();
  });
});
