# SproutRoute Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace SproutRoute's multi-step wizard with a smart text input → instant AI generation → mission-control mosaic results layout, with Google Places activity enrichment and Playwright E2E tests.

**Architecture:** Three screens (Input → Generating → Results mosaic). Frontend: React 18 + Vite + Tailwind, split into focused screen/component files. Backend: Express ESM, new `/api/v1/trip/parse-input` and `/api/v1/places/enrich` routes. All existing routes remain at `/api/`. TDD with node:test (unit) + Playwright (E2E).

**Tech Stack:** React 18, Vite, Tailwind CSS, Express (ESM), Claude Haiku (AI), Google Places API (New), Playwright, node:test

**Spec:** `docs/superpowers/specs/2026-03-26-sproutroute-redesign-design.md`

**Codebase root:** `/Users/nitish/VS Code Projects/tpm-portfolio/strollerscout`

**Key existing files verified working (do NOT recreate):**
- `src/backend/utils/aiClient.js` — Claude Haiku abstraction, exports `callModel(prompt, deps)`
- `src/backend/services/geocoding.js` — exports `geocodeLocation()`, `resolveDestinationQuery()`
- All other backend services listed in spec Section 8

---

## File Structure

### Files to Restore (from git)
```
package.json                              ← Root: test runner, scripts
package-lock.json
src/backend/package.json
src/backend/package-lock.json
src/backend/services/packingListAI.js     ← AI packing list generation
src/backend/utils/sanitize.js             ← Input validation
src/frontend/package.json
src/frontend/package-lock.json
src/frontend/index.html
src/frontend/vite.config.js
src/frontend/postcss.config.js
src/frontend/src/main.jsx
```

### New Backend Files
```
src/backend/services/parseInput.js        ← Parse natural language → structured trip data
src/backend/services/placesEnrich.js      ← Google Places Text Search + photo proxy
src/backend/utils/placesCache.js          ← In-memory TTL cache for Places results
```

### New Frontend Files
```
src/frontend/src/App.jsx                  ← REWRITE: screen router only (~60 lines)
src/frontend/src/screens/InputScreen.jsx  ← Smart text area + vibe chips
src/frontend/src/screens/GeneratingScreen.jsx ← Progress steps + assumption card + destination picker
src/frontend/src/screens/ResultsScreen.jsx    ← Tab bar + mosaic grid orchestration
src/frontend/src/components/mosaic/HeroTile.jsx
src/frontend/src/components/mosaic/WeatherTile.jsx
src/frontend/src/components/mosaic/ItineraryTile.jsx
src/frontend/src/components/mosaic/SafetyTile.jsx
src/frontend/src/components/DayTabs.jsx
src/frontend/src/components/ActivityDetailPanel.jsx
src/frontend/src/components/DestinationPicker.jsx
src/frontend/src/hooks/useTrip.js         ← Trip state + localStorage + screen transitions
src/frontend/src/hooks/useGeolocation.js  ← Browser geolocation + ip-api.com fallback
src/frontend/src/hooks/usePlacesEnrich.js ← Lazy Places enrichment per activity
src/frontend/src/utils/storage.js         ← Centralised localStorage keys
src/frontend/tailwind.config.js           ← UPDATE: Fresh Meadow palette
src/frontend/src/index.css                ← UPDATE: Fresh Meadow global styles
```

### New Test Files
```
tests/unit/parseInput.test.js
tests/unit/placesEnrich.test.js
tests/unit/placesCache.test.js
tests/e2e/input-flow.spec.ts
tests/e2e/generic-input.spec.ts
tests/e2e/results-mosaic.spec.ts
playwright.config.ts
```

---

## Task 1: Restore Deleted Files + Verify Build

**Files:**
- Restore: All 12 deleted files listed above
- Verify: `package.json` (root), `src/backend/package.json`, `src/frontend/package.json`

- [ ] **Step 1: Restore all deleted files from git**

```bash
cd /Users/nitish/VS\ Code\ Projects/tpm-portfolio/strollerscout
git restore package.json package-lock.json start.sh .env.example README.md
git restore src/backend/package.json src/backend/package-lock.json src/backend/.env.example
git restore src/backend/services/packingListAI.js src/backend/utils/sanitize.js
git restore src/frontend/package.json src/frontend/package-lock.json src/frontend/index.html
git restore src/frontend/vite.config.js src/frontend/postcss.config.js src/frontend/src/main.jsx
git restore docs/ARCHITECTURE.md docs/PRD.md
```

- [ ] **Step 2: Install dependencies**

```bash
cd /Users/nitish/VS\ Code\ Projects/tpm-portfolio/strollerscout
npm install
cd src/backend && npm install && cd ../..
cd src/frontend && npm install && cd ../..
```

- [ ] **Step 3: Run existing tests to establish baseline**

```bash
npm test
```

Expected: All existing tests pass. Record the count (expect ~80-100+).

- [ ] **Step 4: Verify frontend builds**

```bash
cd src/frontend && npm run build
```

Expected: Build completes with zero errors.

- [ ] **Step 5: Commit restoration**

```bash
git add -A
git commit -m "chore: restore deleted files and verify build

Restored 12 deleted files from git: package.json (root, backend, frontend),
sanitize.js, packingListAI.js, vite.config.js, main.jsx, postcss.config.js,
index.html, and config files. All tests pass, frontend builds."
```

---

## Task 2: Places Cache (Backend Utility)

**Files:**
- Create: `src/backend/utils/placesCache.js`
- Test: `tests/unit/placesCache.test.js`

- [ ] **Step 1: Write failing test for placesCache**

```js
// tests/unit/placesCache.test.js
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { PlacesCache } from "../../src/backend/utils/placesCache.js";

describe("PlacesCache", () => {
  let cache;
  beforeEach(() => { cache = new PlacesCache({ maxSize: 3, ttlMs: 100 }); });

  it("returns null for cache miss", () => {
    assert.equal(cache.get("unknown", "city"), null);
  });

  it("stores and retrieves a value", () => {
    cache.set("Mama's Fish House", "Maui", { rating: 4.9 });
    const result = cache.get("Mama's Fish House", "Maui");
    assert.deepEqual(result, { rating: 4.9 });
  });

  it("returns null after TTL expires", async () => {
    cache.set("place", "city", { data: true });
    await new Promise(r => setTimeout(r, 150));
    assert.equal(cache.get("place", "city"), null);
  });

  it("evicts oldest entry when maxSize exceeded", () => {
    cache.set("a", "city", { n: 1 });
    cache.set("b", "city", { n: 2 });
    cache.set("c", "city", { n: 3 });
    cache.set("d", "city", { n: 4 }); // Should evict "a"
    assert.equal(cache.get("a", "city"), null);
    assert.deepEqual(cache.get("d", "city"), { n: 4 });
  });

  it("generates consistent cache keys regardless of case", () => {
    cache.set("Mama's Fish House", "Maui, Hawaii", { rating: 4.9 });
    const result = cache.get("mama's fish house", "maui, hawaii");
    assert.deepEqual(result, { rating: 4.9 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
node --test tests/unit/placesCache.test.js
```

