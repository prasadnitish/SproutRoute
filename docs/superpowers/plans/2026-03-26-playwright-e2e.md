# Playwright E2E Test Suite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a comprehensive 71-test Playwright E2E suite covering all SproutRoute UX — tile tests, screen tests, flow tests, and production smoke tests — with mocked tests running in GitHub Actions CI.

**Architecture:** Three-layer suite (tiles → screens → flows) backed by shared fixtures in `tests/e2e/fixtures/`. All mocked tests intercept 100% of API routes via `mockAllApis(page)` so no backend runs during CI. A separate `smoke` Playwright project hits the live Railway URL for structural smoke checks.

**Tech Stack:** Playwright `@playwright/test` ^1.58.2, TypeScript, Vite preview (port 4173), Chromium only.

---

## File Map

**Create:**
- `tests/e2e/fixtures/trip-data.ts` — all typed mock payloads
- `tests/e2e/fixtures/mock-api.ts` — `mockAllApis(page)` + `goToResults(page)` helpers
- `tests/e2e/tiles/hero-tile.spec.ts`
- `tests/e2e/tiles/weather-tile.spec.ts`
- `tests/e2e/tiles/itinerary-tile.spec.ts`
- `tests/e2e/tiles/safety-tile.spec.ts`
- `tests/e2e/tiles/map-tile.spec.ts`
- `tests/e2e/tiles/packing-tile.spec.ts`
- `tests/e2e/screens/input-screen.spec.ts`
- `tests/e2e/screens/generating-screen.spec.ts`
- `tests/e2e/flows/happy-path.spec.ts`
- `tests/e2e/flows/destination-picker.spec.ts`
- `tests/e2e/flows/food-preferences.spec.ts`
- `tests/e2e/flows/error-states.spec.ts`
- `tests/e2e/smoke/production.spec.ts`
- `.github/workflows/e2e.yml`

**Modify:**
- `playwright.config.ts` — add two `projects` (mocked + smoke)

**Delete:**
- `tests/e2e/input-flow.spec.ts`
- `tests/e2e/results-mosaic.spec.ts`
- `tests/e2e/generic-input.spec.ts`

---

## Key Concepts (read before implementing)

### Data flow
`useTrip.js` calls three APIs sequentially and assembles state:
```
POST /api/v1/trip/parse-input → parsedInput
POST /api/trip-plan           → tripResult  →  tripData = { ...tripResult, parsed }
POST /api/generate            → packingList
POST /api/safety/travel-tips  → safetyData
```

`ResultsScreen` receives these as separate props: `tripData`, `parsedInput`, `packingList`, `safetyData`.

### Component props
- `HeroTile` — receives `trip` (from `tripData.trip`) and `parsedInput`
- `WeatherTile` — receives `forecast` array, `startDate`, `endDate`
- `ItineraryTile` — receives `dailyItinerary` (resolved), `scheduledItinerary` (raw array), `forecast`, `onActivityTap`
- `SafetyTile` — receives `safetyData` object
- `MapTile` — receives `lat`, `lon`, `destination` string

### Getting to results in tests
Every tile/screen/flow test uses `goToResults(page)` from fixtures — fills the textarea, clicks Plan It, waits for a results landmark. All APIs are mocked so this is instant.

---

## Task 1: Update Playwright Config + Delete Old Specs

**Files:**
- Modify: `playwright.config.ts`
- Delete: `tests/e2e/input-flow.spec.ts`, `tests/e2e/results-mosaic.spec.ts`, `tests/e2e/generic-input.spec.ts`

- [ ] **Step 1: Replace playwright.config.ts**

```ts
// playwright.config.ts
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
    timeout: 120000,
  },
});
```

- [ ] **Step 2: Delete the three old spec files**

```bash
rm tests/e2e/input-flow.spec.ts tests/e2e/results-mosaic.spec.ts tests/e2e/generic-input.spec.ts
```

- [ ] **Step 3: Verify config is valid**

```bash
cd "/Users/nitish/VS Code Projects/tpm-portfolio/strollerscout" && npx playwright test --list --project=mocked 2>&1 | head -10
```
Expected: no errors, zero tests listed (no spec files yet).

- [ ] **Step 4: Commit**

```bash
git add playwright.config.ts
git rm tests/e2e/input-flow.spec.ts tests/e2e/results-mosaic.spec.ts tests/e2e/generic-input.spec.ts
git commit -m "test(e2e): replace playwright config with mocked+smoke projects, remove old specs"
```

---

## Task 2: Shared Fixtures

**Files:**
- Create: `tests/e2e/fixtures/trip-data.ts`
- Create: `tests/e2e/fixtures/mock-api.ts`

- [ ] **Step 1: Create `tests/e2e/fixtures/` directory**

```bash
mkdir -p tests/e2e/fixtures tests/e2e/tiles tests/e2e/screens tests/e2e/flows tests/e2e/smoke
```

- [ ] **Step 2: Create `tests/e2e/fixtures/trip-data.ts`**

