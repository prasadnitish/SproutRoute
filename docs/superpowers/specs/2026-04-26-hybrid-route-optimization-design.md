# Hybrid Route Optimization and Review — Design Spec

## Goal

Make multi-hop and whole-country trips feel trustworthy before expensive itinerary generation starts. Users should see the route skeleton up front, understand why SproutRoute chose that order, and be able to change city order or nights before the detailed AI itinerary is generated.

This spec uses the approved Option C hybrid behavior:

- Explicit city lists default to preserving the user's order.
- Whole-country prompts default to SproutRoute's recommended order.
- Broad-region prompts without explicit stops default to a recommended starter route with `Needs review` confidence.
- Mixed prompts preserve hard constraints and optimize only flexible stops.
- Explicit user-entered city order is never silently changed.

---

## Current Behavior

The current flow already pauses multi-stop and country-tour trips on `RouteReviewPanel` before itinerary generation:

```
InputScreen
  -> useTrip.submitTrip()
  -> POST /api/v1/trip/parse-input
  -> GeneratingScreen
  -> RouteReviewPanel for multi_stop/country_tour
  -> user continues
  -> POST /api/v1/trip/stream
  -> ResultsScreen
```

Today the route review panel supports:

- Editing stop names.
- Editing nights per stop.
- Choosing `Keep order` or `Optimize`.

But the current implementation is incomplete:

- Users cannot rearrange stops.
- The `Optimize` choice is sent from the frontend but not used by the backend.
- Whole-country defaults come from hard-coded country templates.
- Explicit multi-city prompts preserve parser order.
- There is no explanation of why a route order was chosen.
- There is no side-by-side comparison when optimization would change user-entered order.

---

## Product Rules

### 1. Explicit Multi-City Prompt

Example:

> Europe trip with best friend - cover Amsterdam, Greece, Berlin, Budapest in 10 days.

Default behavior:

- Keep the order exactly as parsed.
- Show route warnings when the order looks inefficient or broad.
- If a better route is available, show it as a suggestion, not an automatic change.

UX copy:

- Primary label: `Your order`
- Secondary label when applicable: `Suggested improvement`
- Explanation: `We kept your city order because you listed the stops directly.`

User actions:

- Continue with original order.
- Accept suggested order.
- Manually reorder stops.
- Edit nights.
- Edit city names.

### 2. Whole-Country or Broad-Region Prompt

Examples:

> 2 weeks in Japan.

> First time in Italy next spring.

> 10 days in Europe.

Default behavior:

- Start with SproutRoute's recommended route.
- Show the reason for the order.
- Let the user rearrange before generation.
- Use `Medium` confidence for whole-country templates and `Needs review` confidence for broad-region starter routes.

UX copy:

- Primary label: `Recommended route`
- Explanation: `We picked a classic first-time route that minimizes backtracking and keeps transit simple.`

User actions:

- Continue with recommended order.
- Reorder stops.
- Remove or replace suggested stops.
- Edit nights.

### 3. Mixed Prompt With Hard Constraints

Examples:

> Start in Tokyo, end in Osaka, maybe add Kyoto and Hakone.

> Fly into Paris, meet friends in Berlin, then spend the rest wherever makes sense.

Default behavior:

- Preserve hard constraints.
- Optimize only flexible middle stops.
- Explain what was locked and what was optimized.

UX copy:

- `Locked start: Tokyo`
- `Locked end: Osaka`
- `Optimized middle stops for shorter transit`

Hard constraints include:

- "start in", "begin in", "fly into"
- "end in", "fly out of", "finish in"
- date-specific commitments such as "Berlin on day 4"
- explicit fixed nights such as "3 nights in Kyoto"
- user-marked must-visit stops

---

## Route Ordering Strategy

### Short Term

Use a deterministic route optimizer with lightweight geography and curated templates.

Inputs:

- Parsed stops.
- Trip shape: `multi_stop` or `country_tour`.
- Start and end dates.
- Country tour metadata.
- Hard constraints.
- Requested nights.
- Country/city coordinates when available.

Ordering modes:

