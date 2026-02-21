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
│   │   │   ├── App.jsx                  ← ORCHESTRATOR — wizard state, API calls, layout
│   │   │   ├── components/
│   │   │   │   ├── TripPlanDisplay.jsx  ← Itinerary + activity customization
│   │   │   │   ├── PackingChecklist.jsx ← Packing items + checked state
│   │   │   │   ├── TravelSafetyCard.jsx ← Car seat guidance display
│   │   │   │   ├── WeatherDisplay.jsx   ← Weather forecast cards
│   │   │   │   └── ShareExport.jsx      ← (Phase 2) Share/copy/print
│   │   │   ├── services/
│   │   │   │   └── api.js               ← All fetch() calls to backend; retry logic here
│   │   │   ├── utils/
│   │   │   │   └── checklist.js         ← Item ID generation, checked-state helpers
│   │   │   └── index.css                ← Global styles, dark mode, print styles
│   │   ├── tailwind.config.js           ← Color tokens: sprout-green, sprout-dark, warm-white
│   │   └── package.json
│   │
│   ├── backend/                         # Node.js + Express (ESM)
│   │   ├── server.js                    ← EXPRESS ENTRY — routes, CORS, rate limiter, static serving
│   │   ├── services/
│   │   │   ├── weather.js               ← Weather.gov API (US-only for now)
│   │   │   ├── geocoding.js             ← Nominatim (OpenStreetMap) geocoder
│   │   │   ├── tripPlanAI.js            ← AI itinerary generation
│   │   │   ├── packingListAI.js         ← AI packing list generation
│   │   │   ├── safetyRules.js           ← Car seat law lookup orchestration
│   │   │   └── carSeatRules.js          ← US state car seat data (~10 states currently)
│   │   └── package.json
│   │
│   └── shared/                          ← (Phase 1) TypeScript contracts package
│       └── types/
│           ├── trip.ts                  ← TripRequest, TripPlan, PackingList, SafetyGuidance
│           └── api.ts                   ← ApiError, CapabilityPayload
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

**PreToolUse hook** (in `.claude/settings.json`) will block attempts to edit `package-lock.json` or `.env` files.

---

## Key Data Flows

### Trip Plan Request (web)
```
User submits wizard
→ App.jsx calls api.js → POST /api/resolve-destination
→ api.js → POST /api/trip-plan (weather + AI itinerary)
→ api.js → POST /api/generate (packing list)
→ api.js → POST /api/safety/car-seat-check
→ App.jsx renders: TripPlanDisplay + PackingChecklist + TravelSafetyCard
```

### API Route Ownership
| Frontend call | Backend route | Service file |
|--------------|---------------|--------------|
| `POST /api/resolve-destination` | `server.js:~line 140` | `geocoding.js` |
| `POST /api/trip-plan` | `server.js:~line 170` | `weather.js` + `tripPlanAI.js` |
| `POST /api/generate` | `server.js:~line 220` | `packingListAI.js` |
| `POST /api/safety/car-seat-check` | `server.js:~line 260` | `safetyRules.js` + `carSeatRules.js` |
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

1. `TripPlanDisplay.jsx:10` — `isItineraryOpen` defaults to `false` → should be `true`
2. `api.js:56-58` — `response.json()` crashes on HTML 502 errors → needs try/catch + fallback
3. No retry logic in `api.js` → add `fetchWithRetry` with exponential backoff
4. `carSeatRules.js` — only ~10 US states, IL shows "Not found in repo" → need all 50 states
5. No share/export → add `ShareExport.jsx` component
6. Date formatting shows ISO `2026-04-13` → use `date-fns` human format
7. Activity cards render BELOW itinerary in `TripPlanDisplay.jsx` → move ABOVE
8. `PackingChecklist.jsx:139-143` — item IDs are position-based → use content hash

See full issue list in `/Users/nitish/.claude/plans/lucky-plotting-acorn.md` Phase 2 section.