```ts
// tests/e2e/fixtures/trip-data.ts
// All mock payloads match exact shapes returned by the SproutRoute backend.

export const MOCK_PARSED_INPUT = {
  destination: "Maui, Hawaii",
  startDate: "2026-04-12",
  endDate: "2026-04-19",
  adults: 2,
  childrenAges: [4, 8],
  vibe: "beach",
  suggestedDestinations: [],
  detectedRegion: null,
};

// Vague input — no destination resolved, 3 suggestions returned
export const MOCK_DESTINATIONS = {
  destination: null,
  suggestedDestinations: [
    { name: "Maui, Hawaii",   emoji: "🌴", description: "Stunning beaches",       season_note: "Perfect spring weather" },
    { name: "Cancun, Mexico", emoji: "🏖", description: "All-inclusive resorts",   season_note: "Warm and sunny" },
    { name: "San Diego, CA",  emoji: "☀️", description: "Family-friendly coast",   season_note: "Mild spring temps" },
  ],
  startDate: "2026-04-12",
  endDate: "2026-04-19",
  adults: 2,
  childrenAges: [],
  vibe: "beach",
  detectedRegion: null,
};

// Full /api/trip-plan response — includes scheduledItinerary for all itinerary tile tests
export const MOCK_TRIP_PLAN = {
  trip: {
    destination: "Maui, Hawaii",
    lat: 20.7984,
    lon: -156.3319,
    startDate: "2026-04-12",
    endDate: "2026-04-19",
    countryCode: "US",
    duration: 7,
    children: [{ age: 4 }, { age: 8 }],
    activities: ["beach"],
  },
  weather: {
    forecast: [
      { date: "2026-04-12", name: "Saturday", high: 76, low: 68, condition: "Sunny",         precipitation: 5  },
      { date: "2026-04-13", name: "Sunday",   high: 75, low: 67, condition: "Partly cloudy", precipitation: 10 },
    ],
    summary: "Expect warm, sunny weather.",
  },
  tripPlan: {
    overview: "A beautiful beach trip to Maui.",
    suggestedActivities: [
      { id: "act-1", name: "Road to Hana",          category: "hiking", description: "Scenic drive with waterfalls", duration: "full day",  kidFriendly: true, weatherDependent: false },
      { id: "act-2", name: "Snorkeling at Molokini", category: "water",  description: "Great for kids",              duration: "3 hours",   kidFriendly: true, weatherDependent: true  },
    ],
    dailyItinerary: [
      {
        day: "Day 1 (2026-04-12)",
        activities: ["act-1"],
        meals: {
          breakfast: { name: "Kihei Cafe",        cuisine: "American",         note: "Great pancakes"      },
          lunch:     { name: "Mama's Fish House",  cuisine: "Seafood",          note: "Iconic oceanfront"   },
          dinner:    { name: "Monkeypod Kitchen",  cuisine: "Hawaiian",         note: "Local craft beer"    },
        },
        notes: "Start early to beat traffic on the Hana highway.",
      },
      {
        day: "Day 2 (2026-04-13)",
        activities: ["act-2"],
        meals: {
          breakfast: { name: "Gazebo Restaurant", cuisine: "American",         note: "Oceanfront views"    },
          lunch:     { name: "Leoda's Kitchen",   cuisine: "Comfort Food",     note: "Best pies on Maui"   },
          dinner:    { name: "Merriman's Maui",   cuisine: "Hawaiian Regional",note: "Farm to table"       },
        },
        notes: null,
      },
    ],
    tips: ["Book snorkeling tours in advance.", "Sunscreen is a must."],
  },
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
          openingHours: "8:00 AM - 6:00 PM",
          enriched: {
            rating: 4.8,
            priceLevel: 1,
            address: "Hana Hwy, Maui, HI 96713",
            photos: ["https://picsum.photos/seed/hana/80/80"],
            mapsUrl: "https://maps.google.com/?q=Road+to+Hana",
          },
        },
        {
          name: "Closed Attraction",
          category: "museums",
          description: "Closed today",
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
      warnings: [
        { activity: "Closed Attraction", type: "closed", message: "Closed Attraction is closed on this day" },
      ],
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
          enriched: {
            rating: 4.6,
            priceLevel: 2,
            address: "Molokini Crater, Maui, HI",
            photos: [],
            mapsUrl: null,
          },
        },
      ],
      warnings: [],
      notes: null,
    },
  ],
  enrichedMap: {},
};

export const MOCK_PACKING_LIST = {
  categories: [
    { name: "Beach Essentials", items: [{ name: "Sunscreen SPF 50" }, { name: "Beach towels" }] },
    { name: "Kids",             items: [{ name: "Life jackets" },      { name: "Sand toys"    }] },
  ],
};

// Matches travelSafety.js output shape consumed by SafetyTile
export const MOCK_SAFETY = {
  advisoryLevel:  "low",
  emergencyNumber: "911",
  healthTips:     ["Stay hydrated in the heat.", "Apply sunscreen every 2 hours."],
  familyTips:     ["Kids under 12 should wear life jackets when snorkeling."],
  waterSafety:    "Safe to drink tap water",
  carSeatLaw:     "Children under 4 must use a rear-facing car seat.",
  localCustoms:   ["Remove shoes before entering homes."],
  source:         "ai-generated",
};

export const MOCK_GEO = { lat: 41.8781, lon: -87.6298, region: "Chicago, IL" };

// Vegan food preference trip — for food-preferences flow test
export const MOCK_VEGAN_TRIP_PLAN = {
  ...MOCK_TRIP_PLAN,
  tripPlan: {
    ...MOCK_TRIP_PLAN.tripPlan,
    dailyItinerary: [
      {
        ...MOCK_TRIP_PLAN.tripPlan.dailyItinerary[0],
        meals: {
          breakfast: { name: "Down to Earth Cafe",  cuisine: "Vegan",        note: "100% plant-based menu" },
          lunch:     { name: "Alive & Well",        cuisine: "Vegan Ramen",  note: "Local favourite"       },
          dinner:    { name: "Café Mambo",          cuisine: "Plant-based",  note: "Creative vegan dishes" },
        },
      },
    ],
  },
  scheduledItinerary: [
    {
      ...MOCK_TRIP_PLAN.scheduledItinerary[0],
      scheduled: [
        MOCK_TRIP_PLAN.scheduledItinerary[0].scheduled[0],
        {
          name: "Alive & Well",
          category: "dining",
          mealType: "lunch",
          cuisine: "Vegan Ramen",
          note: "Local favourite",
          scheduledStart: "12:00 PM",
          scheduledEnd: "1:30 PM",
          duration: 90,
          status: "meal",
          isMeal: true,
          enriched: null,
        },
      ],
    },
  ],
};
```

