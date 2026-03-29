import { test, expect } from "@playwright/test";
import { mockAllApis, goToResults } from "../fixtures/mock-api";

test.describe("Back button — preserves input text", () => {
  test.beforeEach(async ({ page }) => {
    await mockAllApis(page);
  });

  test("SproutRoute logo click from results returns to input with text preserved", async ({ page }) => {
    await goToResults(page);
    await expect(page.getByRole("heading", { name: /Maui, Hawaii/i })).toBeVisible();

    // Click the SproutRoute logo to go back (app's own back mechanism)
    await page.getByRole("button", { name: /SproutRoute/i }).click();

    // Textarea should be visible with the original input
    const textarea = page.locator("textarea");
    await expect(textarea).toBeVisible({ timeout: 5000 });
    const value = await textarea.inputValue();
    expect(value).toContain("Beach vacation in Maui");
  });

  test("sessionStorage preserves input text after submit", async ({ page }) => {
    await page.goto("/");
    const input = "Road trip to Austin with our dog";
    await page.locator("textarea").fill(input);
    await page.getByRole("button", { name: /plan it/i }).click();

    // Wait for generating screen to appear
    await page.getByText(/building your trip/i).waitFor({ timeout: 5000 }).catch(() => {});

    // Check sessionStorage directly
    const stored = await page.evaluate(() => sessionStorage.getItem("sprout:lastInput"));
    expect(stored).toContain("Road trip to Austin");
  });

  test("input screen shows previous text after full round-trip", async ({ page }) => {
    await goToResults(page);
    await expect(page.getByRole("heading", { name: /Maui, Hawaii/i })).toBeVisible();

    // Navigate back to input via the logo button
    await page.getByRole("button", { name: /SproutRoute/i }).click();
    const textarea = page.locator("textarea");
    await expect(textarea).toBeVisible({ timeout: 5000 });

    // Should have the original text from sessionStorage
    const value = await textarea.inputValue();
    expect(value.length).toBeGreaterThan(0);
  });
});
