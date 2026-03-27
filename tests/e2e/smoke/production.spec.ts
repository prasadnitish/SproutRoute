// Runs against https://sproutroute-production.up.railway.app
// No API mocking. Structural shape assertions only — no real trip generation.
// Run locally: npx playwright test --project=smoke
// ⚠️  The trip-plan test makes a real AI call (costs API credits).
//     Do NOT add --project=smoke to pre-commit hooks or automated loops.

import { test, expect } from "@playwright/test";

test.describe("Production Smoke Tests", () => {
  test("health check returns ok", async ({ request }) => {
    const res = await request.get("/api/health");
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.status).toBe("ok");
  });

  test("app loads with correct title", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/sproutroute|sprout/i);
  });

  test("parse-input returns correct response shape", async ({ request }) => {
    const res = await request.post("/api/v1/trip/parse-input", {
      data: { text: "beach trip to Maui next April", detectedLat: null, detectedLon: null },
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect("destination" in body).toBeTruthy();
    expect(Array.isArray(body.suggestedDestinations)).toBeTruthy();
  });

  test("trip-plan returns correct response shape", async ({ request }) => {
    const res = await request.post("/api/trip-plan", {
      data: {
        destination: "Maui, Hawaii",
        startDate: "2026-06-01",
        endDate: "2026-06-07",
        adults: 2,
        childrenAges: [],
        activities: ["beach"],
      },
      timeout: 60000,
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body).toHaveProperty("trip");
    expect(body).toHaveProperty("weather");
    expect(body).toHaveProperty("tripPlan");
    expect(body).toHaveProperty("scheduledItinerary");
  });
});