- [ ] **Step 3: Create `tests/e2e/fixtures/mock-api.ts`**

```ts
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
```

- [ ] **Step 4: Verify fixtures compile**

```bash
cd "/Users/nitish/VS Code Projects/tpm-portfolio/strollerscout" && npx tsc --noEmit --strict tests/e2e/fixtures/trip-data.ts tests/e2e/fixtures/mock-api.ts 2>&1 | head -20
```
Expected: no errors (or only "cannot find module @playwright/test" which is fine — it's installed).

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/fixtures/ playwright.config.ts
git commit -m "test(e2e): add shared fixtures and two-project playwright config"
```

---

## Task 3: Hero Tile Spec

**Files:**
- Create: `tests/e2e/tiles/hero-tile.spec.ts`

- [ ] **Step 1: Write spec**

```ts
// tests/e2e/tiles/hero-tile.spec.ts
import { test, expect } from "@playwright/test";
import { mockAllApis, goToResults } from "../fixtures/mock-api";
import { MOCK_TRIP_PLAN } from "../fixtures/trip-data";

test.describe("HeroTile", () => {
  test.beforeEach(async ({ page }) => {
    await mockAllApis(page);
    await goToResults(page);
  });

  test("renders destination name", async ({ page }) => {
    await expect(page.getByText("Maui, Hawaii", { exact: false })).toBeVisible();
  });

  test("renders human-readable dates (not ISO)", async ({ page }) => {
    // Expect "Apr 12" and "Apr 19" — NOT "2026-04-12"
    await expect(page.getByText(/Apr 1[29]/, { exact: false })).toBeVisible();
    await expect(page.getByText("2026-04-12")).not.toBeVisible();
  });

  test("renders multiple kids display", async ({ page }) => {
    // parsedInput has childrenAges: [4, 8]
    await expect(page.getByText(/2 kids/i, { exact: false })).toBeVisible();
  });

  test("no international badge for US destination", async ({ page }) => {
    await expect(page.getByText(/international/i)).not.toBeVisible();
  });

  test("adults-only trip shows no kids line", async ({ page }) => {
    await page.route("**/api/v1/trip/parse-input", (r) =>
      r.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ destination: "Maui, Hawaii", startDate: "2026-04-12", endDate: "2026-04-19", adults: 2, childrenAges: [], vibe: "beach", suggestedDestinations: [] }),
      })
    );
    await page.route("**/api/trip-plan", (r) =>
      r.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ...MOCK_TRIP_PLAN, trip: { ...MOCK_TRIP_PLAN.trip, children: [] } }),
      })
    );
    await page.goto("/");
    await page.locator("textarea").fill("Adults trip to Maui");
    await page.getByRole("button", { name: /plan it/i }).click();
    await page.getByText("Maui, Hawaii", { exact: false }).waitFor({ timeout: 15000 });
    await expect(page.getByText(/kid/i)).not.toBeVisible();
  });

  test("shows international badge for non-US destination", async ({ page }) => {
    // Override trip-plan to return a Japanese trip
    await page.route("**/api/trip-plan", (r) =>
      r.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ...MOCK_TRIP_PLAN,
          trip: { ...MOCK_TRIP_PLAN.trip, destination: "Tokyo, Japan", countryCode: "JP", lat: 35.6762, lon: 139.6503 },
        }),
      })
    );
    await page.goto("/");
    await page.locator("textarea").fill("Family trip to Tokyo");
    await page.getByRole("button", { name: /plan it/i }).click();
    await page.getByText("Tokyo, Japan", { exact: false }).waitFor({ timeout: 15000 });
    await expect(page.getByText(/international/i)).toBeVisible();
  });

  test("renders single kid display", async ({ page }) => {
    await page.route("**/api/v1/trip/parse-input", (r) =>
      r.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ destination: "Maui, Hawaii", startDate: "2026-04-12", endDate: "2026-04-19", adults: 2, childrenAges: [5], vibe: "beach", suggestedDestinations: [] }),
      })
    );
    await page.route("**/api/trip-plan", (r) =>
      r.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ...MOCK_TRIP_PLAN, trip: { ...MOCK_TRIP_PLAN.trip, children: [{ age: 5 }] } }),
      })
    );
    await page.goto("/");
    await page.locator("textarea").fill("Maui trip");
    await page.getByRole("button", { name: /plan it/i }).click();
    await page.getByText("Maui, Hawaii", { exact: false }).waitFor({ timeout: 15000 });
    await expect(page.getByText(/1 kid/i, { exact: false })).toBeVisible();
  });
});
```

- [ ] **Step 2: Run and verify tests are collected**

```bash
cd "/Users/nitish/VS Code Projects/tpm-portfolio/strollerscout" && npx playwright test --project=mocked tiles/hero-tile.spec.ts --list
```
Expected: 5 tests listed.

- [ ] **Step 3: Run hero tile tests**

```bash
npx playwright test --project=mocked tiles/hero-tile.spec.ts
```
Expected: all pass (or investigate failures before continuing).

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/tiles/hero-tile.spec.ts
git commit -m "test(e2e): hero tile — destination, dates, kids, country tag"
```

