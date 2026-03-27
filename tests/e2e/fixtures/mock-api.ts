// tests/e2e/fixtures/mock-api.ts
// mockAllApis — intercepts ALL routes the app calls.
// Every spec must call this before page.goto('/') to prevent any real network calls.
// Individual tests can override specific routes AFTER calling mockAllApis.

import type { Page } from "@playwright/test";
import {
  MOCK_PARSED_INPUT,
  MOCK_TRIP_PLAN,
  MOCK_PACKING_LIST,
  MOCK_SAFETY,
  MOCK_GEO,
} from "./trip-data";

function json(body: unknown, status = 200) {
  return {
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  };
}

export async function mockAllApis(page: Page): Promise<void> {
  await page.route("**/api/v1/trip/parse-input",    (r) => r.fulfill(json(MOCK_PARSED_INPUT)));
  await page.route("**/api/trip-plan",              (r) => r.fulfill(json(MOCK_TRIP_PLAN)));
  await page.route("**/api/generate",               (r) => r.fulfill(json(MOCK_PACKING_LIST)));
  await page.route("**/api/safety/travel-tips",     (r) => r.fulfill(json(MOCK_SAFETY)));
  await page.route("**/api/safety/car-seat-check",  (r) => r.fulfill(json({})));
  await page.route("**/api/v1/geo/detect",          (r) => r.fulfill(json(MOCK_GEO)));
  await page.route("**/api/v1/places/enrich",       (r) => r.fulfill(json(null)));
}

/**
 * Navigate through the full input → generating → results flow.
 * All APIs are mocked so this completes instantly.
 * @param waitFor - text to wait for on the results screen (default: "Maui, Hawaii")
 */
export async function goToResults(page: Page, waitFor = "Maui, Hawaii"): Promise<void> {
  await page.goto("/");
  await page.locator("textarea").fill("Beach vacation in Maui with kids age 4 and 8");
  await page.getByRole("button", { name: /plan it/i }).click();
  await page.getByText(waitFor, { exact: false }).waitFor({ timeout: 15000 });
}