Expected: FAIL — `PlacesCache` module not found.

- [ ] **Step 3: Implement PlacesCache**

```js
// src/backend/utils/placesCache.js

export class PlacesCache {
  constructor({ maxSize = 500, ttlMs = 24 * 60 * 60 * 1000 } = {}) {
    this._map = new Map();
    this._maxSize = maxSize;
    this._ttlMs = ttlMs;
  }

  _key(name, destination) {
    return `${(name || "").toLowerCase().trim()}||${(destination || "").toLowerCase().trim()}`;
  }

  get(name, destination) {
    const key = this._key(name, destination);
    const entry = this._map.get(key);
    if (!entry) return null;
    if (Date.now() - entry.ts > this._ttlMs) {
      this._map.delete(key);
      return null;
    }
    return entry.value;
  }

  set(name, destination, value) {
    const key = this._key(name, destination);
    if (this._map.size >= this._maxSize && !this._map.has(key)) {
      const firstKey = this._map.keys().next().value;
      this._map.delete(firstKey);
    }
    this._map.set(key, { value, ts: Date.now() });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
node --test tests/unit/placesCache.test.js
```

Expected: All 5 tests PASS.

- [ ] **Step 5: Run full test suite**

```bash
npm test
```

Expected: All tests pass (baseline + 5 new).

- [ ] **Step 6: Commit**

```bash
git add src/backend/utils/placesCache.js tests/unit/placesCache.test.js
git commit -m "feat: add PlacesCache with TTL and LRU eviction"
```

---

## Task 3: Google Places Enrichment Service

**Files:**
- Create: `src/backend/services/placesEnrich.js`
- Test: `tests/unit/placesEnrich.test.js`

- [ ] **Step 1: Write failing tests for placesEnrich**

```js
// tests/unit/placesEnrich.test.js
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { enrichActivity, __resetCacheForTests } from "../../src/backend/services/placesEnrich.js";

const originalFetch = global.fetch;
const originalEnv = { ...process.env };

describe("enrichActivity", () => {
  afterEach(() => {
    global.fetch = originalFetch;
    process.env = { ...originalEnv };
    __resetCacheForTests();
  });

  it("returns enriched data from Google Places", async () => {
    process.env.GOOGLE_PLACES_API_KEY = "test-key";
    global.fetch = async (url, opts) => {
      if (url.includes("places:searchText")) {
        return {
          ok: true,
          json: async () => ({
            places: [{
              id: "ChIJ123",
              displayName: { text: "Mama's Fish House" },
              rating: 4.9,
              userRatingCount: 2847,
              formattedAddress: "799 Poho Pl, Paia, HI 96779",
              nationalPhoneNumber: "(808) 579-8488",
              websiteUri: "https://mamasfishhouse.com",
              regularOpeningHours: { weekdayDescriptions: ["Mon–Sun: 11am–9pm"] },
              priceLevel: "PRICE_LEVEL_EXPENSIVE",
              googleMapsUri: "https://maps.google.com/?cid=123",
              photos: [{ name: "places/ChIJ123/photos/abc" }],
            }],
          }),
        };
      }
      return { ok: false, status: 404 };
    };

    const result = await enrichActivity("Mama's Fish House", "Maui, Hawaii", "restaurant");
    assert.equal(result.name, "Mama's Fish House");
    assert.equal(result.rating, 4.9);
    assert.equal(result.address, "799 Poho Pl, Paia, HI 96779");
    assert.equal(result.phone, "(808) 579-8488");
    assert.ok(result.photos[0].includes("/api/v1/places/photo"));
  });

  it("returns null when no places found", async () => {
    process.env.GOOGLE_PLACES_API_KEY = "test-key";
    global.fetch = async () => ({
      ok: true,
      json: async () => ({ places: [] }),
    });
    const result = await enrichActivity("Nonexistent Place", "Nowhere");
    assert.equal(result, null);
  });

  it("returns null when API key is missing", async () => {
    delete process.env.GOOGLE_PLACES_API_KEY;
    const result = await enrichActivity("Test", "City");
    assert.equal(result, null);
  });

  it("returns cached result on second call", async () => {
    process.env.GOOGLE_PLACES_API_KEY = "test-key";
    let callCount = 0;
    global.fetch = async () => {
      callCount++;
      return {
        ok: true,
        json: async () => ({
          places: [{
            id: "ChIJ123", displayName: { text: "Test" }, rating: 4.0,
            userRatingCount: 100, formattedAddress: "123 St",
            photos: [], googleMapsUri: "https://maps.google.com",
          }],
        }),
      };
    };
    await enrichActivity("Test Place", "City");
    await enrichActivity("Test Place", "City");
    assert.equal(callCount, 1); // Second call should hit cache
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
node --test tests/unit/placesEnrich.test.js
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement placesEnrich.js**

```js
// src/backend/services/placesEnrich.js
import { PlacesCache } from "../utils/placesCache.js";

const cache = new PlacesCache({ maxSize: 500, ttlMs: 24 * 60 * 60 * 1000 });

const FIELD_MASK = [
  "places.id", "places.displayName", "places.rating", "places.userRatingCount",
  "places.formattedAddress", "places.nationalPhoneNumber", "places.websiteUri",
  "places.regularOpeningHours", "places.priceLevel", "places.googleMapsUri", "places.photos",
].join(",");

export async function enrichActivity(activityName, destination, category = "") {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) return null;

  const cached = cache.get(activityName, destination);
  if (cached) return cached;

  try {
    const query = category
      ? `${activityName} ${category} in ${destination}`
      : `${activityName} in ${destination}`;

    const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": FIELD_MASK,
      },
      body: JSON.stringify({ textQuery: query, maxResultCount: 1 }),
    });

    if (!res.ok) return null;
    const data = await res.json();
    if (!data.places || data.places.length === 0) return null;

    const place = data.places[0];
    const result = {
      placeId: place.id,
      name: place.displayName?.text || activityName,
      rating: place.rating || null,
      userRatingsTotal: place.userRatingCount || null,
      address: place.formattedAddress || null,
      phone: place.nationalPhoneNumber || null,
      website: place.websiteUri || null,
      openingHours: place.regularOpeningHours?.weekdayDescriptions || [],
      priceLevel: parsePriceLevel(place.priceLevel),
      mapsUrl: place.googleMapsUri || null,
      photos: (place.photos || []).slice(0, 5).map(p =>
        `/api/v1/places/photo?ref=${encodeURIComponent(p.name)}`
      ),
    };

    cache.set(activityName, destination, result);
    return result;
  } catch (err) {
    if (process.env.NODE_ENV !== "production") console.error("Places enrichment error:", err);
    return null;
  }
}

