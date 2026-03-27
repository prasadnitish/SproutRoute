# Playwright E2E Test Suite — Design Spec
**Date:** 2026-03-26
**Project:** SproutRoute
**Status:** Approved for implementation

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

Two Playwright projects in `playwright.config.ts`:

**`mocked`** (default, runs in CI)
- `testMatch`: `tiles/**`, `screens/**`, `flows/**`
- Browser: Chromium only
- `baseURL`: `http://localhost:4173`
- `webServer`: `vite build && vite preview --port 4173`

**`smoke`** (local only)
- `testMatch`: `smoke/**`
- Browser: Chromium only
- `baseURL`: `https://sproutroute-production.up.railway.app`
- No `webServer` — hits live Railway directly
- Excluded from CI (not in default project list)

---

## Shared Fixtures

### `fixtures/trip-data.ts`
Exports typed constants matching exact backend response shapes:

```ts
MOCK_PARSED_INPUT     // parse-input response: destination, dates, adults, childrenAges, vibe
MOCK_TRIP_PLAN        // trip-plan response: trip, weather, tripPlan, scheduledItinerary, enrichedMap
MOCK_PACKING_LIST     // generate response: categories with items
MOCK_SAFETY           // safety/travel-tips response: advisory, emergency, health, family, water
MOCK_GEO              // geo/detect response: lat, lon, region
MOCK_DESTINATIONS     // parse-input response with null destination + suggestedDestinations[]
```

`MOCK_TRIP_PLAN` uses current backend shapes:
- `tripPlan.dailyItinerary[].meals` as `{ breakfast: {name, cuisine, note}, lunch: {...}, dinner: {...} }`
- `scheduledItinerary[].scheduled[]` with `scheduledStart`, `scheduledEnd`, `enriched.rating`, `enriched.photos`
- At least one activity with `status: "closed"` and one with `warning` set

### `fixtures/mock-api.ts`
Exports `mockAllApis(page)` — sets up all route intercepts using the constants above. Every spec calls this in `beforeEach`. Individual specs can override specific routes after calling `mockAllApis` for error-state variants.

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
| International tag | Badge appears when `countryCode !== "US"` |
| Domestic trip | No international badge |

### `weather-tile.spec.ts`
| Test | Assertion |
|------|-----------|
| Forecast days render | Each day's label + condition visible |
| Hi/lo temperatures | `"76° / 68°"` format |
| Historical avg badge | Badge present when trip dates beyond forecast window |
| Missing forecast | Graceful fallback, no crash |

### `itinerary-tile.spec.ts`
| Test | Assertion |
|------|-----------|
| Day tabs render | Tab for each day visible |
| Day tab switching | Clicking Day 2 shows Day 2 activities |
| Scheduled time renders | `"9:00 AM"` visible on activity |
| Star rating renders | `★★★★` + numeric rating visible |
| Price level renders | `$`, `$$`, `$$$` visible |
| Photo thumbnail renders | `<img>` present when `enriched.photos[0]` set |
| Emoji fallback | Category emoji shows when no photo |
| Closed activity warning | Red "Closed on this day" visible |
| Closing-soon warning | Amber warning text visible |
| Breakfast card | ☕ emoji + name + cuisine badge |
| Lunch card | 🍽 emoji + name + cuisine badge |
| Dinner card | 🍷 emoji + name + cuisine badge |
| Meal note renders | Restaurant note text visible |
| Tap hint | "Tap any activity" hint visible |
| Empty itinerary | "No itinerary data yet" graceful state |

### `safety-tile.spec.ts`
| Test | Assertion |
|------|-----------|
| Advisory level renders | Advisory text visible |
| Emergency number renders | Emergency # visible |
| Health tips render | Health section visible |
| Family tips render | Family section visible |
| Water safety renders | Water safety text visible |
| Null safety data | Graceful fallback, no crash |

### `map-tile.spec.ts`
| Test | Assertion |
|------|-----------|
| iframe present | `<iframe>` in DOM |
| Correct coordinates | iframe `src` contains lat/lon from trip data |
| Null lat/lon | Tile renders without crashing |

