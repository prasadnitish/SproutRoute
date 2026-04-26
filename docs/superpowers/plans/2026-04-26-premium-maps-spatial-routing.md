# Premium Maps And Spatial Routing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Add premium map-backed route visualization for multi-hop trips and active itinerary days while improving deterministic attraction ordering so mapped days do not send users across town unnecessarily.

**Architecture:** Use existing route-review and results boundaries. Backend scheduling remains deterministic and non-blocking; frontend maps are lazy Google Maps iframes plus first-party overlays, so map rendering never blocks parsing, streaming, or itinerary generation. Route review uses known city coordinates before generation; results use `routePlan.stops` and scheduled activity coordinates when available.

**Tech Stack:** React 18, Vite, Tailwind, Express CSP, Google Maps URL embeds, existing node:test and Playwright suites.

---

## File Structure

- Modify `src/backend/services/itineraryScheduler.js`: add coordinate extraction, nearest-neighbor day ordering, realistic travel gap estimates, and day-level route metadata.
- Modify `tests/unit/itineraryScheduler.test.js`: add red tests for spatial day ordering and travel metadata.
- Create `src/frontend/src/utils/mapGeometry.js`: shared frontend coordinate lookup, Google Maps URL builders, and route-health helpers.
- Create `src/frontend/src/components/maps/PremiumRouteMap.jsx`: reusable route/day map panel with Google iframe, numbered stop legend, metrics, and graceful fallback.
- Modify `src/frontend/src/components/RouteReviewPanel.jsx`: show selected-route map and route-health chips during route review.
- Modify `src/frontend/src/screens/ResultsScreen.jsx`: add route overview map and active-day map synced with `ItineraryTile`.
- Modify `src/frontend/src/components/mosaic/MapTile.jsx` and `src/frontend/src/components/mosaic/DayRouteMap.jsx`: make legacy components delegate to the new map panel.
- Modify `src/backend/server.js` and `tests/integration/api.integration.test.js`: allow Google Maps frames in CSP and remove the stale OpenStreetMap iframe requirement.
- Modify `tests/e2e/fixtures/trip-data.ts`, `tests/e2e/tiles/map-tile.spec.ts`, `tests/e2e/flows/happy-path.spec.ts`, and `tests/e2e/flows/multi-hop-trip.spec.ts`: assert premium map UI, route review maps, and active-day map behavior.
- Modify `src/shared/types/trip.ts`: document optional scheduled-day route metadata.
- Optionally update `docs/WEB_CODE_GRAPH.md` after code lands to include map components in the current web presentation graph.

## Tasks

### Task 1: Spatial Scheduler Guardrails

**Files:**
- Modify: `tests/unit/itineraryScheduler.test.js`
- Modify: `src/backend/services/itineraryScheduler.js`
- Modify: `src/shared/types/trip.ts`

- [x] Add a failing unit test that gives one day activities in a backtracking order with coordinates and expects the scheduled order to be spatially smoothed.
- [x] Run `node --test tests/unit/itineraryScheduler.test.js` and confirm the new test fails before implementation.
- [x] Implement coordinate extraction from Places enrichment and activity fields.
- [x] Implement nearest-neighbor ordering for geocoded day activities while keeping full-day anchors first.
- [x] Replace the fixed 20-minute travel gap with coordinate-aware estimates, falling back to 20 minutes when coordinates are missing.
- [x] Add `routeMeta` to scheduled days with `orderedBy`, `totalTravelMinutes`, `totalDistanceMiles`, and `mappedStopCount`.
- [x] Add day warnings for spatial reorder and excessive travel spread.
- [x] Run `node --test tests/unit/itineraryScheduler.test.js` and `npm test`.

### Task 2: Frontend Map Foundation

**Files:**
- Create: `src/frontend/src/utils/mapGeometry.js`
- Create: `src/frontend/src/components/maps/PremiumRouteMap.jsx`
- Modify: `src/frontend/src/components/mosaic/MapTile.jsx`
- Modify: `src/frontend/src/components/mosaic/DayRouteMap.jsx`

- [x] Add frontend coordinate lookup for common country-tour cities already used by `routeAllocator.js`.
- [x] Add Google Maps search and directions URL builders with encoded lat/lon waypoints.
- [x] Add route-health helpers for stop count, longest hop, total straight-line miles, and backtracking label.
- [x] Build `PremiumRouteMap` as a lazy iframe panel with numbered route legend, map metrics, loading skeleton, and no hard dependency on an API key.
- [x] Update legacy `MapTile` and `DayRouteMap` to call `PremiumRouteMap` so old tests and imports keep working.
- [x] Run `cd src/frontend && npm run build`.

### Task 3: Route Review Map UX

**Files:**
- Modify: `src/frontend/src/components/RouteReviewPanel.jsx`
- Modify: `tests/e2e/flows/multi-hop-trip.spec.ts`

- [x] Add route map under the review summary using currently selected stops.
- [x] Include muted candidate context through the candidate chips while only selected stops draw the route.
- [x] Add route-health chips near the map: stop count, longest hop, pace label, and backtracking label.
- [x] Keep map updates local to route review state so reordering or selecting candidates updates the map instantly without API calls.
- [x] Extend the multi-hop E2E tests to assert the route review map appears for Europe/Japan/USA prompts.
- [x] Run `npm run test:e2e -- --project=mocked tests/e2e/flows/multi-hop-trip.spec.ts`.

### Task 4: Results Route And Day Maps

**Files:**
- Modify: `src/frontend/src/screens/ResultsScreen.jsx`
- Modify: `src/frontend/src/components/mosaic/ItineraryTile.jsx`
- Modify: `tests/e2e/tiles/map-tile.spec.ts`
- Modify: `tests/e2e/flows/happy-path.spec.ts`
- Modify: `tests/e2e/fixtures/trip-data.ts`

- [x] Add a route overview map above the route timeline when `routePlan.stops` exist.
- [x] Track active itinerary-day activities in `ResultsScreen` via `ItineraryTile.onDayChange`.
- [x] Render an active-day map next to the itinerary on desktop and below it on mobile.
- [x] Use trip lat/lon as a fallback map center when activity coordinates are still missing.
- [x] Add fixture activity coordinates and update E2E assertions from stale iframe-only checks to visible premium map labels and Google Maps URL coordinates.
- [x] Run `npm run test:e2e -- --project=mocked tests/e2e/tiles/map-tile.spec.ts tests/e2e/flows/happy-path.spec.ts`.

### Task 5: CSP, Docs, Verification, And Push

**Files:**
- Modify: `src/backend/server.js`
- Modify: `tests/integration/api.integration.test.js`
- Modify: `docs/WEB_CODE_GRAPH.md`

- [x] Update CSP `frame-src` to allow Google Maps embeds and remove the stale OpenStreetMap-specific assertion.
- [x] Update the web code graph with `PremiumRouteMap` and map data flow.
- [x] Run `npm test`.
- [x] Run `npm run build`.
- [x] Run mocked map and multi-hop E2E suites.
- [x] Commit the feature branch.
- [x] Push `codex/maps-route-ux`.

## Self-Review

- Spec coverage: covers route review map, results route map, active-day map, spatial ordering, latency, CSP, tests, and docs.
- Placeholder scan: no placeholder tasks; every task points to concrete files and commands.
- Type consistency: `routeMeta`, `PremiumRouteMap`, and `mapGeometry` names are used consistently across tasks.