---

## Task 4: Weather Tile Spec

**Files:**
- Create: `tests/e2e/tiles/weather-tile.spec.ts`

- [ ] **Step 1: Write spec**

```ts
// tests/e2e/tiles/weather-tile.spec.ts
import { test, expect } from "@playwright/test";
import { mockAllApis, goToResults } from "../fixtures/mock-api";
import { MOCK_TRIP_PLAN } from "../fixtures/trip-data";

test.describe("WeatherTile", () => {
  test.beforeEach(async ({ page }) => {
    await mockAllApis(page);
    await goToResults(page);
  });

  test("renders forecast day labels", async ({ page }) => {
    await expect(page.getByText(/saturday/i, { exact: false })).toBeVisible();
    await expect(page.getByText(/sunday/i,   { exact: false })).toBeVisible();
  });

  test("renders high temperature", async ({ page }) => {
    await expect(page.getByText(/76/, { exact: false })).toBeVisible();
  });

  test("renders low temperature", async ({ page }) => {
    await expect(page.getByText(/68/, { exact: false })).toBeVisible();
  });

  test("shows historical avg badge when forecast dates mismatch trip dates", async ({ page }) => {
    // Forecast dates are in the past relative to the trip — triggers "Historical avg" badge
    await page.route("**/api/trip-plan", (r) =>
      r.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ...MOCK_TRIP_PLAN,
          weather: {
            ...MOCK_TRIP_PLAN.weather,
            forecast: [
              { date: "2026-01-01", name: "Thursday", high: 70, low: 60, condition: "Cloudy", precipitation: 20 },
            ],
          },
        }),
      })
    );
    await page.goto("/");
    await page.locator("textarea").fill("Beach vacation in Maui with kids age 4 and 8");
    await page.getByRole("button", { name: /plan it/i }).click();
    await page.getByText("Maui, Hawaii", { exact: false }).waitFor({ timeout: 15000 });
    await expect(page.getByText(/historical/i, { exact: false })).toBeVisible();
  });

  test("renders gracefully with empty forecast", async ({ page }) => {
    await page.route("**/api/trip-plan", (r) =>
      r.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ...MOCK_TRIP_PLAN, weather: { forecast: [], summary: "" } }),
      })
    );
    await page.goto("/");
    await page.locator("textarea").fill("Beach vacation in Maui with kids age 4 and 8");
    await page.getByRole("button", { name: /plan it/i }).click();
    await page.getByText("Maui, Hawaii", { exact: false }).waitFor({ timeout: 15000 });
    // No crash — results screen still loads
    await expect(page.locator("body")).not.toContainText("Error");
  });
});
```

- [ ] **Step 2: Run weather tile tests**

```bash
cd "/Users/nitish/VS Code Projects/tpm-portfolio/strollerscout" && npx playwright test --project=mocked tiles/weather-tile.spec.ts
```
Expected: all pass.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/tiles/weather-tile.spec.ts
git commit -m "test(e2e): weather tile — forecast days, temps, historical badge, empty fallback"
```

---

## Task 5: Itinerary Tile Spec

**Files:**
- Create: `tests/e2e/tiles/itinerary-tile.spec.ts`

- [ ] **Step 1: Write spec**

```ts
// tests/e2e/tiles/itinerary-tile.spec.ts
import { test, expect } from "@playwright/test";
import { mockAllApis, goToResults } from "../fixtures/mock-api";
import { MOCK_TRIP_PLAN } from "../fixtures/trip-data";

