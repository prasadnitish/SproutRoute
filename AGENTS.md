# SproutRoute — Codex Context

This file gives Codex all context needed to work on SproutRoute autonomously.
**Always read this first before making any changes.**

---

## Project at a Glance

SproutRoute is an AI-powered family trip planner (React + Express + multi-model AI pipeline) deployed on Railway.
Live: **https://sproutroute-production.up.railway.app**
GitHub: **https://github.com/prasadnitish/SproutRoute** (Railway auto-deploys on push to `main`)

**Current state:** Working web MVP. Building toward iOS + Android launch, international support (CA/UK/AU), and 50-100+ real users.

**Primary web reference:** `docs/WEB_CODE_GRAPH.md` — current browser hot path, ownership map, and route graph.

---

## Architecture Map

```
strollerscout/
├── src/
│   ├── frontend/                        # React 18 + Vite + Tailwind (SPA)
│   │   ├── src/
│   │   │   ├── main.jsx                 ← React entry point
│   │   │   ├── App.jsx                  ← App shell: nav + screen routing
│   │   │   ├── hooks/
│   │   │   │   ├── useTrip.js           ← ORCHESTRATOR — parse → stream → background fetches
│   │   │   │   ├── useGeolocation.js    ← GPS first, IP fallback
│   │   │   │   └── usePlacesEnrich.js   ← On-demand Places enrichment
│   │   │   ├── screens/
│   │   │   │   ├── InputScreen.jsx      ← Free-text entry + traveler tags + profile import
│   │   │   │   ├── GeneratingScreen.jsx ← Progress UI + destination picker handoff
│   │   │   │   └── ResultsScreen.jsx    ← Plan/Pack tabs + tile composition hub
│   │   │   ├── components/
│   │   │   │   ├── ProfileImportModal.jsx ← External AI profile import
│   │   │   │   ├── PackingChecklist.jsx   ← Packing items + checked state + custom items
│   │   │   │   ├── ActivityDetailPanel.jsx ← Lazy Places details for tapped activities
│   │   │   │   ├── maps/
│   │   │   │   │   └── PremiumRouteMap.jsx ← Google Maps route/day visualization
│   │   │   │   └── mosaic/
│   │   │   │       ├── HeroTile.jsx
│   │   │   │       ├── WeatherTile.jsx
│   │   │   │       ├── ItineraryTile.jsx
│   │   │   │       ├── SafetyTile.jsx
│   │   │   │       └── PetSafetyTile.jsx
│   │   │   ├── services/
│   │   │   │   └── api.js               ← All fetch() + SSE calls; retry logic lives here
│   │   │   ├── utils/
│   │   │   │   ├── checklist.js         ← Packing item IDs + checked-state helpers
│   │   │   │   └── storage.js           ← Browser persistence helpers
│   │   │   └── index.css                ← Global styles, dark mode, print styles
│   │   ├── tailwind.config.js           ← Color tokens: sprout-green, sprout-dark, warm-white
│   │   └── package.json
│   │
│   ├── backend/                         # Node.js + Express (ESM)
│   │   ├── server.js                    ← EXPRESS ENTRY — routes, CORS, rate limiter, static serving
│   │   ├── services/
│   │   │   ├── weather.js               ← Weather adapter: Visual Crossing + Weather.gov fallback
│   │   │   ├── geocoding.js             ← Nominatim (OpenStreetMap) geocoder
│   │   │   ├── parseInput.js            ← AI free-text trip parser
│   │   │   ├── tripPlanAI.js            ← AI itinerary generation (pet-aware prompts)
│   │   │   ├── deterministicPacking.js  ← Current packing generation path
│   │   │   ├── itineraryScheduler.js    ← Time-slot itinerary scheduling for UI
│   │   │   ├── profileMerge.js          ← Profile + trip intent merge
│   │   │   ├── profileContext.js        ← Planning-summary sanitization
│   │   │   ├── safetyRules.js           ← Car seat law lookup orchestration
│   │   │   ├── travelSafety.js          ← General travel safety guidance
│   │   │   ├── petSafety.js             ← Pet travel orchestrator (DI pattern)
│   │   │   ├── attractionMemory.js      ← Cached attraction candidates + persistence
│   │   │   └── placesEnrich.js          ← Google Places enrichment for itinerary activities
│   │   └── package.json
│   │
│   └── shared/                          ← (Phase 1) TypeScript contracts package
│       └── types/
│           ├── trip.ts                  ← Trip plan / packing / safety contracts
│           ├── api.ts                   ← ApiError, CapabilityPayload, guidance types
│           └── profile.ts               ← Profile import / persistence contracts
│
├── tests/
│   ├── unit/
│   │   ├── sanitize.test.js             ← 3 tests, pure functions
│   │   ├── checklist.test.js            ← 2 tests, item ID helpers
│   │   ├── geocoding.test.js            ← 3 tests, fetch mock + cache reset
│   │   └── safetyRules.test.js          ← 7 tests, DI via researchFn override
│   └── integration/
│       └── api.integration.test.js      ← 6 tests, createApp(deps={}) DI pattern
│
├── docs/
│   ├── AI_DELIVERY_PLAYBOOK.md          ← AI coding operating model
│   ├── ai-change-log/                   ← Session logs (append, never delete)
│   └── ARCHITECTURE.md                  ← System overview diagram
│
├── .github/workflows/test.yml           ← CI: npm test + vite build on every push
├── .Codex/settings.json                ← Hooks: block .env edits, log changes, Stop gate
├── .Codex/skills/                      ← Reusable prompt templates (tdd-feature, etc.)
└── package.json                         ← Root: test runner = `node --test tests/**/*.test.js`
```

