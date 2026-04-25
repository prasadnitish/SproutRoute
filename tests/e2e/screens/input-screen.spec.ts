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

  test("suggested trips use relative timing instead of fixed calendar dates", async ({ page }) => {
    await expect(page.getByRole("button", { name: /next weekend/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /next month/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /winter/i })).toBeVisible();
    await expect(page.getByText(/Apr 12|Apr 19|June 10|June 15/i)).toHaveCount(0);
  });

  test("clicking a chip pre-fills the textarea", async ({ page }) => {
    await page.getByRole("button", { name: /beach trip/i }).click();
    const value = await page.locator("textarea").inputValue();
    expect(value).toMatch(/beach/i);
  });

  test("clicking a chip preserves existing trip details instead of overwriting them", async ({ page }) => {
    await page.locator("textarea").fill("Hawaii from June 10 to June 15 with our toddler");
    await page.getByRole("button", { name: /beach trip/i }).click();
    const value = await page.locator("textarea").inputValue();

    expect(value).toContain("Hawaii");
    expect(value).toContain("June 10");
    expect(value.toLowerCase()).toContain("beach trip");
  });
});
