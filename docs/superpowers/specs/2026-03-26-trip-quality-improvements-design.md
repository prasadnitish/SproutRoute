# Trip Plan Quality Improvements — Design Spec

## Goal

Fix four interconnected quality issues: itinerary day count truncation, misleading activity times, missing kid-friendly attractions, and no temperature unit preference. Together these make the generated trip plan more accurate, more useful for families, and more comfortable for international users.

---

## Problems Being Solved

| # | Issue | Root Cause |
|---|-------|------------|
| 1 | 10-day trip shows only 7 days | `sizeGuardrail` hardcodes `max 7 day objects`; compact retry hardcodes `max 5` |
| 2 | AI recommends "arrive at 1 AM" | Prompt says "consider timezone" — AI interprets this as mentioning flight arrival times |
| 3 | Family trip has no theme parks | Prompt says "consider children's ages" — too vague; AI fills itinerary with beaches/museums |
| 4 | No °F/°C toggle | WeatherTile has no unit switching; no preference storage |

---

## Architecture

### 1. Dynamic Day Count (`src/backend/services/tripPlanAI.js`)

**Change:** Compute `numDays` from `startDate`/`endDate` and inject into the prompt. Replace all hardcoded day/activity caps with derived values.

```js
// In buildTripPlanPrompt — add near top of function
const numDays = (startDate && endDate)
  ? Math.round((new Date(endDate) - new Date(startDate)) / 86400000) + 1
  : 7; // fallback if dates missing

const activityCount = Math.min(Math.ceil(numDays * 1.5), 18);
const compactActivityCount = Math.min(Math.ceil(numDays * 1.0), 12);
const compactDayCount = Math.ceil(numDays * 0.8);
```

**sizeGuardrail (normal path):**
```
Generate exactly ${numDays} day objects in dailyItinerary — one per day of the trip.
Suggest ${activityCount} activities in suggestedActivities.
Keep all text concise.
```

**sizeGuardrail (compact retry path):**
```
Generate exactly ${compactDayCount} day objects (minimum viable itinerary).
Suggest exactly ${compactActivityCount} activities.
Keep each description/reason ≤ 120 characters.
Keep tips to max 5 items.
```

---

### 2. AI Prompt Improvements (`src/backend/services/tripPlanAI.js`)

Five targeted additions to the system prompt in `buildTripPlanPrompt`:

**A. No flight times in Day 1** — replaces the vague international context hint:
```
IMPORTANT: Do NOT include flight arrival times, layovers, or travel logistics in any
itinerary day. Day 1 begins at the destination. Never schedule any activity before
8:00 AM local destination time.
```

**B. Family theme park requirement** — added to the Requirements section, gated on `!isAdultsOnly && hasYoungChildren`:
```
THEME PARKS (required for family trips): If the destination has a Disney park,
Universal Studios, Legoland, major zoo, or aquarium within 60 miles, you MUST
include at least one theme_park activity in suggestedActivities. Do not omit
this even if the trip is short.
```

`hasYoungChildren` = `children.some(c => c.age < 13)`.

**C. Day 1 lighter for long-haul** — added to internationalContext block:
```
Day 1 itinerary must be light: max 2 activities. Travelers will be fatigued from
long-haul travel. Do not include airports, transit, or check-in logistics.
```

**D. Evening curfew for young kids** — added when `children.some(c => c.age < 10)`:
```
YOUNG CHILDREN: Do not schedule any activity ending after 8:00 PM. All dinner
suggestions should be family-friendly and conclude by 7:30 PM.
```

**E. Activity variety per day** — added to Requirements:
```
Each day must have a different mix of activity categories. Do not schedule the
same category more than once on the same day.
```

---

### 3. °F/°C Persistent Toggle

**New file: `src/frontend/src/hooks/useTempUnit.js`**

```js
// Reads/writes localStorage key 'sproutroute_temp_unit'.
// Returns [unit, toggleUnit] where unit is "F" or "C".
import { useState } from "react";

const STORAGE_KEY = "sproutroute_temp_unit";

export function useTempUnit() {
  const [unit, setUnit] = useState(
    () => localStorage.getItem(STORAGE_KEY) || "F"
  );

  const toggleUnit = () => {
    const next = unit === "F" ? "C" : "F";
    localStorage.setItem(STORAGE_KEY, next);
    setUnit(next);
  };

  return [unit, toggleUnit];
}
```

**New file: `src/frontend/src/utils/tempConvert.js`**

```js
// toDisplay(fahrenheit, unit) → number rounded to 1 decimal
export function toDisplay(f, unit) {
  if (f == null || f === "--") return "--";
  if (unit === "C") return Math.round((f - 32) * 5 / 9);
  return Math.round(f);
}

export function unitLabel(unit) {
  return unit === "C" ? "°C" : "°F";
}
```

**Modified: `src/frontend/src/components/mosaic/WeatherTile.jsx`**

- Import `useTempUnit` and `toDisplay`/`unitLabel`
- Add toggle button in the tile header (next to the "Weather" label):
  ```jsx
  <button onClick={toggleUnit} className="text-[10px] font-bold text-meadow-600 bg-meadow-50 border border-meadow-200 rounded-full px-2 py-0.5 hover:bg-meadow-100 transition">
    °F / °C
  </button>
  ```
- Replace all raw temperature renders with `toDisplay(temp, unit)` + `unitLabel(unit)`
- Applies to: big temp display, high/low in forecast strip

---

## Data Flow

```
User taps °F/°C toggle
  → useTempUnit toggles state + writes localStorage
  → WeatherTile re-renders with converted temperatures

User submits 10-day trip
  → tripPlanAI.buildTripPlanPrompt computes numDays=10, activityCount=15
  → AI generates 10 dailyItinerary entries (no longer capped at 7)
  → AI includes at least 1 theme_park activity (Tokyo Disneyland, etc.)
  → Day 1 has ≤ 2 activities, no "arrive at 1 AM" notes
  → itineraryScheduler maps all 10 days
  → ItineraryTile shows all 10 day tabs
```

---

## File Map

| File | Change |
|------|--------|
| `src/backend/services/tripPlanAI.js` | Dynamic day count, 5 prompt improvements |
| `src/frontend/src/hooks/useTempUnit.js` | New — localStorage-backed unit hook |
| `src/frontend/src/utils/tempConvert.js` | New — toDisplay + unitLabel helpers |
| `src/frontend/src/components/mosaic/WeatherTile.jsx` | Toggle button + use hook |

---

## Testing

**Unit tests (new):**
- `tests/unit/tempConvert.test.js` — toDisplay(32, "C") → 0, toDisplay(212, "C") → 100, toDisplay(null, "F") → "--"
- `tests/unit/tripPlanAI.test.js` — prompt for 10-day trip contains "exactly 10 day objects"; prompt for 3-day trip contains "exactly 3 day objects"; family prompt with child age 8 contains "theme_park"; adults-only prompt does NOT contain "THEME PARKS"

**E2E tests (update existing):**
- `tests/e2e/tiles/weather-tile.spec.ts` — add test: click toggle → temps convert to Celsius; reload page → Celsius persists (localStorage)

---

## Out of Scope

- Destination timezone lookup (lat/lon → IANA tz): the itinerary scheduler already assigns local-time slots (9 AM = destination morning). The "1 AM" issue is purely an AI prompt problem, fixed by rule A above. A full timezone API integration is a separate future task.
- Temperature conversion in the itinerary tile or packing list — only WeatherTile for now.
- Backend storing the user's unit preference — localStorage only, no server-side persistence.
