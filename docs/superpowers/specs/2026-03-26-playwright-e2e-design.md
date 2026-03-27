# Playwright E2E Test Suite — Design Spec
**Date:** 2026-03-26
**Project:** SproutRoute
**Status:** Approved for implementation (v2 — post-review fixes applied)

---

## Overview

A comprehensive Playwright E2E test suite for SproutRoute covering all UX use cases: tile-level detail tests, screen tests, full user-flow tests, and production smoke tests. The suite is structured in three layers — tiles → screens → flows — so failures are self-explanatory and point to the exact broken component.

---

## Goals

- Catch UI regressions before they reach production on every `git push`
- Cover all 8 use-case areas: happy path, destination picker, itinerary interactions, weather tile, food preferences, error states, packing list, and production smoke
- Run mocked tests automatically in GitHub Actions CI (~45s, Chromium only)
- Run smoke tests locally on demand against the live Railway URL

---

## File Structure

```
tests/e2e/
├── fixtures/
│   ├── mock-api.ts          # shared route mocks — mockAllApis(page) helper
│   └── trip-data.ts         # typed mock payloads matching current backend shapes
├── tiles/
│   ├── hero-tile.spec.ts
│   ├── weather-tile.spec.ts
│   ├── itinerary-tile.spec.ts
│   ├── safety-tile.spec.ts
│   ├── map-tile.spec.ts
│   └── packing-tile.spec.ts
├── screens/
│   ├── input-screen.spec.ts
│   └── generating-screen.spec.ts
├── flows/
│   ├── happy-path.spec.ts
│   ├── destination-picker.spec.ts
│   ├── food-preferences.spec.ts
│   └── error-states.spec.ts
└── smoke/
    └── production.spec.ts
```

Existing spec files (`input-flow.spec.ts`, `results-mosaic.spec.ts`, `generic-input.spec.ts`) are replaced by this suite.

---

## Playwright Config

`playwright.config.ts` is updated with two explicit **projects**:

```ts
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30000,
  projects: [
    {
      name: "mocked",
      use: { ...devices["Desktop Chrome"] },
      testIgnore: /smoke/,
    },
    {
      name: "smoke",
      use: {
        ...devices["Desktop Chrome"],
        baseURL: "https://sproutroute-production.up.railway.app",
      },
      testMatch: /smoke/,
    },
  ],
  use: {
    baseURL: "http://localhost:4173",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "cd src/frontend && npm run build && npm run preview -- --port 4173",
    port: 4173,
    reuseExistingServer: true,
    timeout: 60000,
  },
});
```

**`mocked` project** — default, runs in CI
- Covers `tiles/`, `screens/`, `flows/`
- Browser: Chromium only
- `baseURL`: `http://localhost:4173` (vite preview, static build, no backend process)
- All API calls are intercepted by `mockAllApis` — backend is never started

**`smoke` project** — local only, excluded from CI
- Covers `smoke/` only
- Browser: Chromium only
- `baseURL`: `https://sproutroute-production.up.railway.app`
- No `webServer` — hits live Railway directly

> **Important:** The vite preview server serves the static frontend only. No backend runs during mocked tests. Every test **must** call `mockAllApis(page)` before navigating. Any unintercepted route will 404. The `mockAllApis` helper must intercept all API paths the app can call.

---

## Shared Fixtures

### `fixtures/trip-data.ts`

Exports typed constants matching exact backend response shapes:

```ts
// parse-input response — destination resolved
MOCK_PARSED_INPUT = {
  destination: "Maui, Hawaii",
  startDate: "2026-04-12",
  endDate: "2026-04-19",
  adults: 2,
  childrenAges: [4, 8],
  vibe: "beach",
  suggestedDestinations: [],
  detectedRegion: null,
}

// parse-input response — vague input, no destination
MOCK_DESTINATIONS = {
  destination: null,
  suggestedDestinations: [
    { name: "Maui, Hawaii", emoji: "🌴", description: "Stunning beaches", season_note: "Perfect spring weather" },
    { name: "Cancun, Mexico", emoji: "🏖", description: "All-inclusive resorts", season_note: "Warm and sunny" },
    { name: "San Diego, CA", emoji: "☀️", description: "Family-friendly coast", season_note: "Mild spring temps" },
  ],
  startDate: "2026-04-12",
  endDate: "2026-04-19",
  adults: 2,
  childrenAges: [],
  vibe: "beach",
  detectedRegion: null,
}

// /api/trip-plan response — includes scheduledItinerary for full tile coverage
MOCK_TRIP_PLAN = {
  trip: {
    destination: "Maui, Hawaii",
    lat: 20.7984,
    lon: -156.3319,
    startDate: "2026-04-12",
    endDate: "2026-04-19",
    countryCode: "US",
    children: [{ age: 4 }, { age: 8 }],
  },
  weather: {
    forecast: [
      { date: "2026-04-12", name: "Saturday", high: 76, low: 68, condition: "Sunny", precipitation: 5 },
      { date: "2026-04-13", name: "Sunday",   high: 75, low: 67, condition: "Partly cloudy", precipitation: 10 },
    ],
    summary: "Expect warm, sunny weather.",
  },
  tripPlan: {
    overview: "A beautiful beach trip to Maui.",
    suggestedActivities: [
      { id: "act-1", name: "Road to Hana", category: "hiking", description: "Scenic drive with waterfalls", duration: "full day", kidFriendly: true, weatherDependent: false },
      { id: "act-2", name: "Snorkeling at Molokini", category: "water", description: "Great for kids", duration: "3 hours", kidFriendly: true, weatherDependent: true },
    ],
    dailyItinerary: [
      {
        day: "Day 1 (2026-04-12)",
        activities: ["act-1"],
        meals: {
          breakfast: { name: "Kihei Cafe", cuisine: "American", note: "Great pancakes" },
          lunch: { name: "Mama's Fish House", cuisine: "Seafood", note: "Iconic oceanfront" },
          dinner: { name: "Monkeypod Kitchen", cuisine: "Hawaiian", note: "Local craft beer" },
        },
        notes: "Start early to beat traffic on the Hana highway.",
      },
      {
        day: "Day 2 (2026-04-13)",
        activities: ["act-2"],
        meals: {
          breakfast: { name: "Gazebo Restaurant", cuisine: "American", note: "Oceanfront views" },
          lunch: { name: "Leoda's Kitchen", cuisine: "Comfort Food", note: "Best pies on Maui" },
          dinner: { name: "Merriman's Maui", cuisine: "Hawaiian Regional", note: "Farm to table" },
        },
        notes: null,
      },
    ],
    tips: ["Book snorkeling tours in advance.", "Sunscreen is a must."],
  },
  // scheduledItinerary — powers all time/enrichment assertions in itinerary tile tests
  scheduledItinerary: [
    {
      date: "2026-04-12",
      scheduled: [
        {
          id: "act-1",
          name: "Road to Hana",
          category: "hiking",
          description: "Scenic drive with waterfalls",
          scheduledStart: "9:00 AM",
          scheduledEnd: "5:00 PM",
          duration: 480,
          status: "scheduled",
          warning: null,
          enriched: {
            rating: 4.8,
            priceLevel: 1,
            address: "Hana Hwy, Maui, HI 96713",
            photos: ["https://example.com/photo1.jpg"],
            mapsUrl: "https://maps.google.com/?q=Road+to+Hana",
          },
        },
        {
          name: "Closed Attraction",
          category: "museums",
          scheduledStart: null,
          scheduledEnd: null,
          duration: 120,
          status: "closed",
          warning: "Closed on this day — consider swapping",
          enriched: null,
        },
        {
          name: "Mama's Fish House",
          category: "dining",
          mealType: "dinner",
          cuisine: "Seafood",
          note: "Iconic oceanfront",
          scheduledStart: "6:00 PM",
          scheduledEnd: "7:30 PM",
          duration: 90,
          status: "meal",
          isMeal: true,
          enriched: {
            rating: 4.7,
            priceLevel: 3,
            address: "799 Poho Pl, Paia, HI 96779",
            photos: [],
            mapsUrl: "https://maps.google.com/?q=Mamas+Fish+House",
          },
        },
      ],
      warnings: [{ activity: "Closed Attraction", type: "closed", message: "Closed Attraction is closed on this day" }],
      notes: "Start early to beat traffic.",
    },
    {
      date: "2026-04-13",
      scheduled: [
        {
          id: "act-2",
          name: "Snorkeling at Molokini",
          category: "water",
          description: "Great for kids",
          scheduledStart: "9:00 AM",
          scheduledEnd: "12:00 PM",
          duration: 180,
          status: "scheduled",
          warning: null,
          enriched: { rating: 4.6, priceLevel: 2, address: "Molokini Crater, Maui, HI", photos: [], mapsUrl: null },
        },
      ],
      warnings: [],
      notes: null,
    },
  ],
  enrichedMap: {},
}

// /api/generate response
MOCK_PACKING_LIST = {
  categories: [
    { name: "Beach Essentials", items: [{ name: "Sunscreen SPF 50" }, { name: "Beach towels" }, { name: "Snorkel gear" }] },
    { name: "Kids", items: [{ name: "Life jackets" }, { name: "Sand toys" }] },
  ],
}

// /api/safety/travel-tips response — matches travelSafety.js output shape
MOCK_SAFETY = {
  advisoryLevel: "low",
  emergencyNumber: "911",
  healthTips: ["Stay hydrated in the heat.", "Apply sunscreen every 2 hours."],
  familyTips: ["Kids under 12 should wear life jackets when snorkeling."],
  waterSafety: "Safe to drink tap water",
  carSeatLaw: "Children under 4 must use a rear-facing car seat.",
  localCustoms: ["Remove shoes before entering homes."],
  source: "ai-generated",
}

// /api/v1/geo/detect response
MOCK_GEO = { lat: 41.8781, lon: -87.6298, region: "Chicago, IL" }
```