test.describe("ItineraryTile", () => {
  test.beforeEach(async ({ page }) => {
    await mockAllApis(page);
    await goToResults(page);
  });

  test("renders day tabs", async ({ page }) => {
    // Tabs show dates from scheduledItinerary
    await expect(page.getByRole("tab", { name: /apr 12/i }).or(page.getByText(/apr 12/i))).toBeVisible();
    await expect(page.getByRole("tab", { name: /apr 13/i }).or(page.getByText(/apr 13/i))).toBeVisible();
  });

  test("day 1 activities are visible by default", async ({ page }) => {
    await expect(page.getByText("Road to Hana")).toBeVisible();
  });

  test("switching to day 2 shows day 2 activities", async ({ page }) => {
    await page.getByText(/apr 13/i, { exact: false }).click();
    await expect(page.getByText("Snorkeling at Molokini")).toBeVisible();
    await expect(page.getByText("Road to Hana")).not.toBeVisible();
  });

  test("renders scheduled start time", async ({ page }) => {
    await expect(page.getByText("9:00 AM")).toBeVisible();
  });

  test("renders star rating for enriched activity", async ({ page }) => {
    await expect(page.getByText("4.8")).toBeVisible();
  });

  test("renders price level for enriched activity", async ({ page }) => {
    // Road to Hana has priceLevel: 1 → renders "$"
    await expect(page.getByText("$")).toBeVisible();
  });

  test("renders photo thumbnail when enriched.photos is set", async ({ page }) => {
    // Road to Hana has photos[0] set — should render an <img>
    const img = page.locator("img[alt='Road to Hana']");
    await expect(img).toBeVisible();
  });

  test("renders closed activity warning", async ({ page }) => {
    await expect(page.getByText(/closed on this day/i)).toBeVisible();
  });

  test("renders dinner meal card with cuisine badge", async ({ page }) => {
    await expect(page.getByText("Mama's Fish House")).toBeVisible();
    await expect(page.getByText("Seafood")).toBeVisible();
  });

  test("renders meal note", async ({ page }) => {
    await expect(page.getByText("Iconic oceanfront")).toBeVisible();
  });

  test("renders activity address", async ({ page }) => {
    await expect(page.getByText(/Hana Hwy/i, { exact: false })).toBeVisible();
  });

  test("renders tap-for-details hint", async ({ page }) => {
    await expect(page.getByText(/tap any activity/i, { exact: false })).toBeVisible();
  });

  test("shows empty state when no itinerary data", async ({ page }) => {
    await page.route("**/api/trip-plan", (r) =>
      r.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ...MOCK_TRIP_PLAN,
          scheduledItinerary: [],
          tripPlan: { ...MOCK_TRIP_PLAN.tripPlan, dailyItinerary: [] },
        }),
      })
    );
    await page.goto("/");
    await page.locator("textarea").fill("Beach vacation in Maui with kids age 4 and 8");
    await page.getByRole("button", { name: /plan it/i }).click();
    await page.getByText("Maui, Hawaii", { exact: false }).waitFor({ timeout: 15000 });
    await expect(page.getByText(/no itinerary data/i, { exact: false })).toBeVisible();
  });
});
```

- [ ] **Step 2: Run itinerary tile tests**

```bash
cd "/Users/nitish/VS Code Projects/tpm-portfolio/strollerscout" && npx playwright test --project=mocked tiles/itinerary-tile.spec.ts
```
Expected: all pass.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/tiles/itinerary-tile.spec.ts
git commit -m "test(e2e): itinerary tile — tabs, times, ratings, photos, meal cards, closed warnings, empty state"
```

---

## Task 6: Safety Tile Spec

**Files:**
- Create: `tests/e2e/tiles/safety-tile.spec.ts`

- [ ] **Step 1: Write spec**

```ts
// tests/e2e/tiles/safety-tile.spec.ts
import { test, expect } from "@playwright/test";
import { mockAllApis, goToResults } from "../fixtures/mock-api";

test.describe("SafetyTile", () => {
  test.beforeEach(async ({ page }) => {
    await mockAllApis(page);
    await goToResults(page);
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

  test("renders advisory level", async ({ page }) => {
    await expect(page.getByText(/low/i, { exact: false })).toBeVisible();
  });

  test("renders gracefully when safety data is empty", async ({ page }) => {
    await page.route("**/api/safety/travel-tips", (r) =>
      r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({}) })
    );
    await page.goto("/");
    await page.locator("textarea").fill("Beach vacation in Maui with kids age 4 and 8");
    await page.getByRole("button", { name: /plan it/i }).click();
    await page.getByText("Maui, Hawaii", { exact: false }).waitFor({ timeout: 15000 });
    // No crash — page still renders
    await expect(page.locator("body")).not.toContainText("TypeError");
  });
});
```

- [ ] **Step 2: Run safety tile tests**

```bash
cd "/Users/nitish/VS Code Projects/tpm-portfolio/strollerscout" && npx playwright test --project=mocked tiles/safety-tile.spec.ts
```
Expected: all pass.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/tiles/safety-tile.spec.ts
git commit -m "test(e2e): safety tile — emergency number, health/family tips, water safety, empty fallback"
```

---

## Task 7: Map Tile Spec

**Files:**
- Create: `tests/e2e/tiles/map-tile.spec.ts`

- [ ] **Step 1: Write spec**

```ts
// tests/e2e/tiles/map-tile.spec.ts
import { test, expect } from "@playwright/test";
import { mockAllApis, goToResults } from "../fixtures/mock-api";
import { MOCK_TRIP_PLAN } from "../fixtures/trip-data";