### `packing-tile.spec.ts`
| Test | Assertion |
|------|-----------|
| Categories render | Category names visible |
| Items render | Item names visible within categories |
| Check an item | Item shows checked state after click |
| Uncheck an item | Item returns to unchecked state |
| Checked state persists | Switch tabs and return — checked state maintained |
| Empty packing list | Graceful fallback message |

---

## Screen Tests

### `input-screen.spec.ts`
| Test | Assertion |
|------|-----------|
| Textarea visible | `<textarea>` in DOM and visible |
| Plan It button visible | Button with "Plan it" text visible |
| Chip buttons present | At least "Beach trip" and "City break" chips visible |
| Chip pre-fills textarea | Clicking chip populates textarea text |
| Geolocation label | Detected region label renders when geo returns a region |

### `generating-screen.spec.ts`
| Test | Assertion |
|------|-----------|
| Heading appears | "Building your trip plan" (or equivalent) visible after submit |
| Step labels present | Labels for resolve, weather, itinerary, packing, safety visible |

---

## Flow Tests

### `happy-path.spec.ts`
Full journey: type trip → click Plan It → results render
1. Type `"Beach vacation in Maui with kids age 4 and 8"`
2. Click Plan It
3. Generating screen appears
4. Results screen: Hero tile shows "Maui, Hawaii"
5. Weather tile visible
6. Itinerary tile visible with at least one activity
7. Safety tile visible

### `destination-picker.spec.ts`
1. Type `"beach trip for spring break"` (mock returns `destination: null` + 3 suggestions)
2. Click Plan It
3. Three destination cards appear: "Maui, Hawaii", "Cancun, Mexico", "San Diego, CA"
4. Click "Maui, Hawaii"
5. Generating screen appears
6. Results load with "Maui, Hawaii" in Hero tile

### `food-preferences.spec.ts`
1. Type `"vegan family trip to Tokyo"` (mock returns meals with vegan cuisine labels)
2. Click Plan It → results load
3. Itinerary tile shows meal cards
4. Meal cuisine badges include vegan-appropriate labels (e.g. "Vegan Ramen", "Plant-based")
5. No meal marked with excluded cuisine types

### `error-states.spec.ts`
| Scenario | Setup | Assertion |
|----------|-------|-----------|
| Parse input 500 | Override `/api/v1/trip/parse-input` → 500 | Error message visible on generating/input screen |
| Trip plan 500 | Override `/api/trip-plan` → 500 | Error message visible |
| Rate limit 429 | Override `/api/trip-plan` → 429 | Rate limit message visible |
| Empty itinerary | `scheduledItinerary: []`, `dailyItinerary: []` | "No itinerary data yet" in itinerary tile |
| Null safety data | Override `/api/safety/travel-tips` → `{}` | Safety tile renders gracefully |

---

## Smoke Tests

### `production.spec.ts`
Runs against `https://sproutroute-production.up.railway.app`. No API mocking. Structural assertions only — no content.

| Test | Assertion |
|------|-----------|
| Health check | `GET /api/health` → `{ status: "ok" }` |
| Parse input returns shape | POST real trip string → response has `destination` or `suggestedDestinations` key |
| Trip plan returns shape | POST real trip → response has `trip`, `weather`, `tripPlan`, `scheduledItinerary` keys |
| App loads | `GET /` → page title contains "SproutRoute" or "Sprout" |

---

## CI Integration

New GitHub Actions workflow: `.github/workflows/e2e.yml`

```yaml
name: E2E Tests
on:
  push:
    branches: [main, feature/**]
  pull_request:

jobs:
  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci
      - run: cd src/frontend && npm ci
      - run: npx playwright install --with-deps chromium
      - run: npx playwright test --project=mocked
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: playwright-report
          path: playwright-report/
```

Smoke tests are excluded (no `--project=smoke`). Screenshots uploaded on failure for debugging.

---

## Test Count Summary

| Layer | Files | Est. Tests |
|-------|-------|-----------|
| Tiles | 6 | ~40 |
| Screens | 2 | ~10 |
| Flows | 4 | ~20 |
| Smoke | 1 | 4 |
| **Total** | **13** | **~74** |

---

## Out of Scope

- Visual regression / screenshot diffing (not needed at this stage)
- Firefox / WebKit browser matrix (Chromium only for speed)
- Mobile viewport testing (Phase 3 — React Native)
- Performance / Lighthouse tests