| Mode | Default For | Behavior |
|------|-------------|----------|
| `user_order` | explicit city lists | Preserve parsed order. |
| `recommended` | country/region tours | Use curated route order or geographic optimization. |
| `suggested_improvement` | explicit city lists with inefficient ordering | Return a comparison route, but do not apply it automatically. |

Route quality signals:

- Estimated transit time between stops.
- Number of flights vs train-friendly legs.
- Backtracking distance.
- Broad region warnings, such as `Greece` instead of `Athens`.
- Pace pressure, such as 5 stops in 7 days.
- Theme park or large attraction full-day warnings.

### Country Templates

Keep curated defaults because they produce better first-time routes than generic distance sorting.

Examples:

- Japan: `Tokyo -> Kyoto -> Osaka -> Hakone -> Hiroshima`
- Italy: `Rome -> Florence -> Venice -> Milan`
- France: `Paris -> Lyon -> Provence -> Nice`
- Spain: `Madrid -> Seville -> Granada -> Barcelona`

Each template should include a short rationale:

- Japan: `Classic first-time route; major international entry point first, then cultural core, food hub, and slower scenic finish.`
- Italy: `Classic northbound route; starts with Rome and moves through Tuscany toward northern rail hubs.`
- France: `North-to-south route; starts in Paris and ends on the Riviera.`
- Spain: `Connects major city, Andalusia, and Barcelona with manageable train/flight legs.`

### Region Routes

For broad regions like Europe, do not pretend there is one canonical order. If the user provides explicit stops, use explicit stop order unless the user asks SproutRoute to optimize. If the user only names the broad region, show a recommended starter route with `Needs review` confidence and make it easy to replace stops.

If the parsed route contains broad regions mixed with cities:

- Keep user order.
- Warn on broad stop names.
- Suggest replacing broad regions with specific cities.

Example:

`Amsterdam -> Greece -> Berlin -> Budapest`

Warning:

`Greece is broad. Pick Athens, Santorini, Crete, or another base before booking transit.`

Suggested improvement:

`Amsterdam -> Berlin -> Budapest -> Athens`

Reason:

`Keeps train-friendly central Europe legs together, then uses one flight to Greece.`

---

## Upfront Route Review UX

### Layout

The route review card should become a real route editor:

1. Header
   - Trip title.
   - Date range.
   - Stop count.
   - Confidence badge: `High`, `Medium`, or `Needs review`.

2. Route summary strip
   - Stop order.
   - Nights per stop.
   - Arrival/departure dates.
   - Transfer mode between stops.

3. Route explanation
   - One short sentence explaining why this order was chosen.
   - If applicable, one sentence explaining what was preserved.

4. Stop editor
   - Reorder controls.
   - Editable stop name.
   - Editable nights.
   - Lock indicator for hard constraints.
   - Remove stop for suggested stops.

5. Suggested improvement panel
   - Only shown when optimization differs from explicit user order.
   - Shows original vs suggested route.
   - Includes reason and impact.
   - User must click `Use suggested route`.

6. Warnings
   - Broad region warning.
   - Too-fast pace warning.
   - Flight-transfer warning.
   - Full-day attraction warning when known.

7. CTA row
   - `Edit prompt`
   - `Continue with this route`

### Reordering Controls

Use accessible controls first:

- Up/down icon buttons for each stop.
- Keyboard-accessible buttons with `aria-label`.
- Later enhancement: drag-and-drop on desktop.

Avoid making drag-and-drop the only reorder mechanism.

### Empty and Error States

If fewer than two valid stops remain:

- Disable continue.
- Show: `Add at least two stops to build a route.`

If a stop is broad:

- Continue remains allowed.
- Show warning.
- Prefer suggesting concrete replacements.

If optimization cannot run:

- Preserve current order.
- Show: `We could not compare route order, so we kept your stops as entered.`

---

## Backend Data Contract

### Parse Result Additions

The parser should return optional route intent metadata:

```js
{
  tripShape: "multi_stop" | "country_tour",
  routeOptimizationMode: "user_order" | "recommended" | "suggested_improvement",
  routeConstraints: {
    startStopId: "tokyo",
    endStopId: "osaka",
    lockedStopIds: ["tokyo", "osaka"],
    fixedDateStops: [
      { stopId: "berlin", dayStart: 4, dayEnd: 5 }
    ]
  },
  stops: [
    {
      id: "tokyo",
      name: "Tokyo",
      role: "must_visit" | "suggested" | "transit",
      requestedNights: 3,
      mustInclude: true,
      locked: true,
      notes: []
    }
  ]
}
```

