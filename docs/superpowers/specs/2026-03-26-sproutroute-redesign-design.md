# SproutRoute Redesign — Design Spec
**Date:** 2026-03-26
**Status:** Approved
**Goal:** Production-ready web app with reimagined UX, Google Places rich activity data, Playwright E2E tests, and a polished brand identity — ready for job interview demos.

---

## 1. Overview

Complete UX reimagination of SproutRoute. Replace the multi-step wizard with a single smart text input → instant AI generation → mission-control mosaic results layout. Add Google Places API for rich activity details. Rebuild codebase from current broken state (deleted files, no package.json) into a clean, testable architecture.

---

## 2. User Flow

### Screen 1 — Input
- **Hero text area**: Large, inviting. Placeholder examples: `"Relaxing beach vacation for spring break with two kids age 4 and 8"`, `"Adventurous trip to Machu Picchu in July"`, `"Disneyland weekend for toddler's birthday"`.
- **Vibe chips** below the text area: 🏖 Beach trip · 🏔 Adventure · 🏰 Theme parks · 🌎 International · 🚢 Cruise · 🏕 Camping · 🏙 City break. Tapping a chip prefills the text area.
- **"Plan it ✨" button** triggers immediate transition to Screen 2.
- **Location detection**: IP-based geolocation runs silently on page load. Used when user input contains no destination (e.g. "beach vacation"). No permission prompt needed.
- **Generic destination handling**: If no destination is detected, backend returns 3 AI-suggested destinations based on detected location + current season + kids' ages extracted from input. User picks one, generation resumes. Shown as a lightweight destination picker overlay mid-generation.

### Screen 2 — Generating
- Auto-transition from Screen 1 on submit. No manual click needed.
- **Assumption summary card** (green tinted): Shows what the AI inferred — `📍 Maui, Hawaii · 📅 Apr 12–19 · 👨‍👧‍👦 2 adults, 2 kids (4 & 8) · 🏖 Beach`. Includes `✏ Something wrong? Edit →` escape hatch.
- **Live progress steps** (check off as each completes):
  1. ✓ Resolved destination
  2. ✓ Got weather forecast
  3. ⟳ Generating day-by-day itinerary…
  4. ○ Building smart packing list
  5. ○ Checking car seat laws & safety
- Animated sprout icon floats while generating.
- Estimated time shown: "This takes about 10–15 seconds."

### Screen 3 — Results (Mission Control)
See Section 4.

---

## 3. Brand & Visual Identity

### Logo
- **Icon**: Square-rounded app icon (like App Store icon). Green gradient background (`#14532d → #16a34a → #4ade80`). White cartoon sprout character with happy face (inspired by MATHsprout sibling app). Sparkle effects. Works at all sizes: favicon, nav bar, app store.
- **Wordmark**: `Sprout` in `#111827` (dark) + `Route` in `#16a34a` (green). Font: Space Grotesk 800.
- **Final logo**: SVG approximation used in web app. Commission illustrated version matching MATHsprout quality as a follow-up asset.

### Color Palette — Fresh Meadow
```
Background:     #f9fafb   (near-white, light gray)
Surface:        #ffffff   (white tiles)
Border:         #e5e7eb   (light gray borders)
Border light:   #bbf7d0   (green-tinted borders for featured tiles)
Tint light:     #f0fdf4   (very light green tint backgrounds)
Tint medium:    #dcfce7   (light green for badges/chips)

Accent:         #16a34a   (primary green — buttons, labels, accents)
Accent dark:    #15803d   (hover states, darker text)
Accent deep:    #14532d   (hero gradient start)
Accent bright:  #4ade80   (hero gradient end, sparkles)

Hero gradient:  linear-gradient(160deg, #14532d, #16a34a, #4ade80)

Text primary:   #111827
Text secondary: #374151
Text muted:     #6b7280
Text disabled:  #9ca3af
```

### Typography
- **Display / Brand**: Space Grotesk (weights: 600, 700, 800)
- **Body / UI**: Inter (weights: 400, 500, 600, 700)

---

## 4. Results Page — Mission Control Mosaic

### Layout
Responsive CSS grid. Desktop: `1.5fr 1fr` two-column. Tablet: `1.2fr 1fr`. Mobile: single column.

### Navigation
- **Sticky nav**: Logo + destination pill (e.g. "🌴 Maui, Hawaii") + share icon (↗) top-right.
- **Tab bar below nav**: `📅 Plan` | `🎒 Pack`. Packing is intentionally separate — user finalises the plan first, then packs.

### Plan Tab — Tile Grid

#### Tile A — Hero (col 1, rows 1–2, tall)
- Green gradient background (`Hero gradient`).
- Shows: destination, dates, trip length, detected tags (weather, family, safety score, domestic/international).
- "Assumed: 2 adults · kids 4 & 8 · beach vibes `Edit assumptions →`" in small text at bottom.
- Share icon (↗) in nav handles sharing — no duplicate button here.

#### Tile B — Weather (col 2, row 1)
- Shows: current temp, conditions, emoji icon.
- 7-day mini forecast row (day initial, emoji, high temp).
- Uses existing Weather.gov (US) + OpenWeatherMap (international) services.