### `fixtures/mock-api.ts`

Exports `mockAllApis(page)` — intercepts **all** routes the app can call:

```ts
export async function mockAllApis(page, overrides = {}) {
  await page.route("**/api/v1/trip/parse-input", route => route.fulfill({ ... MOCK_PARSED_INPUT }));
  await page.route("**/api/trip-plan",           route => route.fulfill({ ... MOCK_TRIP_PLAN }));
  await page.route("**/api/generate",            route => route.fulfill({ ... MOCK_PACKING_LIST }));
  await page.route("**/api/safety/travel-tips",  route => route.fulfill({ ... MOCK_SAFETY }));
  await page.route("**/api/safety/car-seat-check", route => route.fulfill({ status: 200, body: JSON.stringify({}) }));
  await page.route("**/api/v1/geo/detect",       route => route.fulfill({ ... MOCK_GEO }));
  await page.route("**/api/v1/places/enrich",    route => route.fulfill({ status: 200, body: JSON.stringify(null) }));
}
```

Individual specs can override a specific route **after** calling `mockAllApis`:
```ts
await mockAllApis(page);
await page.route("**/api/trip-plan", route => route.fulfill({ status: 500 })); // override for error test
```

---

## Tile Tests

### `hero-tile.spec.ts`
| Test | Assertion |
|------|-----------|
| Destination name renders | `"Maui, Hawaii"` visible |
| Human-readable dates | `"Apr 12 – Apr 19"` (not ISO format) |
| Single kid display | `"1 kid, age 5"` |
| Multiple kids display | `"2 kids, ages 4 & 8"` |
| Adults-only trip | No kids line present |
| International tag | Badge appears when `countryCode !== "US"` (mock with `countryCode: "JP"`) |
| Domestic trip | No international badge when `countryCode === "US"` |