### Allocated Route Output

`allocateRoute()` should return:

```js
{
  optimizationMode: "user_order" | "recommended",
  routeRationale: "We kept your city order because you listed the stops directly.",
  routeQuality: {
    confidence: "high" | "medium" | "needs_review",
    totalEstimatedTransitHours: 8.5,
    flightLegCount: 1,
    backtrackingScore: 0.22,
    warnings: []
  },
  stops: [],
  transitLegs: [],
  alternativeRoute: {
    mode: "suggested_improvement",
    rationale: "Keeps train-friendly central Europe legs together before flying to Greece.",
    stops: [],
    transitLegs: [],
    qualityDelta: {
      transitHoursSaved: 3.5,
      fewerFlights: 0,
      lessBacktracking: true
    }
  }
}
```

### Applying User Changes

When the user rearranges stops or accepts an alternative:

- Frontend sends the edited stop order to `confirmRouteTrip`.
- Backend treats the submitted order as authoritative.
- Backend recalculates dates, nights, day ranges, transit legs, and warnings.
- Backend does not override the submitted order unless the user explicitly chooses recommended mode.

---

## Frontend Components

### `RouteReviewPanel.jsx`

Enhance the current component rather than replacing it.

New responsibilities:

- Render route rationale.
- Render confidence and warning badges.
- Support up/down reordering.
- Render dates and transfer modes.
- Render alternative route comparison.
- Emit a complete route draft when continuing.

### Suggested Helper Functions

Create local pure helpers near the component or under `src/frontend/src/utils/routeReview.js` if they grow:

- `moveStop(stops, fromIndex, toIndex)`
- `canMoveStop(stop, direction, constraints)`
- `formatStopDates(stop)`
- `summarizeTransitLeg(leg)`
- `compareStopOrders(currentStops, alternativeStops)`

Start local inside `RouteReviewPanel.jsx`; extract only if tests or readability demand it.

---

## Backend Components

### `routeAllocator.js`

Enhance existing route allocation:

- Read `routeOptimizationMode`.
- Preserve user order for explicit `multi_stop`.
- Use curated defaults for `country_tour`.
- Generate route rationale.
- Generate route quality warnings.
- Generate alternative suggested route when useful.
- Respect hard constraints.

### New Optional Module: `routeOptimizer.js`

Add only if `routeAllocator.js` becomes too large.

Responsibilities:

- Coordinate-based ordering.
- Backtracking score.
- Template lookup.
- Alternative route generation.

Do not add a dependency-heavy routing engine in this phase. Use deterministic heuristics first.

### Route Review Attraction Prefetch

Use the route review pause to warm city-level attraction data before the user starts itinerary generation.

The insight: when a user is choosing between `Tokyo -> Kyoto -> Osaka` and `Kyoto -> Tokyo -> Osaka`, the stop order and nights may change, but the likely attraction pool for each city usually stays stable. SproutRoute can prefetch those city attraction candidates while the user is reviewing the route, then reuse the same candidates once the route is confirmed.

Behavior:

- After parse returns a multi-stop or country-tour draft, start a non-blocking prefetch for each stop.
- Fetch attraction candidates by city name and country code.
- Cache results by a stable key: `cityName + countryCode + travelerContextHash`.
- Do not generate full daily prose during route review.
- Do not block route editing on prefetch completion.
- If the user changes stop order or nights, keep the prefetched city pools.
- If the user renames, removes, or adds a stop, discard or fetch only the changed stop.
- When the user confirms the route, pass prefetched candidates into itinerary generation for each stop.

Traveler context should include only coarse planning signals:

- children age bands, not raw trip text
- pet presence/type, not pet names or special medical notes
- trip vibe/category
- accessibility flags when present

Do not cache raw free-text prompts as attraction-memory keys.

Frontend state:

```js
{
  routePrefetch: {
    statusByStopId: {
      tokyo: "loading" | "ready" | "empty" | "error"
    },
    attractionsByStopId: {
      tokyo: []
    }
  }
}
```

