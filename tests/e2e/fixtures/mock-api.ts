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

/**
 * Build SSE response body from trip-data mocks.
 * Mirrors the event sequence sent by POST /api/v1/trip/stream
 */
function buildSSEBody(): string {
  const events: string[] = [];

  const trip = MOCK_TRIP_PLAN.trip;
  events.push(`event: destination\ndata: ${JSON.stringify(trip)}\n`);
  events.push(`event: weather\ndata: ${JSON.stringify({ weather: MOCK_TRIP_PLAN.weather })}\n`);
  events.push(`event: itinerary-chunk\ndata: ${JSON.stringify({ tripPlan: MOCK_TRIP_PLAN.tripPlan, scheduledItinerary: MOCK_TRIP_PLAN.scheduledItinerary })}\n`);
  events.push(`event: packing\ndata: ${JSON.stringify({ packingList: MOCK_PACKING_LIST })}\n`);
  events.push(`event: done\ndata: {}\n`);

  return events.join("\n");
}

export async function mockAllApis(page: Page): Promise<void> {
  // ── SSE stream endpoint (primary trip generation path) ──────────────────
  await page.route("**/api/v1/trip/stream", (r) =>
    r.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body: buildSSEBody(),
    }),
  );

  // ── Legacy/fallback routes (still used by some paths) ───────────────────
  await page.route("**/api/v1/trip/parse-input",    (r) => r.fulfill(json(MOCK_PARSED_INPUT)));
  await page.route("**/api/v1/trip/bundle",         (r) => r.fulfill(json(MOCK_TRIP_PLAN)));
  await page.route("**/api/trip-plan",              (r) => r.fulfill(json(MOCK_TRIP_PLAN)));
  await page.route("**/api/generate",               (r) => r.fulfill(json(MOCK_PACKING_LIST)));
  await page.route("**/api/safety/travel-tips",     (r) => r.fulfill(json(MOCK_SAFETY)));
  await page.route("**/api/safety/car-seat-check",  (r) => r.fulfill(json({})));
  await page.route("**/api/v1/safety/pet-travel-check", (r) => r.fulfill(json({})));
  await page.route("**/api/v1/geo/detect",          (r) => r.fulfill(json(MOCK_GEO)));
  await page.route("**/api/v1/places/enrich",       (r) => r.fulfill(json(null)));
  await page.route("**/api/v1/places/photo",        (r) => r.fulfill({ status: 404, body: "" }));

  // ── Profile routes (no auth in mocked mode → return empty) ──────────────
  await page.route("**/api/v1/profile/me",          (r) => r.fulfill(json({ profile: null })));
  await page.route("**/api/v1/profile/import/**",   (r) => r.fulfill(json({ valid: true, errors: [], warnings: [] })));
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
  await page.getByRole("heading", { name: new RegExp(waitFor, "i") }).waitFor({ timeout: 15000 });
}