### `weather-tile.spec.ts`
| Test | Assertion |
|------|-----------|
| Forecast days render | Each day's label visible ("Saturday", "Sunday") |
| High temperature renders | `"76°"` visible |
| Low temperature renders | `"68°"` visible |
| Historical avg badge | Badge present when trip dates don't match forecast dates (mock `forecast[0].date` far in future) |
| Missing forecast graceful | No crash when `weather.forecast` is empty array |

### `itinerary-tile.spec.ts`
| Test | Assertion |
|------|-----------|
| Day tabs render | "Apr 12" and "Apr 13" tabs visible |
| Day tab switching | Clicking Day 2 tab shows "Snorkeling at Molokini" |
| Scheduled time renders | `"9:00 AM"` visible on Road to Hana card |
| Star rating renders | Rating visible on enriched activity |
| Price level renders | `$` visible on activity with `priceLevel: 1` |
| Photo thumbnail renders | `<img>` present when `enriched.photos[0]` is set |
| Emoji fallback | Category emoji shows when no photo (Snorkeling at Molokini) |
| Closed activity warning | Red "Closed on this day" text visible for closed activity |
| Breakfast card | ☕ emoji + "Kihei Cafe" visible |
| Lunch card | 🍽 emoji visible |
| Dinner card | "Mama's Fish House" + "Seafood" badge visible |
| Meal note renders | "Iconic oceanfront" text visible |
| Address renders | "Hana Hwy, Maui, HI" visible on enriched activity |
| Tap hint | "Tap any activity" hint visible |
| Empty itinerary | "No itinerary data yet" graceful state (mock `scheduledItinerary: []`, `dailyItinerary: []`) |

### `safety-tile.spec.ts`
| Test | Assertion |
|------|-----------|
| Advisory level renders | "low" advisory text visible |
| Emergency number renders | "911" visible |
| Health tips render | "Stay hydrated" text visible |
| Family tips render | Family tip text visible |
| Water safety renders | "Safe to drink tap water" visible |
| Null safety data | Graceful fallback, "Safety data unavailable" or similar — no crash |

### `map-tile.spec.ts`
| Test | Assertion |
|------|-----------|
| iframe present | `iframe` element in DOM |
| Correct coordinates | iframe `src` contains `20.7984` and `156.3319` |
| Null lat/lon | Tile renders without crashing (mock `lat: null, lon: null`) |

### `packing-tile.spec.ts`

> **Note:** Check/uncheck and persistence tests are **blocked** pending `PackingChecklist` being wired into the Pack tab of `ResultsScreen`. Currently the Pack tab renders a stub. Implement these tests after the component is integrated.

| Test | Status | Assertion |
|------|--------|-----------|
| Pack tab renders | Ready | "Pack" tab button visible |
| Pack tab is clickable | Ready | Clicking Pack tab does not crash |
| Item count shown | Ready | "N items" text visible in stub |
| Categories render | Blocked | Category names visible — pending component integration |
| Items render | Blocked | Item names visible — pending component integration |
| Check an item | Blocked | Item shows checked state — pending component integration |
| Checked state persists | Blocked | State maintained across tab switches — pending component integration |

---

## Screen Tests

### `input-screen.spec.ts`
| Test | Assertion |
|------|-----------|
| Textarea visible | `textarea` in DOM and visible |
| Plan It button visible | Button with `/plan it/i` text visible |
| Chip buttons present | At least one chip button visible |
| Chip pre-fills textarea | Clicking "Beach trip" chip populates textarea |

> Note: No geo label assertion — `InputScreen` does not render the detected region as a visible label.

### `generating-screen.spec.ts`
| Test | Assertion |
|------|-----------|
| Heading appears | `/Building your trip plan/i` (regex — text includes `…` ellipsis) visible after submit |
| Step labels present | Labels for resolve, weather, itinerary steps visible |

---

## Flow Tests

All flow tests call `mockAllApis(page)` in `beforeEach` and navigate to `/`. APIs return instantly since all routes are mocked — no real network calls.

