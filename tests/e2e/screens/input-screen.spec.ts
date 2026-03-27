import { test, expect } from "@playwright/test";
import { mockAllApis } from "../fixtures/mock-api";

test.describe("InputScreen", () => {
  test.beforeEach(async ({ page }) => {
    await mockAllApis(page);
    await page.goto("/");
  });

  test("renders textarea", async ({ page }) => {
    await expect(page.locator("textarea")).toBeVisible();
  });

  test("renders Plan It button", async ({ page }) => {
    await expect(page.getByRole("button", { name: /plan it/i })).toBeVisible();
  });

  test("Plan It button is disabled when textarea is empty", async ({ page }) => {
    await expect(page.getByRole("button", { name: /plan it/i })).toBeDisabled();
  });

  test("Plan It button enables when text is typed", async ({ page }) => {
    await page.locator("textarea").fill("Beach trip");
    await expect(page.getByRole("button", { name: /plan it/i })).toBeEnabled();
  });

  test("chip buttons are visible", async ({ page }) => {
    await expect(page.getByRole("button", { name: /beach trip/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /city break/i })).toBeVisible();
  });

  test("clicking a chip pre-fills the textarea", async ({ page }) => {
    await page.getByRole("button", { name: /beach trip/i }).click();
    const value = await page.locator("textarea").inputValue();
    expect(value).toMatch(/beach/i);
  });
});