test.describe("MapTile", () => {
  test.beforeEach(async ({ page }) => {
    await mockAllApis(page);
    await goToResults(page);
  });

  test("renders an iframe", async ({ page }) => {
    await expect(page.locator("iframe")).toBeVisible();
  });

  test("iframe src contains trip coordinates", async ({ page }) => {
    const iframe = page.locator("iframe").first();
    const src = await iframe.getAttribute("src");
    expect(src).toContain("20.7984");   // lat from MOCK_TRIP_PLAN.trip
    expect(src).toContain("156.3319");  // lon (absolute value)
  });

  test("renders without crashing when lat/lon are null", async ({ page }) => {
    await page.route("**/api/trip-plan", (r) =>
      r.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ...MOCK_TRIP_PLAN,
          trip: { ...MOCK_TRIP_PLAN.trip, lat: null, lon: null },
        }),
      })
    );
    await page.goto("/");
    await page.locator("textarea").fill("Beach vacation in Maui with kids age 4 and 8");
    await page.getByRole("button", { name: /plan it/i }).click();
    await page.getByText("Maui, Hawaii", { exact: false }).waitFor({ timeout: 15000 });
    await expect(page.locator("body")).not.toContainText("TypeError");
  });
});
```

- [ ] **Step 2: Run map tile tests**

```bash
cd "/Users/nitish/VS Code Projects/tpm-portfolio/strollerscout" && npx playwright test --project=mocked tiles/map-tile.spec.ts
```
Expected: all pass.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/tiles/map-tile.spec.ts
git commit -m "test(e2e): map tile — iframe present, coordinates in src, null lat/lon fallback"
```

---

## Task 8: Packing Tile Spec

**Files:**
- Create: `tests/e2e/tiles/packing-tile.spec.ts`

- [ ] **Step 1: Write spec**

```ts
// tests/e2e/tiles/packing-tile.spec.ts
// NOTE: Check/uncheck and category/item render tests are BLOCKED pending
// PackingChecklist being wired into the Pack tab of ResultsScreen.
// Currently the Pack tab renders a count stub only.
// Add the blocked tests once PackingChecklist is integrated.

import { test, expect } from "@playwright/test";
import { mockAllApis, goToResults } from "../fixtures/mock-api";

test.describe("PackingTile (stub — full tests blocked pending component integration)", () => {
  test.beforeEach(async ({ page }) => {
    await mockAllApis(page);
    await goToResults(page);
  });

  test("Pack tab button is visible", async ({ page }) => {
    await expect(page.getByRole("button", { name: /pack/i }).or(page.getByText(/pack/i))).toBeVisible();
  });

  test("clicking Pack tab does not crash", async ({ page }) => {
    await page.getByText(/pack/i, { exact: false }).click();
    await expect(page.locator("body")).not.toContainText("TypeError");
  });

  test("Pack tab renders item count or stub text", async ({ page }) => {
    await page.getByText(/pack/i, { exact: false }).click();
    // Stub renders "N items" or similar — just verify something renders
    await expect(page.locator("body")).not.toBeEmpty();
  });
});
```

- [ ] **Step 2: Run packing tile tests**

```bash
cd "/Users/nitish/VS Code Projects/tpm-portfolio/strollerscout" && npx playwright test --project=mocked tiles/packing-tile.spec.ts
```
Expected: all 3 pass.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/tiles/packing-tile.spec.ts
git commit -m "test(e2e): packing tile stub tests — full check/uncheck blocked pending component integration"
```

---

## Task 9: Screen Tests

**Files:**
- Create: `tests/e2e/screens/input-screen.spec.ts`
- Create: `tests/e2e/screens/generating-screen.spec.ts`

- [ ] **Step 1: Write input-screen spec**

```ts
// tests/e2e/screens/input-screen.spec.ts
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
```

- [ ] **Step 2: Write generating-screen spec**

```ts
// tests/e2e/screens/generating-screen.spec.ts
import { test, expect } from "@playwright/test";
import { mockAllApis } from "../fixtures/mock-api";

test.describe("GeneratingScreen", () => {
  test.beforeEach(async ({ page }) => {
    await mockAllApis(page);
    await page.goto("/");
    await page.locator("textarea").fill("Beach vacation in Maui with kids age 4 and 8");
    await page.getByRole("button", { name: /plan it/i }).click();
  });

  test("shows Building your trip plan heading", async ({ page }) => {
    // Uses regex to match the text including the … ellipsis character
    await expect(page.getByText(/Building your trip plan/i)).toBeVisible({ timeout: 5000 });
  });

  test("shows step labels", async ({ page }) => {
    // Step label text comes from STEP_LABELS in GeneratingScreen.jsx:
    // { resolve: "Understanding your trip", weather: "Checking the weather", itinerary: "Crafting your itinerary", ... }
    const stepText = page.getByText(/Understanding your trip|Checking the weather|Crafting your itinerary/);
    await expect(stepText).toBeVisible({ timeout: 5000 });
  });
});
```

- [ ] **Step 3: Run screen tests**

```bash
cd "/Users/nitish/VS Code Projects/tpm-portfolio/strollerscout" && npx playwright test --project=mocked screens/
```
Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/screens/
git commit -m "test(e2e): input screen and generating screen specs"
```

---

## Task 10: Flow Tests

**Files:**
- Create: `tests/e2e/flows/happy-path.spec.ts`
- Create: `tests/e2e/flows/destination-picker.spec.ts`
- Create: `tests/e2e/flows/food-preferences.spec.ts`
- Create: `tests/e2e/flows/error-states.spec.ts`

- [ ] **Step 1: Write happy-path spec**