---

## Critical Files — Handle with Care

| File | Why critical |
|------|-------------|
| `package-lock.json` | Never edit manually — npm manages this |
| `src/backend/.env` | Never commit — contains API keys |
| `src/frontend/.env*` | Never commit — VITE_API_URL baked at build time |
| `src/backend/server.js` | Core Express config — test before every deploy |
| `src/backend/services/safetyRules.js` | Legal safety guidance — human review required |
| `src/backend/services/carSeatRules.js` | Legal data — human review required for any new state |
| `src/backend/services/petAirlineRules.js` | Airline pet policy data — human review required |
| `src/backend/services/petEntryRules.js` | International pet entry data — human review required |

**PreToolUse hook** (in `.Codex/settings.json`) will block attempts to edit `package-lock.json` or `.env` files.

---

## Key Data Flows

### Trip Plan Request (web)
```
User submits free-text trip from InputScreen
→ App.jsx delegates to useTrip.submitTrip()
→ api.js → POST /api/v1/trip/parse-input
→ useTrip moves to GeneratingScreen
→ api.js → POST /api/v1/trip/stream (SSE)
→ Backend: geocode → weather → planningContext → cached attractions → chunked itinerary
→ First SSE `destination` event opens ResultsScreen immediately
→ Later SSE `weather` + `itinerary-chunk` events fill WeatherTile + ItineraryTile
→ Route-aware trips also render PremiumRouteMap from route stops and active-day activities
→ Background fetches:
   → POST /api/generate                    (current web packing path)
   → POST /api/safety/travel-tips
   → POST /api/safety/car-seat-check       (if children)
   → POST /api/v1/safety/pet-travel-check  (if pets)
→ ResultsScreen renders: HeroTile + PremiumRouteMap + WeatherTile + ItineraryTile + SafetyTile + PetSafetyTile + PackingChecklist
```

### Pet Travel Data Flow (when pets present)
```
User enters trip text with pets or traveler tags in InputScreen
→ api.js → POST /api/v1/trip/parse-input (detects pets from text)
→ api.js → POST /api/v1/trip/stream (pets injected into AI prompt → pet-friendly itinerary)
→ Frontend derives travelMode from origin→destination distance + countryCode
→ api.js → POST /api/generate (pets → pet packing category per pet)
→ api.js → POST /api/v1/safety/pet-travel-check (airline + entry rules for ALL carriers)
→ ResultsScreen renders: ItineraryTile (badges) + PackingChecklist (pet items) + PetSafetyTile
```

### API Route Ownership
| Frontend call | Backend route | Service file |
|--------------|---------------|--------------|
| `POST /api/v1/trip/parse-input` | `server.js` | `parseInput.js` + input sanitization |
| `POST /api/v1/trip/stream` | `server.js` | `geocoding.js` + `weather.js` + `tripPlanAI.js` + `itineraryScheduler.js` |
| `POST /api/generate` | `server.js` | `deterministicPacking.js` |
| `POST /api/safety/travel-tips` | `server.js` | `travelSafety.js` |
| `POST /api/safety/car-seat-check` | `server.js` | `safetyRules.js` + `carSeatRules.js` |
| `POST /api/v1/safety/pet-travel-check` | `server.js` | `petSafety.js` + pet airline/entry data |
| `POST /api/v1/places/enrich` | `server.js` | `placesEnrich.js` |
| `GET /api/v1/geo/detect` | `server.js` | inline IP geolocation proxy |
| `POST /api/v1/profile/import/*` | `server.js` | inline profile validation / normalization |

---

## Commands

```bash
# Run tests (always run before committing)
npm test

# Run a specific test file
node --test tests/unit/geocoding.test.js

# Start dev environment (both frontend + backend)
npm run dev

# Frontend only
npm run dev:frontend

# Backend only
npm run dev:backend

# Build frontend (what Railway runs)
npm run build

# Deploy to Railway (push triggers auto-deploy)
git push origin main

# Watch Railway logs after deploy
railway logs --service SproutRoute --lines 50
```

---

## Test Infrastructure

**Framework:** Node.js `node:test` + `assert/strict` (no external deps)
**Run command:** `npm test` (from project root `strollerscout/`)
**Current coverage:** ~34% backend, 0% frontend components