function parsePriceLevel(level) {
  const map = {
    PRICE_LEVEL_FREE: 0, PRICE_LEVEL_INEXPENSIVE: 1,
    PRICE_LEVEL_MODERATE: 2, PRICE_LEVEL_EXPENSIVE: 3, PRICE_LEVEL_VERY_EXPENSIVE: 4,
  };
  return map[level] ?? null;
}

export function __resetCacheForTests() {
  cache._map.clear();
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
node --test tests/unit/placesEnrich.test.js
```

Expected: All 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/backend/services/placesEnrich.js tests/unit/placesEnrich.test.js
git commit -m "feat: add Google Places enrichment service with caching"
```

---

## Task 4: Parse Input Service (Backend)

**Files:**
- Create: `src/backend/services/parseInput.js`
- Test: `tests/unit/parseInput.test.js`

- [ ] **Step 1: Write failing tests for parseInput**

```js
// tests/unit/parseInput.test.js
import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import { parseInput } from "../../src/backend/services/parseInput.js";

describe("parseInput", () => {
  const mockAI = async (prompt) => {
    // Simulate AI returning structured JSON
    if (prompt.includes("beach vacation")) {
      return JSON.stringify({
        destination: "Maui, Hawaii",
        startDate: "2026-04-12",
        endDate: "2026-04-19",
        adults: 2,
        childrenAges: [4, 8],
        vibe: "beach",
      });
    }
    if (prompt.includes("relaxing trip")) {
      return JSON.stringify({
        destination: null,
        suggestedDestinations: [
          { name: "Maui, Hawaii", emoji: "🌴", description: "Stunning beaches", season_note: "Perfect spring weather" },
          { name: "Cancun, Mexico", emoji: "🏖", description: "All-inclusive resorts", season_note: "Warm and sunny" },
          { name: "San Diego, CA", emoji: "☀️", description: "Family-friendly coast", season_note: "Mild spring temps" },
        ],
        adults: 2,
        childrenAges: [],
        vibe: "relaxing",
      });
    }
    return JSON.stringify({ destination: null, adults: 1, childrenAges: [], vibe: "general" });
  };

  it("parses specific input with destination", async () => {
    const result = await parseInput("beach vacation in Maui with two kids age 4 and 8", { callAI: mockAI });
    assert.equal(result.destination, "Maui, Hawaii");
    assert.deepEqual(result.childrenAges, [4, 8]);
    assert.equal(result.vibe, "beach");
  });

  it("returns suggestions for vague input", async () => {
    const result = await parseInput("relaxing trip for spring break", { callAI: mockAI });
    assert.equal(result.destination, null);
    assert.equal(result.suggestedDestinations.length, 3);
    assert.equal(result.suggestedDestinations[0].name, "Maui, Hawaii");
  });

  it("includes detectedRegion when provided", async () => {
    const result = await parseInput("beach vacation in Maui with two kids age 4 and 8", {
      callAI: mockAI,
      detectedRegion: "Chicago, IL",
    });
    assert.equal(result.detectedRegion, "Chicago, IL");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
node --test tests/unit/parseInput.test.js
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement parseInput.js**

```js
// src/backend/services/parseInput.js
import { callModel } from "../utils/aiClient.js";

const PARSE_PROMPT = (userText, region) => `You are a trip planner assistant. Parse this trip request into structured JSON.

User input: "${userText}"
${region ? `User is located near: ${region}` : ""}
Current date: ${new Date().toISOString().split("T")[0]}

Return ONLY valid JSON with these fields:
{
  "destination": "City, State/Country" or null if ambiguous/missing,
  "suggestedDestinations": [] or if destination is null, array of 3 suggestions: [{"name":"City, State","emoji":"🌴","description":"One line","season_note":"Weather note"}],
  "startDate": "YYYY-MM-DD" or null (guess from context like "spring break" → mid-April),
  "endDate": "YYYY-MM-DD" or null,
  "adults": number (default 2),
  "childrenAges": [numbers] or [],
  "vibe": one of "beach","adventure","theme_parks","international","cruise","camping","city","relaxing","general"
}

If the user mentions "spring break" and no dates, use April 12-19 of the current year.
If no kids mentioned, childrenAges should be [].
If destination is vague ("beach trip", "somewhere warm"), set destination to null and provide 3 suggestedDestinations based on the user's location and season.`;

export async function parseInput(text, deps = {}) {
  const callAI = deps.callAI || (async (prompt) => {
    const result = await callModel(prompt);
    return result;
  });
  const detectedRegion = deps.detectedRegion || null;

  const prompt = PARSE_PROMPT(text, detectedRegion);
  const raw = await callAI(prompt);

  let parsed;
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    parsed = JSON.parse(jsonMatch ? jsonMatch[0] : raw);
  } catch {
    return {
      destination: null,
      suggestedDestinations: [],
      startDate: null,
      endDate: null,
      adults: 2,
      childrenAges: [],
      vibe: "general",
      detectedRegion,
    };
  }

  return {
    destination: parsed.destination || null,
    suggestedDestinations: parsed.suggestedDestinations || [],
    startDate: parsed.startDate || null,
    endDate: parsed.endDate || null,
    adults: parsed.adults || 2,
    childrenAges: Array.isArray(parsed.childrenAges) ? parsed.childrenAges : [],
    vibe: parsed.vibe || "general",
    detectedRegion,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
node --test tests/unit/parseInput.test.js
```

Expected: All 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/backend/services/parseInput.js tests/unit/parseInput.test.js
git commit -m "feat: add parseInput service — AI-powered natural language trip parser"
```

---

## Task 5: Add New Backend Routes to server.js

**Files:**
- Modify: `src/backend/server.js` (add 3 new routes at end of route definitions)

- [ ] **Step 1: Add imports to top of server.js**

Add after the existing imports:
```js
import { parseInput } from "./services/parseInput.js";
import { enrichActivity } from "./services/placesEnrich.js";
```

- [ ] **Step 1b: Add 4 new routes to server.js**

Add after the existing v1 routes. Complete code:

```js
// ─── Parse natural language trip input ───
app.post("/api/v1/trip/parse-input", async (req, res) => {
  try {
    const { text, detectedLat, detectedLon } = req.body;
    if (!text || typeof text !== "string" || text.trim().length === 0) {
      return res.status(422).json({ error: "text is required" });
    }
    // Reverse-geocode lat/lon to region string if provided
    let detectedRegion = null;
    if (detectedLat && detectedLon) {
      try {
        const geoRes = await fetch(
          `https://nominatim.openstreetmap.org/reverse?lat=${detectedLat}&lon=${detectedLon}&format=json`,
          { headers: { "User-Agent": "SproutRoute/1.0" } }
        );
        if (geoRes.ok) {
          const geoData = await geoRes.json();
          const addr = geoData.address || {};
          detectedRegion = [addr.city || addr.town, addr.state].filter(Boolean).join(", ");
        }
      } catch { /* silent — region is optional */ }
    }
    const result = await parseInput(text.trim(), { detectedRegion });
    res.json(result);
  } catch (err) {
    console.error("parse-input error:", err);
    res.status(500).json({ error: "Failed to parse trip input" });
  }
});