#### Tile C — Itinerary (col 1, rows 2–3, largest tile)
- **Day tabs**: Day 1, Day 2, … Day N. Horizontal scroll if many days.
- **Active day content**:
  - Date + weather for that day (temp + conditions).
  - Activity rows: each shows thumbnail emoji/photo, time of day, activity name, short description (2 lines), tag chips.
  - Tapping any activity opens the **Activity Detail Panel** (see Section 5).
- **Day tab switching** is instant (no API call) — all day data pre-loaded.

#### Tile D — Safety (col 2, row 2)
- Grid of 4 mini cards: Car Seat law, Travel Advisory level, Neighborhood Safety score, Emergency number.
- Uses existing safety services.

#### Tile E — Refine with AI (col 2, row 3 or col 3)
- Label: "✨ Refine"
- Quick-tap chips: "More adventure 🧗", "Easier on toddler 👶", "More restaurants 🍽", "Budget-friendly 💰"
- Free-text input: "Or describe a change…"
- "Regenerate ✨" button — calls the itinerary endpoint with the original params + refinement instruction. Replaces itinerary tile content in place with a loading state.

#### Tile F — Map (col 1–2, bottom row)
- Static map placeholder showing pins for each activity on the active day.
- Tapping a pin opens the Activity Detail Panel for that activity.
- "Open full map" link — opens Google Maps with all pins in a new tab.
- Map implemented with a static Google Maps embed or Leaflet.js with OpenStreetMap tiles (no billing required for static map display).

### Pack Tab
- Packing list with progress ring (% checked).
- Categories: Beach & Water, Kids Essentials, Health & Safety, Documents & Tech, Clothing, Misc.
- Each item: checkbox + name + optional quantity.
- "Add custom item" inline input at bottom of each category.
- Progress persisted in localStorage.
- Only shown after trip plan is generated.

---

## 5. Activity Detail Panel

Slides in from the right on desktop (380px wide). Full-screen on mobile.

### Data Sources
- **AI-generated**: Activity name, description, time of day, category tags, kid-friendliness note.
- **Google Places API**: Photos (up to 5), star rating, review count, address, phone number, website, opening hours, price level.
- **Enrichment logic**: After AI generates an activity name (e.g. "Mama's Fish House"), backend calls `POST /api/v1/places/enrich` with the name + destination city. Returns Places data merged with AI data.

### Panel Contents
1. **Photo strip** — primary photo full width (200px tall), 4 thumbnails scrollable below.
2. **Category badge** + time label (e.g. "RESTAURANT · Day 1 · 6:30 PM")
3. **Activity name** (large, Space Grotesk 800)
4. **Star rating** + review count (from Google Places)
5. **Description** (from AI, 2–4 sentences)
6. **Info grid** (2-col): Address, Duration, Cost/Price level, Best age, Phone, Website
7. **Actions**: "Open in Maps 🗺" (deep links to Google Maps) + "Remove from plan"

### Fallback
If Google Places enrichment fails or returns no match, panel shows AI-generated data only (no photos, no rating). Does not block the UI.

---

## 6. Destination Suggestion Flow (Generic Input)

Triggered when: user submits input with no parseable destination.

1. Backend detects missing destination from AI parsing.
2. IP geolocation resolves approximate user region (e.g. "Chicago, IL, US").
3. AI generates 3 destination suggestions based on: detected region, current season (Mar 26 → Spring), trip vibe from input, kids' ages.
4. Frontend shows a lightweight overlay mid-generating-screen: "We found a few great matches — pick one to continue."
5. Each suggestion shows: destination name, flag/emoji, 1-line description, estimated weather.
6. User taps a destination → generation resumes from the weather step.

---

## 7. Google Places Integration

### Endpoint
`POST /api/v1/places/enrich`

**Request:**
```json
{ "activityName": "Mama's Fish House", "destination": "Maui, Hawaii", "category": "restaurant" }
```

**Response:**
```json
{
  "placeId": "ChIJ...",
  "name": "Mama's Fish House",
  "rating": 4.9,
  "userRatingsTotal": 2847,
  "address": "799 Poho Pl, Paia, HI 96779",
  "phone": "(808) 579-8488",
  "website": "mamasfishhouse.com",
  "openingHours": ["Mon–Sun: 11am–9pm"],
  "priceLevel": 4,
  "photos": ["https://maps.googleapis.com/..."],
  "mapsUrl": "https://maps.google.com/?cid=..."
}
```

### API Key
- `GOOGLE_PLACES_API_KEY` added to Railway environment variables and `.env.example`.
- Client-side never sees the key — all Places calls proxied through backend.

### Cost Management
- Cache enrichment results per `(activityName, destination)` pair in memory (TTL: 24h). Same activity name in same city never calls Places twice.
- Enrichment called **lazily**: only when user taps an activity to open the detail panel — not at trip generation time.
- Estimated cost for typical usage: < $0.50/day at 50 users.

---

## 8. Technical Architecture