### `happy-path.spec.ts`
1. Type `"Beach vacation in Maui with kids age 4 and 8"`
2. Click Plan It
3. Generating screen appears (`/Building your trip plan/i`)
4. Results: Hero tile shows `"Maui, Hawaii"`
5. Weather tile visible
6. Itinerary tile visible with `"Road to Hana"`
7. Safety tile visible

### `destination-picker.spec.ts`
1. Override `parse-input` to return `MOCK_DESTINATIONS` (null destination, 3 suggestions)
2. Type `"beach trip for spring break"`, click Plan It
3. Three destination cards: "Maui, Hawaii", "Cancun, Mexico", "San Diego, CA"
4. Click "Maui, Hawaii"
5. Generating screen appears
6. Results load with `"Maui, Hawaii"` in Hero tile

### `food-preferences.spec.ts`
1. Override `parse-input` to return vegan trip data (`vibe: "dining"`, `foodPreferences.dietary: ["vegan"]`)
2. Override `trip-plan` to return meal cards with vegan cuisine labels (`"Vegan Ramen"`, `"Plant-based Sushi"`)
3. Type trip, click Plan It, results load
4. Itinerary tile shows meal cards
5. Cuisine badges include `"Vegan"` label

### `error-states.spec.ts`
| Scenario | Route override | Assertion |
|----------|---------------|-----------|
| Parse input 500 | `parse-input` → 500 | Error message visible on screen |
| Trip plan 500 | `trip-plan` → 500 | Error message visible |
| Rate limit 429 | `trip-plan` → 429 + `{ error: "Too many requests..." }` | Error message visible |
| Empty itinerary | `trip-plan` → 200 with `scheduledItinerary: [], tripPlan.dailyItinerary: []` | "No itinerary data yet" in itinerary tile |
| Null safety data | `safety/travel-tips` → 200 with `{}` | Safety tile renders without crashing |

---

## Smoke Tests

Runs against `https://sproutroute-production.up.railway.app`. No API mocking. No real trip generation (to avoid spending API credits). Structural assertions only.

### `production.spec.ts`
| Test | Assertion |
|------|-----------|
| Health check | `GET /api/health` → `{ status: "ok" }` |
| App loads | `GET /` → page title contains `/SproutRoute\|Sprout/i` |
| Parse input returns shape | POST `{ text: "beach trip to Maui next April" }` → response has `destination` key AND `suggestedDestinations` is an array |
| Trip plan returns shape | POST minimal trip data → response has `trip`, `weather`, `tripPlan`, `scheduledItinerary` keys — no content assertions |

---

## CI Integration

New GitHub Actions workflow: `.github/workflows/e2e.yml`

```yaml
name: E2E Tests
on:
  push:
    branches: [main, "feature/**"]
  pull_request:

jobs:
  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - name: Install root deps
        run: npm ci
      - name: Install frontend deps
        run: cd src/frontend && npm ci
      - name: Install Playwright Chromium
        run: npx playwright install --with-deps chromium
      - name: Run mocked E2E tests
        run: npx playwright test --project=mocked
      - name: Upload report on failure
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report
          path: playwright-report/
```

Notes:
- `--project=mocked` excludes smoke tests; no `ANTHROPIC_API_KEY` needed (backend not started)
- Smoke tests (`--project=smoke`) are run locally only: `npx playwright test --project=smoke`
- Existing `.github/workflows/test.yml` (unit/integration tests) is unchanged

---

## Test Count Summary

| Layer | Files | Est. Tests |
|-------|-------|-----------|
| Tiles | 6 | ~38 |
| Screens | 2 | ~9 |
| Flows | 4 | ~20 |
| Smoke | 1 | 4 |
| **Total** | **13** | **~71** |

---

## Out of Scope

- Visual regression / screenshot diffing
- Firefox / WebKit browser matrix (Chromium only for speed)
- Mobile viewport testing (Phase 3 — React Native)
- Performance / Lighthouse tests
- Packing list check/uncheck tests (blocked pending `PackingChecklist` integration into `ResultsScreen`)