// ─── Enrich activity with Google Places data ───
app.post("/api/v1/places/enrich", async (req, res) => {
  try {
    const { activityName, destination, category } = req.body;
    if (!activityName || !destination) {
      return res.status(422).json({ error: "activityName and destination required" });
    }
    const result = await enrichActivity(activityName, destination, category || "");
    if (!result) return res.json(null);
    res.json(result);
  } catch (err) {
    console.error("places enrich error:", err);
    res.status(500).json({ error: "Failed to enrich activity" });
  }
});

// ─── Proxy Google Places photo (keeps API key server-side) ───
app.get("/api/v1/places/photo", async (req, res) => {
  try {
    const ref = req.query.ref;
    const apiKey = process.env.GOOGLE_PLACES_API_KEY;
    if (!ref || !apiKey) return res.status(400).send("Missing ref or API key");
    const photoUrl = `https://places.googleapis.com/v1/${ref}/media?maxWidthPx=800&key=${apiKey}`;
    const photoRes = await fetch(photoUrl);
    if (!photoRes.ok) return res.status(photoRes.status).send("Photo not found");
    res.set("Content-Type", photoRes.headers.get("content-type") || "image/jpeg");
    res.set("Cache-Control", "public, max-age=86400");
    const buffer = Buffer.from(await photoRes.arrayBuffer());
    res.send(buffer);
  } catch (err) {
    console.error("photo proxy error:", err);
    res.status(500).send("Photo proxy error");
  }
});

// ─── IP geolocation proxy (ip-api.com is HTTP-only, can't call from HTTPS frontend) ───
app.get("/api/v1/geo/detect", async (req, res) => {
  try {
    const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.ip;
    const geoRes = await fetch(`http://ip-api.com/json/${ip}?fields=lat,lon,city,regionName,country`);
    if (!geoRes.ok) return res.json({ lat: null, lon: null, region: null });
    const data = await geoRes.json();
    res.json({
      lat: data.lat || null,
      lon: data.lon || null,
      region: [data.city, data.regionName].filter(Boolean).join(", ") || null,
    });
  } catch {
    res.json({ lat: null, lon: null, region: null });
  }
});
```

- [ ] **Step 2: Run full test suite**

```bash
npm test
```

Expected: All existing + new tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/backend/server.js
git commit -m "feat: add /api/v1/trip/parse-input, /api/v1/places/enrich, /api/v1/places/photo routes"
```

---

## Task 6: Fresh Meadow Theme + SVG Logo

**Files:**
- Modify: `src/frontend/tailwind.config.js`
- Modify: `src/frontend/src/index.css`
- Create: `src/frontend/public/logo.svg` (app icon SVG)
- Create: `src/frontend/public/favicon.svg`

- [ ] **Step 1: Update tailwind.config.js with Fresh Meadow palette**

Replace the current color scheme with Fresh Meadow colors. Key tokens:
- `meadow` (green scale): 50 → `#f0fdf4`, 100 → `#dcfce7`, 200 → `#bbf7d0`, 400 → `#4ade80`, 500 → `#22c55e`, 600 → `#16a34a`, 700 → `#15803d`, 800 → `#166534`, 900 → `#14532d`
- `surface`: `#ffffff`
- `bg`: `#f9fafb`
- Remove dark mode colors (out of scope per spec)
- Typography: `fontFamily` → `display: ['Space Grotesk', ...]`, `body: ['Inter', ...]`

- [ ] **Step 2: Update index.css for Fresh Meadow global styles**

Remove dark mode rules (`html.dark *`). Set body background to `#f9fafb`. Keep print styles. Remove old activity chip dark mode styles. Add base styles for the mosaic tiles.

- [ ] **Step 2b: Update index.html with Google Fonts + favicon**

In `src/frontend/index.html`, ensure these are in `<head>`:
```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Space+Grotesk:wght@500;600;700;800&display=swap" rel="stylesheet">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
```

- [ ] **Step 2c: Add GOOGLE_PLACES_API_KEY to .env.example files**

Add to both `src/backend/.env.example` and root `.env.example`:
```
GOOGLE_PLACES_API_KEY=your_google_places_api_key_here
```

- [ ] **Step 3: Create SVG logo files**

Create `src/frontend/public/logo.svg` — the square-rounded app icon with green gradient and white sprout character (as designed in brainstorming mockups). Create `src/frontend/public/favicon.svg` — same icon at 32x32.

- [ ] **Step 4: Verify frontend builds**

```bash
cd src/frontend && npm run build
```

Expected: Clean build, no errors.

- [ ] **Step 5: Commit**

```bash
git add src/frontend/tailwind.config.js src/frontend/src/index.css src/frontend/public/
git commit -m "feat: apply Fresh Meadow theme + new SVG sprout logo"
```

---

## Task 7: Frontend Utils and Hooks

**Files:**
- Create: `src/frontend/src/utils/storage.js`
- Create: `src/frontend/src/hooks/useTrip.js`
- Create: `src/frontend/src/hooks/useGeolocation.js`
- Create: `src/frontend/src/hooks/usePlacesEnrich.js`

- [ ] **Step 1: Create storage.js (centralised localStorage keys)**

```js
// src/frontend/src/utils/storage.js
export const STORAGE_KEYS = {
  theme: "sproutroute-theme",
  trip: "sproutroute_trip",
  checked: "sproutroute_checked",
  customItems: "sproutroute_custom_items",
};

export function loadJSON(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function saveJSON(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* quota exceeded */ }
}
```

- [ ] **Step 2: Create useGeolocation.js**

NOTE: `ip-api.com` is HTTP-only (HTTPS requires paid plan). Since the app is served over HTTPS, we must proxy through our backend to avoid mixed-content blocking.

```js
// src/frontend/src/hooks/useGeolocation.js
import { useState, useEffect } from "react";

export function useGeolocation() {
  const [location, setLocation] = useState(null);

  useEffect(() => {
    // Try browser geolocation first (most accurate)
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setLocation({ lat: pos.coords.latitude, lon: pos.coords.longitude, source: "gps" }),
        () => fallbackToIP(),
        { timeout: 5000, maximumAge: 300000 }
      );
    } else {
      fallbackToIP();
    }

    // Fallback: call our backend proxy (which calls ip-api.com server-side over HTTP)
    async function fallbackToIP() {
      try {
        const res = await fetch("/api/v1/geo/detect");
        if (res.ok) {
          const data = await res.json();
          setLocation({ lat: data.lat, lon: data.lon, region: data.region, source: "ip" });
        }
      } catch { /* silent fail — location is optional */ }
    }
  }, []);

  return location;
}
```
```

- [ ] **Step 3: Create useTrip.js (trip state machine)**

```js
// src/frontend/src/hooks/useTrip.js
import { useState, useCallback } from "react";
import * as api from "../services/api.js";
import { STORAGE_KEYS, loadJSON, saveJSON } from "../utils/storage.js";