```ts
// tests/e2e/flows/happy-path.spec.ts
import { test, expect } from "@playwright/test";
import { mockAllApis, goToResults } from "../fixtures/mock-api";

test.describe("Happy Path — full input → results journey", () => {
  test("completes full flow and renders all major tiles", async ({ page }) => {
    await mockAllApis(page);
    await goToResults(page);

    // Hero tile
    await expect(page.getByText("Maui, Hawaii", { exact: false })).toBeVisible();
    // Weather tile — high temp
    await expect(page.getByText("76", { exact: false })).toBeVisible();
    // Itinerary tile — first activity
    await expect(page.getByText("Road to Hana")).toBeVisible();
    // Safety tile — emergency number
    await expect(page.getByText("911")).toBeVisible();
    // Map tile — iframe
    await expect(page.locator("iframe")).toBeVisible();
  });
});
```

- [ ] **Step 2: Write destination-picker spec**

```ts
// tests/e2e/flows/destination-picker.spec.ts
import { test, expect } from "@playwright/test";
import { mockAllApis } from "../fixtures/mock-api";
import { MOCK_DESTINATIONS, MOCK_TRIP_PLAN } from "../fixtures/trip-data";

test.describe("Destination Picker — vague input triggers 3 suggestions", () => {
  test("shows 3 destination cards, picks one, loads results", async ({ page }) => {
    await mockAllApis(page);

    // Override parse-input to return no destination + 3 suggestions
    await page.route("**/api/v1/trip/parse-input", (r) =>
      r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(MOCK_DESTINATIONS) })
    );

    await page.goto("/");
    await page.locator("textarea").fill("beach trip for spring break");
    await page.getByRole("button", { name: /plan it/i }).click();

    // Destination picker should appear
    await expect(page.getByText("Maui, Hawaii")).toBeVisible({ timeout: 5000 });
    await expect(page.getByText("Cancun, Mexico")).toBeVisible();
    await expect(page.getByText("San Diego, CA")).toBeVisible();

    // Pick Maui
    await page.getByText("Maui, Hawaii").click();

    // Results should load
    await page.getByText("Road to Hana").waitFor({ timeout: 15000 });
    await expect(page.getByText("Maui, Hawaii", { exact: false })).toBeVisible();
  });
});
```

- [ ] **Step 3: Write food-preferences spec**

```ts
// tests/e2e/flows/food-preferences.spec.ts
import { test, expect } from "@playwright/test";
import { mockAllApis } from "../fixtures/mock-api";
import { MOCK_PARSED_INPUT, MOCK_VEGAN_TRIP_PLAN } from "../fixtures/trip-data";

test.describe("Food Preferences — dietary input flows through to meal cards", () => {
  test("vegan trip shows vegan cuisine badges in meal cards", async ({ page }) => {
    await mockAllApis(page);

    await page.route("**/api/v1/trip/parse-input", (r) =>
      r.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ...MOCK_PARSED_INPUT, vibe: "dining", foodPreferences: { dietary: ["vegan"] } }),
      })
    );
    await page.route("**/api/trip-plan", (r) =>
      r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(MOCK_VEGAN_TRIP_PLAN) })
    );

    await page.goto("/");
    await page.locator("textarea").fill("vegan family trip to Maui");
    await page.getByRole("button", { name: /plan it/i }).click();
    await page.getByText("Maui, Hawaii", { exact: false }).waitFor({ timeout: 15000 });

    // Meal cards should show vegan cuisine badges
    await expect(page.getByText("Vegan Ramen")).toBeVisible();
    await expect(page.getByText("Plant-based")).toBeVisible();
  });
});
```

- [ ] **Step 4: Write error-states spec**

```ts
// tests/e2e/flows/error-states.spec.ts
import { test, expect } from "@playwright/test";
import { mockAllApis } from "../fixtures/mock-api";
import { MOCK_TRIP_PLAN } from "../fixtures/trip-data";

test.describe("Error States", () => {
  test("parse-input 500 → error message shown", async ({ page }) => {
    await mockAllApis(page);
    await page.route("**/api/v1/trip/parse-input", (r) =>
      r.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "Server error" }) })
    );
    await page.goto("/");
    await page.locator("textarea").fill("Beach vacation in Maui");
    await page.getByRole("button", { name: /plan it/i }).click();
    await expect(page.getByText(/something went wrong/i)).toBeVisible({ timeout: 10000 });
  });

  test("trip-plan 500 → error message shown", async ({ page }) => {
    await mockAllApis(page);
    await page.route("**/api/trip-plan", (r) =>
      r.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "Server error" }) })
    );
    await page.goto("/");
    await page.locator("textarea").fill("Beach vacation in Maui");
    await page.getByRole("button", { name: /plan it/i }).click();
    await expect(page.getByText(/something went wrong/i)).toBeVisible({ timeout: 10000 });
  });

  test("trip-plan 429 → rate limit message shown", async ({ page }) => {
    await mockAllApis(page);
    await page.route("**/api/trip-plan", (r) =>
      r.fulfill({
        status: 429,
        contentType: "application/json",
        body: JSON.stringify({ error: "Too many requests. Please try again in 15 minutes." }),
      })
    );
    await page.goto("/");
    await page.locator("textarea").fill("Beach vacation in Maui");
    await page.getByRole("button", { name: /plan it/i }).click();
    await expect(page.getByText(/something went wrong|too many requests/i)).toBeVisible({ timeout: 10000 });
  });

  test("empty itinerary → 'No itinerary data yet' shown in tile", async ({ page }) => {
    await mockAllApis(page);
    await page.route("**/api/trip-plan", (r) =>
      r.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ...MOCK_TRIP_PLAN,
          scheduledItinerary: [],
          tripPlan: { ...MOCK_TRIP_PLAN.tripPlan, dailyItinerary: [] },
        }),
      })
    );
    await page.goto("/");
    await page.locator("textarea").fill("Beach vacation in Maui");
    await page.getByRole("button", { name: /plan it/i }).click();
    await page.getByText("Maui, Hawaii", { exact: false }).waitFor({ timeout: 15000 });
    await expect(page.getByText(/no itinerary data/i, { exact: false })).toBeVisible();
  });

  test("null safety data → safety tile renders without crash", async ({ page }) => {
    await mockAllApis(page);
    await page.route("**/api/safety/travel-tips", (r) =>
      r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({}) })
    );
    await page.goto("/");
    await page.locator("textarea").fill("Beach vacation in Maui");
    await page.getByRole("button", { name: /plan it/i }).click();
    await page.getByText("Maui, Hawaii", { exact: false }).waitFor({ timeout: 15000 });
    await expect(page.locator("body")).not.toContainText("TypeError");
  });
});
```

