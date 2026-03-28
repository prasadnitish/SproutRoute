# SproutRoute — Claude Code Context

This file gives Claude Code all context needed to work on SproutRoute autonomously.
**Always read this first before making any changes.**

---

## Project at a Glance

SproutRoute is an AI-powered family trip planner (React + Express + Claude Haiku) deployed on Railway.
Live: **https://sproutroute-production.up.railway.app**
GitHub: **https://github.com/prasadnitish/SproutRoute** (Railway auto-deploys on push to `main`)

**Current state:** Working web MVP. Building toward iOS + Android launch, international support (CA/UK/AU), and 50-100+ real users.

---

## Architecture Map

```
strollerscout/
├── src/
│   ├── frontend/                        # React 18 + Vite + Tailwind (SPA)
│   │   ├── src/
│   │   │   ├── App.jsx                  ← Minimal: nav + screen router
│   │   │   ├── screens/
│   │   │   │   ├── InputScreen.jsx      ← Single textarea + vibe chips
│   │   │   │   ├── GeneratingScreen.jsx ← Progress steps + destination picker
│   │   │   │   └── ResultsScreen.jsx    ← Tab layout: Plan (mosaic) + Pack
│   │   │   ├── hooks/
│   │   │   │   ├── useTrip.js           ← ORCHESTRATOR: parse → plan → packing/safety/pet/car-seat
│   │   │   │   ├── useGeolocation.js    ← IP-based location detection
│   │   │   │   └── usePlacesEnrich.js   ← Google Places enrichment
│   │   │   ├── components/
│   │   │   │   ├── mosaic/
│   │   │   │   │   ├── HeroTile.jsx         ← Trip summary card
│   │   │   │   │   ├── WeatherTile.jsx       ← Weather forecast
│   │   │   │   │   ├── ItineraryTile.jsx     ← Day-by-day itinerary
│   │   │   │   │   ├── SafetyTile.jsx        ← Safety tips + car seat guidance
│   │   │   │   │   ├── PetSafetyTile.jsx     ← Airline + entry requirements
│   │   │   │   │   ├── MapTile.jsx           ← OpenStreetMap embed
│   │   │   │   │   └── DayRouteMap.jsx       ← Activity route visualization
│   │   │   │   ├── ActivityDetailPanel.jsx  ← Slide-over for activity details
│   │   │   │   ├── PackingChecklist.jsx     ← Packing items + checked state (incl. pet items)
│   │   │   │   └── ResultTabs.jsx           ← Tab component
│   │   │   ├── services/
│   │   │   │   └── api.js               ← All fetch() calls to backend; fetchWithRetry + parseSafeResponse
│   │   │   ├── utils/
│   │   │   │   ├── checklist.js         ← Item ID generation, checked-state helpers
│   │   │   │   ├── storage.js           ← localStorage with TTL
│   │   │   │   └── safeRender.js        ← XSS-safe text rendering
│   │   │   └── index.css                ← Global styles, dark mode, print styles
│   │   ├── tailwind.config.js           ← Color tokens: sprout-green, sprout-dark, warm-white
│   │   └── package.json
│   │
│   ├── backend/                         # Node.js + Express (ESM)
│   │   ├── server.js                    ← EXPRESS ENTRY — routes, CORS, rate limiter, static serving
│   │   ├── services/
│   │   │   ├── weather.js               ← Weather.gov API (US-only for now)
│   │   │   ├── geocoding.js             ← Nominatim (OpenStreetMap) geocoder
│   │   │   ├── tripPlanAI.js            ← AI itinerary generation (pet-aware prompts)
│   │   │   ├── packingListAI.js         ← AI packing list generation (pet packing category)
│   │   │   ├── safetyRules.js           ← Car seat law lookup orchestration
│   │   │   ├── carSeatRules.js          ← US state car seat data (~10 states currently)
│   │   │   ├── petSafety.js             ← Pet travel orchestrator (DI pattern)
│   │   │   ├── petAirlineRules.js       ← Static airline pet policies — 6 carriers
│   │   │   ├── petEntryRules.js         ← International pet entry requirements
│   │   │   ├── travelSafety.js          ← AI-generated safety tips
│   │   │   ├── travelAdvisory.js        ← US State Dept advisories
│   │   │   ├── neighborhoodSafety.js    ← Neighborhood safety data
│   │   │   ├── parseInput.js            ← AI trip input parser
│   │   │   ├── inputSafety.js           ← Prompt injection protection
│   │   │   ├── placesEnrich.js          ← Google Places enrichment
│   │   │   └── itineraryScheduler.js    ← Time slot scheduling
│   │   ├── utils/
│   │   │   ├── sanitize.js              ← Input sanitization
│   │   │   ├── aiClient.js              ← Anthropic API wrapper
│   │   │   ├── affiliateLinks.js        ← Shopping link generation
│   │   │   └── logger.js                ← Structured logging
│   │   └── package.json
│   │
│   └── shared/                          ← (Phase 1) TypeScript contracts package
│       └── types/
│           ├── trip.ts                  ← TripRequest, TripPlan, PackingList, SafetyGuidance
│           └── api.ts                   ← ApiError, CapabilityPayload
│
├── tests/
│   ├── unit/                            ← 24 test files
│   │   ├── sanitize.test.js
│   │   ├── inputSafety.test.js
│   │   ├── parseInput.test.js
│   │   ├── geocoding.test.js
│   │   ├── safetyRules.test.js
│   │   ├── petSafety.test.js
│   │   ├── petAirlineRules.test.js
│   │   ├── petEntryRules.test.js
│   │   ├── travelAdvisory.test.js
│   │   ├── neighborhoodSafety.test.js
│   │   ├── weather.test.js
│   │   ├── tripPlanAI.test.js
│   │   ├── packingListAI.test.js
│   │   ├── placesEnrich.test.js
│   │   ├── aiClient.test.js
│   │   ├── affiliateLinks.test.js
│   │   ├── checklist.test.js
│   │   ├── apiFetch.test.js
│   │   ├── intlSafetyRules.test.js
│   │   ├── placesCache.test.js
│   │   ├── ragTemplates.test.js
│   │   ├── rebrand.test.js
│   │   └── travelMode.test.js
│   ├── integration/
│   │   ├── api.integration.test.js      ← createApp(deps={}) DI pattern
│   │   └── apiV1.contract.test.js       ← /api/v1 contract tests
│   └── e2e/
│       └── tiles/
│           └── packing-tile.spec.ts     ← Playwright
│
├── docs/
│   ├── AI_DELIVERY_PLAYBOOK.md          ← AI coding operating model
│   ├── ai-change-log/                   ← Session logs (append, never delete)
│   └── ARCHITECTURE.md                  ← System overview diagram
│
├── .github/workflows/test.yml           ← CI: npm test + vite build on every push
├── .claude/settings.json                ← Hooks: block .env edits, log changes, Stop gate
├── .claude/skills/                      ← Reusable prompt templates (tdd-feature, etc.)
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

**PreToolUse hook** (in `.claude/settings.json`) will block attempts to edit `package-lock.json` or `.env` files.

---

## Key Data Flows

### Trip Plan Request (web)
```
User types free-text in InputScreen textarea
→ useTrip.submitTrip(text, geolocation)
→ POST /api/v1/trip/parse-input (AI extracts structured data from free text)
→ POST /api/trip-plan (geocode → weather → AI itinerary)
→ Results shown immediately (HeroTile + WeatherTile + ItineraryTile), then background:
  → POST /api/generate (packing list → PackingChecklist)
  → POST /api/safety/travel-tips (AI safety tips → SafetyTile)
  → POST /api/safety/car-seat-check (if children present → SafetyTile)
  → POST /api/v1/safety/pet-travel-check (if pets present → PetSafetyTile)