const SCREENS = { INPUT: "input", GENERATING: "generating", RESULTS: "results" };
const STEPS = ["resolve", "weather", "itinerary", "packing", "safety"];

export function useTrip() {
  const [screen, setScreen] = useState(SCREENS.INPUT);
  const [tripInput, setTripInput] = useState("");
  const [parsedInput, setParsedInput] = useState(null);
  const [tripData, setTripData] = useState(() => loadJSON(STORAGE_KEYS.trip));
  const [packingList, setPackingList] = useState(null);
  const [safetyData, setSafetyData] = useState(null);
  const [progress, setProgress] = useState({});  // { resolve: "done", weather: "active", ... }
  const [error, setError] = useState(null);

  const markStep = (step, status) => setProgress(p => ({ ...p, [step]: status }));

  const submitTrip = useCallback(async (text, geolocation) => {
    setTripInput(text);
    setError(null);
    setScreen(SCREENS.GENERATING);
    setProgress({});

    try {
      // Step 1: Parse input via AI
      markStep("resolve", "active");
      const parsed = await api.parseInput(
        text,
        geolocation?.lat || null,
        geolocation?.lon || null
      );
      setParsedInput(parsed);
      markStep("resolve", "done");

      // If no destination, pause for user to pick from suggestions
      if (!parsed.destination && parsed.suggestedDestinations?.length > 0) {
        return; // GeneratingScreen shows DestinationPicker, user calls selectDestination()
      }

      // Continue with full generation
      await generateTrip(parsed);
    } catch (err) {
      setError(err.message || "Something went wrong");
    }
  }, []);

  const selectDestination = useCallback(async (destinationName) => {
    const updated = { ...parsedInput, destination: destinationName, suggestedDestinations: [] };
    setParsedInput(updated);
    try {
      await generateTrip(updated);
    } catch (err) {
      setError(err.message || "Something went wrong");
    }
  }, [parsedInput]);

  async function generateTrip(parsed) {
    // Step 2: Call existing trip-plan endpoint (weather + itinerary)
    markStep("weather", "active");
    const formData = {
      destination: parsed.destination,
      startDate: parsed.startDate,
      endDate: parsed.endDate,
      adults: parsed.adults,
      childrenAges: parsed.childrenAges,
      activities: [parsed.vibe],
    };

    const tripResult = await api.bundleTripPlan(formData, {
      onRetry: () => markStep("itinerary", "active"),
    });
    markStep("weather", "done");
    markStep("itinerary", "done");

    // Step 3: Packing list
    markStep("packing", "active");
    try {
      const packing = await api.generatePackingList(formData);
      setPackingList(packing);
    } catch { /* non-blocking */ }
    markStep("packing", "done");

    // Step 4: Safety
    markStep("safety", "active");
    try {
      const safety = await api.getCarSeatCheck(formData);
      setSafetyData(safety);
    } catch { /* non-blocking */ }
    markStep("safety", "done");

    // Save and transition
    const fullData = { ...tripResult, parsed };
    setTripData(fullData);
    saveJSON(STORAGE_KEYS.trip, fullData);
    setScreen(SCREENS.RESULTS);
  }

  const goBack = useCallback(() => {
    setScreen(SCREENS.INPUT);
    setParsedInput(null);
    setProgress({});
    setError(null);
  }, []);

  return {
    screen, tripInput, parsedInput, tripData, packingList, safetyData,
    progress, error, STEPS,
    submitTrip, selectDestination, goBack,
  };
}
```

- [ ] **Step 4: Create usePlacesEnrich.js (lazy enrichment)**

```js
// src/frontend/src/hooks/usePlacesEnrich.js
import { useState, useCallback, useRef } from "react";