UX:

- Keep the route editor fully usable while prefetch runs.
- Optionally show a small per-stop status like `Finding ideas...` or `Ideas ready`.
- Do not show detailed attractions by default in the first version; this avoids turning route review into itinerary review.
- If the user clicks a stop, a lightweight preview can show 3-5 candidate attractions later.

---

## Latency

This feature should reduce perceived latency because it moves validation before AI generation.

Rules:

- Route review must be deterministic and fast.
- Do not call LLMs for route optimization in the first version.
- Do not call live Maps distance APIs in the first version.
- Use curated templates and known city coordinates when available.
- Only start expensive itinerary generation after route confirmation.
- Start attraction candidate prefetch during route review, because city-level candidates usually survive route-order and night-count edits.
- Prefetch must use cached/data-service lookups only, not LLM itinerary generation.
- Prefetch must be cancellable and scoped to the current trip request id to avoid stale results applying to a later prompt.

Performance target:

- Parse result to route review visible: under 2 seconds when the parse call returns normally.
- Reordering stops in the UI: instant, no network call.
- Continuing after route confirmation: same streaming behavior as today.
- Confirmed route to first stop itinerary: faster when city candidates are already prefetched.

Expected latency benefit:

- Route review time becomes useful background work instead of idle time.
- The itinerary generator receives pre-ranked candidates immediately after confirmation.
- If the user changes only order or nights, no attraction refetch is needed.
- If prefetch fails, the system falls back to the current generation path.

---

## Testing

### Unit Tests

`tests/unit/routeAllocator.test.js`

- Explicit multi-city prompt preserves order.
- Country tour defaults to recommended order.
- `routeOptimizationMode=user_order` preserves submitted order.
- `routeOptimizationMode=recommended` applies curated country template when no explicit order exists.
- Mixed prompt locks start/end and optimizes only middle stops.
- Alternative route is generated but not applied for explicit inefficient order.
- Broad region warnings remain visible.
- Nights and day ranges recalculate after reordered stops.
- Prefetched attraction candidates are reused when only stop order changes.
- Prefetched candidates are discarded for renamed or removed stops.

`tests/unit/routeReviewUtils.test.js` if helpers are extracted:

- `moveStop` moves items correctly.
- Locked start cannot move down when configured as fixed start.
- Locked end cannot move up when configured as fixed end.

`tests/unit/routePrefetch.test.js` if prefetch logic is extracted:

- Builds stable prefetch cache keys without raw trip text.
- Cancels stale prefetch results by trip request id.
- Keeps city attraction pools when only nights change.
- Refetches only newly added stops.

### E2E Tests

`tests/e2e/flows/multi-hop-trip.spec.ts`

- Japan country tour shows recommended route before generation.
- Explicit Europe city list shows user order by default.
- Europe city list with suggested improvement requires explicit accept before route changes.
- User can move Budapest above Berlin and continue.
- Edited route order appears in streamed results.
- Route warnings appear for broad region stops.
- Route review starts attraction prefetch and continues even if prefetch is still loading.
- Confirming after reorder reuses prefetched Tokyo/Kyoto/Osaka attraction pools.

### Accessibility Tests

Manual or Playwright checks:

- Reorder buttons have `aria-label`.
- Suggested route comparison is readable by screen readers.
- Continue button disabled state has visible explanation.
- Keyboard users can reorder without drag-and-drop.

---

## Rollout Plan

1. Ship deterministic route review enhancements behind existing multi-hop flow.
2. Keep old route allocation fallback if alternative route generation fails.
3. Add metrics:
   - route review shown.
   - stop reordered.
   - suggested route accepted.
   - route warning shown.
   - route confirmed.
4. Watch for high abandon rate on route review.
5. If abandon rises, simplify the panel and move advanced controls behind `Edit route`.

---

## Open Decisions Resolved

Decision: use Option C hybrid defaults.

Reason:

- It preserves user trust for explicit city lists.
- It lets SproutRoute be opinionated for broad country trips.
- It avoids silently changing user intent.
- It creates a natural place to explain route feasibility before spending time on detailed generation.
