import { test, expect } from "@playwright/test";
import { mockAllApis, goToResults } from "../fixtures/mock-api";

test.describe("SafetyTile", () => {
  test.beforeEach(async ({ page }) => {
    await mockAllApis(page);
    await goToResults(page);
    await page.getByRole("button", { name: /^Safety\b/i }).click();
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
    await page.getByRole("heading", { name: /Maui, Hawaii/i, level: 2 }).waitFor({ timeout: 15000 });
    await expect(page.locator("body")).not.toContainText("TypeError");
  });

  test("car seat card shows each child's restraint from the server, with the official source", async ({ page }) => {
    await page.route("**/api/safety/car-seat-check", (r) =>
      r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
        status: "Needs review",
        jurisdictionCode: "HI",
        jurisdictionName: "Hawaii",
        message: "State laws change. Verify legal requirements before travel using the official source.",
        sourceUrl: "https://hidot.hawaii.gov/highways/safe-communities/child-passenger-safety/",
        effectiveDate: "Not found in repo",
        lastUpdated: "2026-02-15",
        results: [
          { childId: "child-1", ageYears: 4, status: "Needs review", requiredRestraint: "forward_facing_harness", requiredRestraintLabel: "Forward-facing seat with harness", seatPosition: "rear_seat_required_if_available", rationale: "Age matched but weight/height details are incomplete." },
          { childId: "child-2", ageYears: 8, status: "Needs review", requiredRestraint: "booster", requiredRestraintLabel: "Booster seat", seatPosition: "rear_seat_required_if_available", rationale: "Age matched but weight/height details are incomplete." },
        ],
      }) })
    );
    await page.goto("/");
    await page.locator("textarea").fill("Beach vacation in Maui with kids age 4 and 8");
    await page.getByRole("button", { name: /plan it/i }).click();
    await page.getByRole("heading", { name: /Maui, Hawaii/i, level: 2 }).waitFor({ timeout: 15000 });
    await page.getByRole("button", { name: /Safety/ }).first().click();

    const card = page.getByRole("region", { name: "Car seats: Hawaii" });
    await expect(card).toBeVisible();
    await expect(card.getByText("Age 4")).toBeVisible();
    await expect(card.getByText("Forward-facing seat with harness. Back seat required when the vehicle has one")).toBeVisible();
    await expect(card.getByText("Age 8")).toBeVisible();
    await expect(card.getByText(/based on age\. Weight and height can change which seat is required/)).toBeVisible();
    await expect(card.getByText("Source: hidot.hawaii.gov, rules updated Feb 15, 2026")).toBeVisible();
    await expect(card.getByRole("link", { name: "Official car seat source" })).toHaveAttribute("href", /hidot\.hawaii\.gov/);
    await expect(page.locator("body")).not.toContainText("Not found in repo");
  });
});