export function usePlacesEnrich() {
  const [enrichedData, setEnrichedData] = useState({});
  const inflight = useRef(new Set());

  const enrich = useCallback(async (activityName, destination, category) => {
    const key = `${activityName}||${destination}`;
    if (enrichedData[key] || inflight.current.has(key)) return enrichedData[key] || null;

    inflight.current.add(key);
    try {
      const res = await fetch("/api/v1/places/enrich", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activityName, destination, category }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      setEnrichedData(prev => ({ ...prev, [key]: data }));
      return data;
    } catch { return null; }
    finally { inflight.current.delete(key); }
  }, [enrichedData]);

  return { enrichedData, enrich };
}
```

- [ ] **Step 5: Commit**

```bash
git add src/frontend/src/utils/storage.js src/frontend/src/hooks/
git commit -m "feat: add storage utils + useTrip, useGeolocation, usePlacesEnrich hooks"
```

---

## Task 8: Input Screen

**Files:**
- Create: `src/frontend/src/screens/InputScreen.jsx`

- [ ] **Step 1: Build InputScreen component**

Renders:
- Hero heading: "Where is your family headed next?" with `<span>` in green
- Subtitle: "Describe your dream trip and we'll handle the rest."
- Large textarea (border-2, rounded-2xl, shadow) with multi-line placeholder
- "Plan it ✨" button (green, bottom-right of textarea box)
- Divider: "— or start with a vibe —"
- Chip row: 7 vibe chips. Each chip on click sets textarea value to a prefill string (e.g. "🏖 Beach trip" → "Fun beach trip for the family")
- Accepts `onSubmit(text)` prop. Calls it with textarea value on button click or Enter key.
- Textarea auto-focuses on mount.

- [ ] **Step 2: Verify it renders (visual check in dev server)**

```bash
cd src/frontend && npm run dev
```

Open browser, verify InputScreen renders with textarea, chips, and button.

- [ ] **Step 3: Commit**

```bash
git add src/frontend/src/screens/InputScreen.jsx
git commit -m "feat: add InputScreen — smart text area with vibe chips"
```

---

## Task 9: Generating Screen + Destination Picker

**Files:**
- Create: `src/frontend/src/screens/GeneratingScreen.jsx`
- Create: `src/frontend/src/components/DestinationPicker.jsx`

- [ ] **Step 1: Build GeneratingScreen component**

Props: `parsedInput`, `progress` (object with step statuses), `onPickDestination`, `onEditAssumptions`.

Renders:
- Floating animated sprout emoji (CSS `@keyframes float`)
- "Building your trip plan…" title + "This takes about 10–15 seconds" subtitle
- Assumption card (green tinted, `bg-meadow-50 border border-meadow-200 rounded-xl`): shows destination, dates, adults, kids, vibe. "✏ Something wrong? Edit →" link calls `onEditAssumptions`.
- Progress steps list (5 items): each has icon (✓ done, ⟳ active spinning, ○ pending) + label
- If `parsedInput.suggestedDestinations` has items, renders `<DestinationPicker>` overlay instead of progress

- [ ] **Step 2: Build DestinationPicker component**

Props: `suggestions` (array of `{name, emoji, description, season_note}`), `onPick(destination)`.

Renders:
- Overlay card: "We found a few great matches — pick one to continue."
- 3 suggestion cards in a column, each showing emoji, name, description, season_note
- On tap, calls `onPick(suggestion.name)`

- [ ] **Step 3: Verify both render (visual check)**

```bash
cd src/frontend && npm run dev
```

Navigate through: type generic text → see DestinationPicker. Type specific text → see progress steps.

- [ ] **Step 4: Commit**

```bash
git add src/frontend/src/screens/GeneratingScreen.jsx src/frontend/src/components/DestinationPicker.jsx
git commit -m "feat: add GeneratingScreen with progress steps and DestinationPicker"
```

---

## Task 10: Results Screen — Mosaic Shell + Hero Tile

**Files:**
- Create: `src/frontend/src/screens/ResultsScreen.jsx`
- Create: `src/frontend/src/components/mosaic/HeroTile.jsx`

- [ ] **Step 1: Build ResultsScreen mosaic grid shell**

Props: `tripData`, `parsedInput`, `packingList`, `safetyData`.

Renders:
- Tab bar (📅 Plan | 🎒 Pack) — state for active tab
- Plan tab: CSS grid `grid-cols-[1.5fr_1fr]` on desktop, `grid-cols-1` on mobile
  - Grid areas: hero (col1, row1-2), weather (col2, row1), itinerary (col1, row2-3), safety (col2, row2)
  - Each tile is a placeholder `<div>` for now — filled in subsequent tasks
- Pack tab: placeholder "Coming soon" message

- [ ] **Step 2: Build HeroTile**

Props: `tripData`, `parsedInput`.

Renders green gradient card with: destination name + emoji, dates, trip length, tag chips (weather, family, safety score), "Assumed: ..." edit link at bottom. Tailwind classes: `bg-gradient-to-br from-meadow-900 via-meadow-600 to-meadow-400 text-white rounded-2xl`.

- [ ] **Step 3: Wire HeroTile into ResultsScreen grid**

Replace hero placeholder with `<HeroTile>`.

- [ ] **Step 4: Commit**

```bash
git add src/frontend/src/screens/ResultsScreen.jsx src/frontend/src/components/mosaic/HeroTile.jsx
git commit -m "feat: add ResultsScreen mosaic grid + HeroTile"
```

---

## Task 11: Weather Tile + Itinerary Tile + Day Tabs

**Files:**
- Create: `src/frontend/src/components/mosaic/WeatherTile.jsx`
- Create: `src/frontend/src/components/mosaic/ItineraryTile.jsx`
- Create: `src/frontend/src/components/DayTabs.jsx`

- [ ] **Step 1: Build WeatherTile**

Props: `forecast` (array of day objects from weather API).

Renders white tile with: current day big temp + emoji + conditions, 7-day row of mini forecasts (day initial, emoji, high temp). Border `border border-gray-200 rounded-2xl`.

- [ ] **Step 2: Build DayTabs**

Props: `days` (array), `activeDay` (index), `onSelectDay`.

Renders horizontal scrollable row of day buttons. Active day has `bg-meadow-600 text-white` styling.

- [ ] **Step 3: Build ItineraryTile**

Props: `dailyItinerary` (array of day objects), `forecast`, `onActivityTap(activity)`.

Renders: DayTabs at top, then active day's content: date + weather for that day, then activity rows. Each activity row: emoji/photo thumbnail, time, name, description (2-line clamp), tag chips. Tapping a row calls `onActivityTap`. Activity row hover: `hover:bg-meadow-50 hover:border-meadow-200`.

- [ ] **Step 4: Wire into ResultsScreen**

Replace weather and itinerary placeholders with real components. Pass `tripData.forecast` to WeatherTile and `tripData.dailyItinerary` to ItineraryTile.

- [ ] **Step 5: Commit**

```bash
git add src/frontend/src/components/mosaic/WeatherTile.jsx src/frontend/src/components/mosaic/ItineraryTile.jsx src/frontend/src/components/DayTabs.jsx
git commit -m "feat: add WeatherTile, ItineraryTile, DayTabs — mosaic content tiles"
```

---

## Task 12: Safety Tile

**Files:**
- Create: `src/frontend/src/components/mosaic/SafetyTile.jsx`

- [ ] **Step 1: Build SafetyTile**

Props: `safetyData` (object with `carSeat`, `travelAdvisory`, `neighborhoodSafety`).

Renders white tile with 4 compact rows: Car Seat law (badge green/yellow), Travel Advisory level, Neighborhood Safety (dot indicators + score), Emergency number. Graceful null handling — hides rows for missing data.

- [ ] **Step 2: Wire into ResultsScreen grid**

- [ ] **Step 3: Commit**

```bash
git add src/frontend/src/components/mosaic/SafetyTile.jsx
git commit -m "feat: add SafetyTile — car seat, advisory, neighborhood safety"
```

---

## Task 13: Activity Detail Panel

**Files:**
- Create: `src/frontend/src/components/ActivityDetailPanel.jsx`

- [ ] **Step 1: Build ActivityDetailPanel**

Props: `activity` (AI-generated data), `placesData` (from usePlacesEnrich, may be null), `isOpen`, `onClose`.

Renders slide-in panel (fixed right, 380px wide on desktop, full-width mobile):
- Close button (✕) top-right
- Photo area: if `placesData?.photos`, show first photo as img tag (src = proxy URL). Else show large emoji.
- Category badge + time
- Activity name (Space Grotesk 800)
- Star rating + review count (if placesData)
- Description (from AI)
- Info grid (2-col): address, duration, cost, best age, phone, website (from placesData where available)
- Actions: "Open in Maps 🗺" (href to mapsUrl), "Remove from plan" button
- Slide animation: `transform: translateX(100%)` → `translateX(0)` with `transition: transform 0.3s ease`.
- Click outside panel closes it.

- [ ] **Step 2: Wire into ResultsScreen**

When `onActivityTap` fires in ItineraryTile, set `selectedActivity` state. Pass it to `<ActivityDetailPanel>`. On open, call `enrich()` from usePlacesEnrich hook.

- [ ] **Step 3: Commit**

```bash
git add src/frontend/src/components/ActivityDetailPanel.jsx
git commit -m "feat: add ActivityDetailPanel — slide-in with Google Places data"
```

---

## Task 14: App.jsx Rewrite + Screen Wiring

**Files:**
- Modify: `src/frontend/src/App.jsx` (complete rewrite ~60 lines)
- Modify: `src/frontend/src/services/api.js` (add `parseInput()` and `enrichActivity()` functions)

- [ ] **Step 1: Add new API functions to api.js**

Add to existing `api.js`:
- `parseInput(text, detectedLat, detectedLon)` → POST `/api/v1/trip/parse-input`
- `enrichActivity(activityName, destination, category)` → POST `/api/v1/places/enrich`

Keep all existing functions (`bundleTripPlan`, `resolveDestination`, etc.) — they are still used by the generating flow.

- [ ] **Step 2: Rewrite App.jsx as screen router**

New App.jsx (~60 lines):
- Imports: InputScreen, GeneratingScreen, ResultsScreen
- Uses: `useTrip()` hook for all state + screen transitions
- Uses: `useGeolocation()` for silent location detection
- Renders sticky nav (logo SVG + destination pill + share icon) then current screen based on `useTrip().screen`
- The `useTrip()` hook handles: `submitTrip()` (calls parseInput API → if destination, calls existing bundleTripPlan → sets screen to results), `selectDestination()` (fills in destination from picker → continues generation), `goBack()` (returns to input screen)

- [ ] **Step 3: Verify full flow works end-to-end**

```bash
cd src/frontend && npm run dev
```

Test: type "beach vacation in Maui with kids 4 and 8" → see generating screen → see results mosaic with all tiles.

- [ ] **Step 4: Build production bundle**

```bash
cd src/frontend && npm run build
```

Expected: Clean build.

- [ ] **Step 5: Commit**

```bash
git add src/frontend/src/App.jsx src/frontend/src/services/api.js
git commit -m "feat: rewrite App.jsx as screen router + add parseInput/enrich API functions"
```

---

## Task 15: Playwright Setup + Tier 1 E2E Tests

**Files:**
- Create: `playwright.config.ts`
- Create: `tests/e2e/input-flow.spec.ts`
- Create: `tests/e2e/generic-input.spec.ts`
- Create: `tests/e2e/results-mosaic.spec.ts`

- [ ] **Step 1: Install Playwright**

```bash
cd /Users/nitish/VS\ Code\ Projects/tpm-portfolio/strollerscout
npm install -D @playwright/test
npx playwright install chromium
```

- [ ] **Step 2: Create playwright.config.ts**

```ts
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  use: {
    baseURL: "http://localhost:4173",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "cd src/frontend && npm run build && npm run preview",
    port: 4173,
    reuseExistingServer: true,
    timeout: 60000,
  },
});
```

- [ ] **Step 2b: Add test:e2e script to root package.json**

Add to the `"scripts"` section:
```json
"test:e2e": "npx playwright test"
```

- [ ] **Step 2c: Add Playwright to .github/workflows/test.yml**

Add after the existing test step:
```yaml
    - name: E2E Tests (Playwright)
      run: npx playwright install chromium --with-deps && npm run test:e2e