### Codebase Repairs (before any new work)
These files were deleted from disk but exist in git. Must be restored first:
- `src/backend/utils/sanitize.js` — input validation & injection prevention
- `src/backend/services/packingListAI.js` — AI packing list generation
- `package.json` (root) — test runner config
- `src/backend/package.json`
- `src/frontend/package.json`
- `src/frontend/vite.config.js`
- `src/frontend/src/main.jsx`

### Frontend Refactor
Current `App.jsx` (1,192 lines) split into:
```
src/frontend/src/
├── App.jsx                     ← Root: routing between screens only (~50 lines)
├── screens/
│   ├── InputScreen.jsx         ← Text area, chips, submit logic
│   ├── GeneratingScreen.jsx    ← Progress steps, assumption card
│   └── ResultsScreen.jsx       ← Tab bar + mosaic layout orchestration
├── components/
│   ├── mosaic/
│   │   ├── HeroTile.jsx
│   │   ├── WeatherTile.jsx
│   │   ├── ItineraryTile.jsx
│   │   ├── SafetyTile.jsx
│   │   ├── RefineTile.jsx
│   │   └── MapTile.jsx
│   ├── ActivityDetailPanel.jsx ← Slide-in panel
│   ├── DestinationPicker.jsx   ← 3-option overlay for generic input
│   ├── PackingList.jsx         ← Pack tab content
│   └── DayTabs.jsx             ← Day selector within ItineraryTile
├── hooks/
│   ├── useTrip.js              ← Trip state + localStorage persistence
│   ├── useGeolocation.js       ← IP-based location detection
│   └── usePlacesEnrich.js      ← Lazy Google Places enrichment
├── services/
│   └── api.js                  ← All fetch() calls (keep existing retry logic)
└── utils/
    ├── checklist.js            ← Existing (no changes)
    └── storage.js              ← Centralised localStorage keys
```

### Backend Additions
```
src/backend/
├── server.js                   ← Add POST /api/v1/places/enrich route
├── services/
│   └── placesEnrich.js         ← Google Places Text Search + Place Details calls
└── utils/
    └── placesCache.js          ← In-memory cache (Map, TTL 24h, max 500 entries)
```

### New API Routes
| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/v1/places/enrich` | Enrich activity with Google Places data |
| POST | `/api/v1/trip/suggest-destinations` | Return 3 AI destination suggestions from vague input |

### IP Geolocation
- Library: `ipapi.co` free API (no key needed, 1000 req/day) or `ip-api.com`.
- Called once on `/api/v1/trip/bundle` if no destination in request.
- Falls back gracefully to null (AI generates without location bias).

---

## 9. Testing Strategy

### Unit Tests (existing — keep all passing)
Node.js `node:test` suite. All existing 106 tests must remain green throughout.

### New Unit Tests
- `tests/unit/placesEnrich.test.js` — mock fetch, test cache hit/miss, test fallback on API error
- `tests/unit/destinationSuggestion.test.js` — test AI suggestion parsing, IP fallback
- `tests/unit/geolocation.test.js` — test IP geolocation service, null fallback

### Playwright E2E Tests
```
tests/e2e/
├── input-flow.spec.ts         ← Type trip idea, submit, see generating screen
├── generic-input.spec.ts      ← Vague input → destination picker → generation
├── results-mosaic.spec.ts     ← Tiles render, day tabs switch, weather shown
├── activity-detail.spec.ts    ← Tap activity → detail panel opens with Places data
├── refine-ai.spec.ts          ← Refine chip → regeneration → updated itinerary
├── packing-tab.spec.ts        ← Pack tab, check items, add custom item
└── share.spec.ts              ← Share icon copies link to clipboard
```

**E2E approach**: Mock backend API responses using Playwright's `route()` intercept. No real API calls in tests. Tests run against `vite preview` build.

---

## 10. Definition of Done

- [ ] All existing unit tests pass (`npm test`)
- [ ] All new unit tests pass
- [ ] All Playwright E2E tests pass
- [ ] `npm run build` completes without errors
- [ ] Input screen: text area + chips functional, IP geolocation working
- [ ] Generating screen: auto-transition, assumption card, live progress
- [ ] Destination picker: shown for generic input, 3 suggestions displayed
- [ ] Results mosaic: all 6 tiles render correctly on desktop and mobile
- [ ] Activity detail panel: opens on tap, shows Google Places data (photos, address, phone, rating)
- [ ] Refine with AI: chips + free text trigger regeneration in place
- [ ] Pack tab: separate, fully functional packing list with progress ring
- [ ] Share icon: copies shareable URL to clipboard, shows toast confirmation
- [ ] Fresh Meadow color scheme applied throughout
- [ ] New logo (SVG) in nav bar and as favicon
- [ ] No console errors in production build
- [ ] Railway deployment succeeds, live app works end-to-end

---

## 11. Out of Scope (this sprint)

- Full illustrated logo (commission separately post-launch)
- Real map tiles with interactive zoom (static map embed only)
- User accounts / trip saving to database
- PDF export (browser print works as fallback)
- iOS / Android app (Phase 3)
- Dark mode (removed — conflicts with Fresh Meadow light theme)