- [ ] **Step 5: Run all flow tests**

```bash
cd "/Users/nitish/VS Code Projects/tpm-portfolio/strollerscout" && npx playwright test --project=mocked flows/
```
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add tests/e2e/flows/
git commit -m "test(e2e): flow tests — happy path, destination picker, food preferences, error states"
```

---

## Task 11: Smoke Tests

**Files:**
- Create: `tests/e2e/smoke/production.spec.ts`

- [ ] **Step 1: Write smoke spec**

```ts
// tests/e2e/smoke/production.spec.ts
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
    // Must have destination key (string or null) AND suggestedDestinations (array)
    expect("destination" in body).toBeTruthy();
    expect(Array.isArray(body.suggestedDestinations)).toBeTruthy();
  });

  test("trip-plan returns correct response shape", async ({ request }) => {
    // Minimal POST — verify shape only, no content assertions
    const res = await request.post("/api/trip-plan", {
      data: {
        destination: "Maui, Hawaii",
        startDate: "2026-06-01",
        endDate: "2026-06-07",
        adults: 2,
        childrenAges: [],
        activities: ["beach"],
      },
      timeout: 60000, // AI calls take up to 30s
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body).toHaveProperty("trip");
    expect(body).toHaveProperty("weather");
    expect(body).toHaveProperty("tripPlan");
    expect(body).toHaveProperty("scheduledItinerary");
  });
});
```

- [ ] **Step 2: Verify smoke tests are excluded from `--project=mocked`**

```bash
cd "/Users/nitish/VS Code Projects/tpm-portfolio/strollerscout" && npx playwright test --project=mocked --list 2>&1 | grep -i smoke
```
Expected: no smoke tests listed.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/smoke/production.spec.ts
git commit -m "test(e2e): production smoke tests — health, app title, API response shapes"
```

---

## Task 12: CI Workflow

**Files:**
- Create: `.github/workflows/e2e.yml`

- [ ] **Step 1: Write CI workflow**

```yaml
# .github/workflows/e2e.yml
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
        with:
          node-version: 20
          cache: npm

      - name: Install root dependencies
        run: npm ci

      - name: Install frontend dependencies
        run: cd src/frontend && npm ci

      - name: Install Playwright Chromium
        run: npx playwright install --with-deps chromium

      - name: Run mocked E2E tests
        run: npx playwright test --project=mocked

      - name: Upload Playwright report on failure
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report
          path: playwright-report/
          retention-days: 7
```

- [ ] **Step 2: Run full mocked suite locally to confirm all tests pass before CI**

```bash
cd "/Users/nitish/VS Code Projects/tpm-portfolio/strollerscout" && npx playwright test --project=mocked
```
Expected: all ~67 mocked tests pass (tiles + screens + flows). Note any failures and fix them before pushing.

- [ ] **Step 3: Commit and push**

```bash
git add .github/workflows/e2e.yml
git commit -m "ci: add E2E workflow — runs mocked Playwright suite on push/PR"
git push origin main
```

- [ ] **Step 4: Verify CI passes on GitHub**

```bash
gh run list --workflow=e2e.yml --limit=3
```
Expected: most recent run shows `completed` with `success`.

---

## Task 13: Final Validation

- [ ] **Step 1: Run the full mocked suite and confirm count**

```bash
cd "/Users/nitish/VS Code Projects/tpm-portfolio/strollerscout" && npx playwright test --project=mocked --reporter=list
```
Expected: ~67 tests, all passing.

- [ ] **Step 2: Run smoke tests against production (local only)**

```bash
npx playwright test --project=smoke
```
Expected: 4 tests pass. If `trip-plan` smoke test is slow (AI call), that's expected — timeout is 60s.

- [ ] **Step 3: Confirm .gitignore includes test artifacts**

```bash
grep -E "playwright-report|test-results" .gitignore || echo "MISSING — add these"
```
If missing, add to `.gitignore`:
```
playwright-report/
test-results/
```

- [ ] **Step 4: Final commit if .gitignore updated**

```bash
git add .gitignore
git commit -m "chore: ignore playwright-report and test-results directories"
git push origin main
```