### Key patterns

```js
// 1. Mocking fetch (used in geocoding.test.js, copy this pattern)
global.fetch = async (url) => ({
  ok: true, status: 200,
  json: async () => ({ /* mock data */ }),
  text: async () => JSON.stringify({ /* mock data */ }),
});

// 2. Dependency injection (used in api.integration.test.js, copy this pattern)
import { createApp } from '../../src/backend/server.js';
const app = createApp({ geocodeDestination: async () => mockResult });

// 3. Cache reset (use in afterEach)
import { __resetGeocodingCachesForTests } from '../../src/backend/services/geocoding.js';
afterEach(() => __resetGeocodingCachesForTests());
```

### TDD workflow (always follow this)

1. **RED** — Write failing test first. Confirm it fails with expected error.
2. **GREEN** — Implement minimum code to make it pass. Run `npm test`.
3. **REFACTOR** — Clean up. Run `npm test` again.
4. **EDGE CASES** — Add more tests. Repeat.

**Never implement before the test exists.**

---

## Deployment

### Railway (SproutRoute app)
- Auto-deploys on every push to `main`
- Railway runs: `npm run build` → `npm start`
- Frontend is served as static files from `src/frontend/dist/`
- **Always run `npm test` locally before pushing to main**

### Cloudflare (portfolio website only)
- `wrangler deploy` from `tpm-portfolio/` root
- NOT related to SproutRoute app code

### Environment Variables (Railway — already set)
| Var | Value | Notes |
|-----|-------|-------|
| `NODE_ENV` | `production` | Enables static file serving |
| `ANTHROPIC_API_KEY` | `sk-ant-...` | AI calls |
| `VITE_API_URL` | `https://sproutroute-production.up.railway.app` | Baked into Vite build |
| `NPM_CONFIG_PRODUCTION` | `false` | Allows devDeps in Railway build |
| `ALLOWED_ORIGINS` | `https://sproutroute-production.up.railway.app,...` | CORS |

---

## Branch Strategy

```
main          → always deployable, Railway auto-deploys
feature/*     → all feature work (e.g. feature/phase2-ux-fixes)
hotfix/*      → urgent production fixes
```

**Never develop directly on `main`.** Always create a feature branch:
```bash
git checkout -b feature/[phase]-[description]
# build + test
git push origin feature/[phase]-[description]
# PR → GitHub Actions → merge → Railway deploys
```

---

## Definition of Done (every feature)

Before marking any feature complete:
- [ ] `npm test` — all tests green (including new tests for this feature)
- [ ] `cd src/frontend && npm run build` — builds without errors
- [ ] No new ESLint errors
- [ ] Accessibility: `aria-label` on new icon buttons, `aria-live` on status regions
- [ ] PostHog events verified (Phase 2+)
- [ ] For safety-related changes: human review of all user-visible text
- [ ] For API changes: update `src/shared/types/` contracts (Phase 1+)
- [ ] `git push` — GitHub Actions CI passes

---

## Phase Reference (current plan)

| Phase | Timeline | Focus |
|-------|----------|-------|
| 0 | Feb 23-27 | Program setup (this setup work) |
| 1 | Mar 2-13 | SproutRoute rebrand + `/api/v1` + shared contracts |
| 2 | Mar 16-27 | All 14 UX fixes + Web reliability release |
| 3 | Mar 30–Apr 17 | Expo React Native (iOS + Android) |
| 3b | Apr 7-10 | iOS 26 native (WeatherKit, Liquid Glass, App Intents) |
| 4 | Apr 20–May 8 | International: Canada, UK, Australia |
| 5 | May 11-22 | App Store + Play Store + Product Hunt launch |

Full plan: `/Users/nitish/.Codex/plans/lucky-plotting-acorn.md`

---

## Useful Skills

Skills are in `.Codex/skills/` — use them for consistent workflows:

| Skill | When to use |
|-------|------------|
| `tdd-feature.md` | Starting any new feature |
| `add-api-route.md` | Adding a new Express endpoint |
| `add-component.md` | Creating a new React component |
| `add-test.md` | Adding a test for a specific behavior |
| `fix-failing-test.md` | Debugging a failing test |
| `deploy-checklist.md` | Before any production deployment |

---

## Current Web Reference Notes

1. The default browser hot path is `useTrip -> /api/v1/trip/parse-input -> /api/v1/trip/stream -> ResultsScreen`.
2. `ResultsScreen.jsx` and the mosaic tiles replaced the older `TripPlanDisplay`-style composition; treat older references as historical.
3. The browser still uses legacy `POST /api/generate` for packing in the live flow even though `/api/v1/trip/packing` exists.
4. `ProfileImportModal` is localStorage-first today; auth-backed profile routes exist but are not the default browser import path.
5. For the current code map and route graph, read `docs/WEB_CODE_GRAPH.md` after this file.