```

- [ ] **Step 3: Write input-flow.spec.ts**

```ts
import { test, expect } from "@playwright/test";

test.describe("Input Flow", () => {
  test.beforeEach(async ({ page }) => {
    // Mock parse-input API
    await page.route("**/api/v1/trip/parse-input", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          destination: "Maui, Hawaii",
          startDate: "2026-04-12", endDate: "2026-04-19",
          adults: 2, childrenAges: [4, 8], vibe: "beach",
          suggestedDestinations: [], detectedRegion: null,
        }),
      });
    });
    // Mock trip-plan bundle
    await page.route("**/api/trip-plan", async (route) => {
      await route.fulfill({
        status: 200, contentType: "application/json",
        body: JSON.stringify({
          destination: "Maui, Hawaii", startDate: "2026-04-12", endDate: "2026-04-19",
          forecast: [{ date: "2026-04-12", high: 76, low: 68, conditions: "Sunny", emoji: "☀️" }],
          dailyItinerary: [{ day: 1, date: "2026-04-12", activities: [{ name: "Road to Hana", time: "9:00 AM", description: "Scenic drive", category: "scenic", tags: ["scenic"] }] }],
        }),
      });
    });
    await page.route("**/api/generate", async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ categories: [] }) });
    });
    await page.route("**/api/safety/**", async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({}) });
    });
  });

  test("types trip idea and sees generating screen", async ({ page }) => {
    await page.goto("/");
    const textarea = page.locator("textarea");
    await expect(textarea).toBeVisible();
    await textarea.fill("Beach vacation in Maui with kids age 4 and 8");
    await page.click("text=Plan it");
    await expect(page.locator("text=Building your trip plan")).toBeVisible({ timeout: 5000 });
    await expect(page.locator("text=Maui, Hawaii")).toBeVisible();
  });
});
```

- [ ] **Step 4: Write generic-input.spec.ts**

```ts
import { test, expect } from "@playwright/test";

test.describe("Generic Input Flow", () => {
  test("shows destination picker for vague input", async ({ page }) => {
    await page.route("**/api/v1/trip/parse-input", async (route) => {
      await route.fulfill({
        status: 200, contentType: "application/json",
        body: JSON.stringify({
          destination: null,
          suggestedDestinations: [
            { name: "Maui, Hawaii", emoji: "🌴", description: "Stunning beaches", season_note: "Perfect spring weather" },
            { name: "Cancun, Mexico", emoji: "🏖", description: "All-inclusive resorts", season_note: "Warm and sunny" },
            { name: "San Diego, CA", emoji: "☀️", description: "Family-friendly coast", season_note: "Mild spring temps" },
          ],
          startDate: "2026-04-12", endDate: "2026-04-19",
          adults: 2, childrenAges: [], vibe: "beach", detectedRegion: null,
        }),
      });
    });

    // Mock the full trip plan for after destination selection
    await page.route("**/api/trip-plan", async (route) => {
      await route.fulfill({
        status: 200, contentType: "application/json",
        body: JSON.stringify({
          destination: "Maui, Hawaii", startDate: "2026-04-12", endDate: "2026-04-19",
          forecast: [{ date: "2026-04-12", high: 76, low: 68, conditions: "Sunny", emoji: "☀️" }],
          dailyItinerary: [{ day: 1, date: "2026-04-12", activities: [{ name: "Beach Day", time: "10:00 AM", description: "Relax", category: "beach", tags: [] }] }],
        }),
      });
    });
    await page.route("**/api/generate", async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ categories: [] }) });
    });
    await page.route("**/api/safety/**", async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({}) });
    });

    await page.goto("/");
    await page.locator("textarea").fill("beach trip for spring break");
    await page.click("text=Plan it");

    // Should show destination picker with 3 options
    await expect(page.locator("text=Maui, Hawaii")).toBeVisible({ timeout: 5000 });
    await expect(page.locator("text=Cancun, Mexico")).toBeVisible();
    await expect(page.locator("text=San Diego, CA")).toBeVisible();

    // Pick a destination
    await page.click("text=Maui, Hawaii");

    // Should continue to generating with progress steps
    await expect(page.locator("text=Building your trip plan")).toBeVisible({ timeout: 5000 });
  });
});
```

- [ ] **Step 5: Write results-mosaic.spec.ts**

```ts
import { test, expect } from "@playwright/test";