→ ResultsScreen renders: mosaic tiles (Plan tab) + PackingChecklist (Pack tab)
```

### Pet Travel Data Flow (when pets present)
```
User mentions pets in free-text input
→ POST /api/v1/trip/parse-input (extracts pets from text)
→ Backend derives travelMode from distance + countryCode
→ POST /api/trip-plan (pets injected into AI prompt → pet-friendly itinerary)
→ POST /api/generate (pets → pet packing category per pet)
→ POST /api/v1/safety/pet-travel-check (airline + entry rules for ALL carriers)
→ ResultsScreen renders: ItineraryTile (pet badges) + PackingChecklist (pet items) + PetSafetyTile
```

### API Route Ownership
| Frontend call | Backend route | Service file |
|--------------|---------------|--------------|
| `POST /api/v1/trip/parse-input` | `server.js` | `parseInput.js` + `inputSafety.js` |
| `POST /api/resolve-destination` | `server.js:~line 140` | `geocoding.js` |
| `POST /api/trip-plan` | `server.js:~line 170` | `weather.js` + `tripPlanAI.js` |
| `POST /api/generate` | `server.js:~line 220` | `packingListAI.js` |
| `POST /api/safety/car-seat-check` | `server.js:~line 260` | `safetyRules.js` + `carSeatRules.js` |
| `POST /api/safety/travel-tips` | `server.js` | `travelSafety.js` + `travelAdvisory.js` |
| `POST /api/v1/safety/pet-travel-check` | `server.js` | `petSafety.js` + `petAirlineRules.js` + `petEntryRules.js` |
| `GET /api/health` | `server.js:~line 120` | inline |

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
**Current coverage:** ~60%+ backend unit tests, 0% frontend components; Playwright e2e for packing tile

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

Full plan: `/Users/nitish/.claude/plans/lucky-plotting-acorn.md`

---

## Useful Skills

Skills are in `.claude/skills/` — use them for consistent workflows:

| Skill | When to use |
|-------|------------|
| `tdd-feature.md` | Starting any new feature |
| `add-api-route.md` | Adding a new Express endpoint |
| `add-component.md` | Creating a new React component |
| `add-test.md` | Adding a test for a specific behavior |
| `fix-failing-test.md` | Debugging a failing test |
| `deploy-checklist.md` | Before any production deployment |

---

## Known Issues to Fix (Phase 2 priority order)

1. `carSeatRules.js` — only ~10 US states covered, IL shows "Not found in repo" → need all 50 states
2. Sequential API flow in `useTrip.js` — a bundle endpoint exists but is not used by default; waterfall adds latency
3. Accessibility: `ResultTabs.jsx` tabs lack `role="tablist"` / `role="tab"` ARIA semantics
4. No frontend linting or Playwright tests in CI (`test.yml`) — only `npm test` + `vite build` run
5. No share/export → add `ShareExport` component (Phase 2)
6. Date formatting shows ISO `2026-04-13` → use `date-fns` human format

See full issue list in `/Users/nitish/.claude/plans/lucky-plotting-acorn.md` Phase 2 section.
