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
 * Mirrors the event sequence sent by POST /api/v1/trip/stream.
 * Accepts optional overrides so individual tests can customise
 * trip, weather, itinerary, or packing data without duplicating
 * the full SSE format.
 */
export function buildSSEBody(overrides?: {
  trip?: unknown;
  weather?: unknown;
  tripPlan?: unknown;
  scheduledItinerary?: unknown;
  packingList?: unknown;
}): string {
  const trip = (overrides?.trip ?? MOCK_TRIP_PLAN.trip) as Record<string, unknown>;
  const weather = (overrides?.weather ?? MOCK_TRIP_PLAN.weather) as unknown;
  const tripPlan = (overrides?.tripPlan ?? MOCK_TRIP_PLAN.tripPlan) as unknown;
  const scheduledItinerary = (overrides?.scheduledItinerary ?? MOCK_TRIP_PLAN.scheduledItinerary) as unknown;
  const packingList = (overrides?.packingList ?? MOCK_PACKING_LIST) as unknown;

  const events: string[] = [];

  events.push(`event: destination\ndata: ${JSON.stringify(trip)}\n`);
  events.push(`event: weather\ndata: ${JSON.stringify({ weather })}\n`);
  events.push(`event: itinerary-chunk\ndata: ${JSON.stringify({ tripPlan, scheduledItinerary })}\n`);
  events.push(`event: packing\ndata: ${JSON.stringify({ packingList })}\n`);
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
 * Override the SSE stream route with a custom SSE body or an error response.
 * Must be called AFTER mockAllApis (Playwright matches the last-registered route first).
 */
export async function overrideSSE(
  page: Page,
  opts: { status?: number; body?: string; errorJson?: unknown },
): Promise<void> {
  if (opts.errorJson !== undefined || (opts.status && opts.status >= 400)) {
    const errorStatus = opts.status ?? 500;
    const errorBody = JSON.stringify(opts.errorJson ?? { error: "Server error" });
    // Override BOTH the SSE stream AND the bundle fallback so the fallback
    // path in api.js also returns an error instead of succeeding silently.
    await page.route("**/api/v1/trip/stream", (r) =>
      r.fulfill({ status: errorStatus, contentType: "application/json", body: errorBody }),
    );
    await page.route("**/api/v1/trip/bundle", (r) =>
      r.fulfill({ status: errorStatus, contentType: "application/json", body: errorBody }),
    );
    // Also override legacy trip-plan route used by some fallback paths
    await page.route("**/api/trip-plan", (r) =>
      r.fulfill({ status: errorStatus, contentType: "application/json", body: errorBody }),
    );
  } else {
    await page.route("**/api/v1/trip/stream", (r) =>
      r.fulfill({
        status: 200,
        contentType: "text/event-stream",
        body: opts.body ?? buildSSEBody(),
      }),
    );
  }
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