const MOCK_TRIP = {
  destination: "Maui, Hawaii", startDate: "2026-04-12", endDate: "2026-04-19",
  forecast: [
    { date: "2026-04-12", high: 76, low: 68, conditions: "Sunny", emoji: "☀️" },
    { date: "2026-04-13", high: 75, low: 67, conditions: "Partly cloudy", emoji: "⛅" },
  ],
  dailyItinerary: [
    { day: 1, date: "2026-04-12", activities: [
      { name: "Road to Hana", time: "9:00 AM", description: "Scenic drive with waterfalls", category: "scenic", tags: ["scenic", "kid-friendly"] },
      { name: "Mama's Fish House", time: "6:30 PM", description: "Iconic oceanfront restaurant", category: "restaurant", tags: ["dinner"] },
    ]},
    { day: 2, date: "2026-04-13", activities: [
      { name: "Snorkeling at Molokini", time: "9:00 AM", description: "Great for kids", category: "water", tags: ["water"] },
    ]},
  ],
};

test.describe("Results Mosaic", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/api/v1/trip/parse-input", async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json",
        body: JSON.stringify({ destination: "Maui, Hawaii", suggestedDestinations: [], startDate: "2026-04-12", endDate: "2026-04-19", adults: 2, childrenAges: [4, 8], vibe: "beach", detectedRegion: null }),
      });
    });
    await page.route("**/api/trip-plan", async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(MOCK_TRIP) });
    });
    await page.route("**/api/generate", async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ categories: [{ name: "Beach", items: [{ name: "Sunscreen" }] }] }) });
    });
    await page.route("**/api/safety/**", async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ state: "HI", rules: [{ age: "under 4", requirement: "rear-facing" }] }) });
    });
    await page.route("**/api/v1/places/enrich", async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json",
        body: JSON.stringify({ placeId: "ChIJ123", name: "Road to Hana", rating: 4.8, userRatingsTotal: 2847, address: "Hana Hwy, Maui, HI", phone: "(808) 984-8109", photos: [], mapsUrl: "https://maps.google.com" }),
      });
    });

    // Navigate through to results
    await page.goto("/");
    await page.locator("textarea").fill("Beach trip to Maui with kids age 4 and 8");
    await page.click("text=Plan it");
  });

  test("renders hero tile with destination and dates", async ({ page }) => {
    await expect(page.locator("text=Maui, Hawaii")).toBeVisible({ timeout: 15000 });
    await expect(page.locator("text=Apr")).toBeVisible();
  });

  test("renders weather tile with forecast", async ({ page }) => {
    await expect(page.locator("text=76")).toBeVisible({ timeout: 15000 });
  });

  test("renders itinerary with day tabs and activities", async ({ page }) => {
    await expect(page.locator("text=Road to Hana")).toBeVisible({ timeout: 15000 });
    await expect(page.locator("text=Mama's Fish House")).toBeVisible();
  });

  test("switches days via day tabs", async ({ page }) => {
    await expect(page.locator("text=Road to Hana")).toBeVisible({ timeout: 15000 });
    await page.click("text=Day 2");
    await expect(page.locator("text=Snorkeling at Molokini")).toBeVisible();
  });

  test("opens activity detail panel on tap", async ({ page }) => {
    await expect(page.locator("text=Road to Hana")).toBeVisible({ timeout: 15000 });
    await page.click("text=Road to Hana");
    // Detail panel should slide in with Places data
    await expect(page.locator("text=Hana Hwy")).toBeVisible({ timeout: 5000 });
  });
});
```

- [ ] **Step 6: Build frontend then run E2E tests**

```bash
cd src/frontend && npm run build
cd ../..
npx playwright test
```

Expected: All 3 specs pass.

- [ ] **Step 7: Commit**

```bash
git add playwright.config.ts tests/e2e/ package.json
git commit -m "test: add Playwright E2E tests — input flow, generic input, results mosaic"
```

---

## Task 16: Final Integration + Deploy

**Files:**
- Run: full test suite
- Deploy: push to main

- [ ] **Step 1: Run all unit tests**

```bash
npm test
```

Expected: All pass.

- [ ] **Step 2: Run Playwright E2E tests**

```bash
npx playwright test
```

Expected: All 3 Tier 1 specs pass.

- [ ] **Step 3: Build production frontend**

```bash
cd src/frontend && npm run build
```

Expected: Clean build, no errors.

- [ ] **Step 4: Test locally end-to-end**

```bash
npm start
```

Open `http://localhost:8080`, walk through the complete flow: input → generating → results. Tap an activity, verify Places data loads.

- [ ] **Step 5: Commit any remaining fixes**

```bash
git add -A
git commit -m "chore: final integration fixes before deploy"
```

- [ ] **Step 6: Push to main for Railway auto-deploy**

```bash
git push origin main
```

- [ ] **Step 7: Verify production**

```bash
curl https://sproutroute-production.up.railway.app/api/health
```

Open production URL in browser. Walk through the demo flow.

---

## Summary — Task Order

| # | Task | Est. | Dependencies |
|---|------|------|-------------|
| 1 | Restore deleted files + verify build | 10m | None |
| 2 | PlacesCache utility | 15m | Task 1 |
| 3 | Google Places enrichment service | 20m | Task 2 |
| 4 | Parse input service | 20m | Task 1 |
| 5 | New backend routes in server.js | 15m | Tasks 3, 4 |
| 6 | Fresh Meadow theme + SVG logo | 20m | Task 1 |
| 7 | Frontend hooks + utils | 20m | Task 6 |
| 8 | Input Screen | 20m | Task 7 |
| 9 | Generating Screen + Destination Picker | 25m | Task 7 |
| 10 | Results Screen + Hero Tile | 20m | Task 7 |
| 11 | Weather + Itinerary + Day Tabs | 30m | Task 10 |
| 12 | Safety Tile | 15m | Task 10 |
| 13 | Activity Detail Panel | 25m | Tasks 11, 3 |
| 14 | App.jsx rewrite + wiring | 25m | Tasks 8–13 |
| 15 | Playwright E2E tests | 30m | Task 14 |
| 16 | Final integration + deploy | 15m | Task 15 |

**Parallelizable**: Tasks 2-4 (all backend, independent). Tasks 8-12 (can be built against mock data). Tasks 6-7 (independent of backend).

**Critical path**: 1 → 6 → 7 → 8 → 9 → 10 → 11 → 13 → 14 → 15 → 16
