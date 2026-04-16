# Architecture Documentation: SproutRoute

**Last Updated: April 16, 2026**

## Primary References

- `docs/WEB_CODE_GRAPH.md` — current web-app code path, ownership map, and change-impact guide
- `README.md` — top-level repo entry point and current scope summary

## System Overview

SproutRoute is an **AI-powered family trip planner** that generates personalized itineraries, packing lists, safety guidance, and pet travel requirements from a single free-text input. The system consists of:

- **Frontend (React 18 / Vite / Tailwind):** Single-page application with progressive rendering via SSE
- **Backend (Node.js / Express):** API server orchestrating AI models, external APIs, and database queries
- **Database (Supabase PostgreSQL):** 19 tables with RLS, 15+ migrations -- stores users, profiles, attractions, trip metrics, and feedback
- **AI Pipeline:** Multi-model routing -- GPT-5.4 nano (primary), Claude Haiku 4.5 (fallback), Claude Sonnet 4.6 (offline precompute)
- **Analytics (PostHog):** Full funnel tracking with session recordings and PII masking
- **External APIs:** Visual Crossing (weather), Nominatim/Overpass (geocoding), Google Places (enrichment)

**Architecture Pattern:** Progressive SSE rendering with background follow-up fetches. `useTrip` drives `parse-input -> trip/stream`, the results screen opens on the first destination event, itinerary chunks continue over SSE, and packing/safety/pet checks run non-blocking after first paint.

---

## Component Diagram

```
┌───────────────────────────────────────────────────────────────────┐
│                     User Browser                                  │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │              React Frontend (SPA)                            │ │
│  │                                                              │ │
│  │  Screens:                                                    │ │
│  │    InputScreen.jsx    ← Single textarea + vibe chips         │ │
│  │    GeneratingScreen.jsx ← Progress steps + destination picker│ │
│  │    ResultsScreen.jsx  ← Tab layout: Plan (mosaic) + Pack    │ │
│  │                                                              │ │
│  │  Hooks:                                                      │ │
│  │    useTrip.js         ← ORCHESTRATOR: parse → stream → bg    │ │
│  │    useGeolocation.js  ← GPS first, IP fallback               │ │
│  │    usePlacesEnrich.js ← on-demand Places enrichment          │ │
│  │                                                              │ │
│  │  Mosaic Tiles:                                               │ │
│  │    HeroTile / WeatherTile / ItineraryTile / SafetyTile      │ │
│  │    PetSafetyTile / MapTile / DayRouteMap                    │ │
│  │                                                              │ │
│  │  Other Components:                                           │ │
│  │    PackingChecklist / ActivityDetailPanel                    │ │
│  │    ProfileImportModal / DestinationPicker                    │ │
│  │                                                              │ │
│  │  PostHog Analytics (full funnel + session recordings)        │ │
│  └────────────────┬────────────────────────────────────────────┘ │
└───────────────────┼──────────────────────────────────────────────┘
                    │ HTTP/REST + SSE (streaming)
                    ▼
┌───────────────────────────────────────────────────────────────────┐
│               Backend API Server (Express on Railway)             │
│                                                                   │
│  Core Routes:                                                     │
│    GET  /api/health                                               │
│    POST /api/v1/trip/parse-input        (AI input parsing)        │
│    POST /api/v1/trip/stream             (SSE progressive render)  │
│    POST /api/generate                   (current web packing path) │
│    POST /api/safety/travel-tips         (general safety)          │
│    POST /api/safety/car-seat-check      (car seat guidance)       │
│    POST /api/v1/safety/pet-travel-check (airline + entry reqs)   │
│    POST /api/v1/places/enrich           (lazy activity enrichment)│
│    GET  /api/v1/geo/detect              (IP fallback location)    │
│    POST /api/v1/attractions/rank      (attraction shortlist)      │
│    GET  /api/v1/ops/metrics           (ops dashboard data)        │
│                                                                   │
│  Profile Routes:                                                  │
│    POST /api/v1/profile/import/validate                           │
│    POST /api/v1/profile/import/normalize                          │
│    GET  /api/v1/profile/me                                        │
│    PUT  /api/v1/profile/me                                        │
│    POST /api/v1/profile/me/feedback                               │
│                                                                   │
│  Middleware: CORS, rate limiter, Supabase auth, input sanitization│
│  Ops: /ops dashboard with persistent Supabase metrics             │
└───────┬──────────────┬──────────────┬────────────────────────────┘
        │              │              │
        ▼              ▼              ▼
┌──────────────┐ ┌──────────────┐ ┌─────────────────────────────┐
│ Supabase     │ │ AI Models    │ │ External APIs               │
│ PostgreSQL   │ │              │ │                             │
│              │ │ Primary:     │ │ Visual Crossing (weather)   │
│ 19 tables    │ │  GPT-5.4    │ │ Nominatim (geocoding)       │
│ RLS enabled  │ │  nano       │ │ Google Places (enrichment)  │
│ 15+ migrat.  │ │  $0.003/trip│ │ Overpass (nearby cities)    │
│              │ │              │ │                             │
│ Tables:      │ │ Fallback:   │ │                             │
│  users       │ │  Claude     │ │                             │
│  profiles    │ │  Haiku 4.5  │ │                             │
│  trip_reqs   │ │              │ │                             │
│  cities      │ │ Precompute: │ │                             │
│  city_attr.. │ │  Claude     │ │                             │
│  trip_metrics│ │  Sonnet 4.6 │ │                             │
│  feedback    │ │  (offline)  │ │                             │
│  ...         │ │              │ │                             │
└──────────────┘ └──────────────┘ └─────────────────────────────┘

Attraction Intelligence Layer:
┌──────────────────────────────────────────────────────────────┐
│  1,452+ curated attractions across 66+ cities                │
│                                                              │
│  Offline Precompute (Claude Sonnet 4.6):                     │
│    Wave 1: 15 cities (US major + international) ✓            │
│    Wave 2: 20 cities (expanded US + India + Europe) ✓        │
│    Wave 3: 62 cities (top 100 NA tourist destinations) ◐     │
│                                                              │
│  Runtime Flow:                                               │
│    1. Resolve destination → canonical city                    │
│    2. Load cached attractions from Supabase (up to 20/city)  │
│    3. Rank against trip intent + weather + profile            │
│    4. Inject verified shortlist into AI prompt                │
│    5. Capture new attractions back into storage               │
│                                                              │
│  Freshness Model: fresh / aging / stale / unverified         │
│  Cross-day dedup in scheduler                                │
│  8 PM hard cap for family trips                              │
│  Dinner-only meal recommendations                            │
└──────────────────────────────────────────────────────────────┘

Pet Safety Services:
┌──────────────────────────────────────────────────────────────┐
│  petSafety.js ─── Orchestrator (DI pattern)                  │
│    ├── petAirlineRules.js ── Static airline policies         │
│    │   (Delta, United, AA, Southwest, JetBlue, Alaska)       │
│    ├── petEntryRules.js ──── International entry reqs        │
│    │   (microchip, rabies, quarantine, banned breeds)        │
│    └── AI contextual layer (via aiClient.js)                 │
└──────────────────────────────────────────────────────────────┘

Profile System:
┌──────────────────────────────────────────────────────────────┐
│  Profile import from ChatGPT / Claude / Gemini (paste JSON)  │
│    → Validate → Normalize to internal schema                 │
│    → Review UI with confidence cues                          │
│    → Merge with trip intent (mergeProfileAndIntent)          │
│    → buildPlannerSummary injected into AI prompt             │
│  Auth: Supabase Auth middleware (magic link UI pending)       │
└──────────────────────────────────────────────────────────────┘
```

---

## Data Flow

### Flow 1: Trip Plan Request (Progressive Rendering)

```
User types free-text in `InputScreen`
→ `useTrip.submitTrip(text, geolocation, savedProfile)`

Phase 1 — Parse and enter generating screen:
  → POST `/api/v1/trip/parse-input`
  → parser extracts destination, dates, party, pets, vibe, and ambiguity hints
  → `GeneratingScreen` shows assumption card or `DestinationPicker`

Phase 2 — Main streamed plan path:
  → POST `/api/v1/trip/stream`
  → server geocodes destination, fetches weather, resolves planning context
  → server loads cached attractions and runs `generateTripPlanChunked()`
  → first `destination` SSE event opens `ResultsScreen`
  → `weather` and `itinerary-chunk` events progressively fill `WeatherTile` and `ItineraryTile`

Phase 3 — Non-blocking follow-up requests:
  → POST `/api/generate`                    (current web packing path → `PackingChecklist`)
  → POST `/api/safety/travel-tips`         (`SafetyTile`)
  → POST `/api/safety/car-seat-check`      (if children)
  → POST `/api/v1/safety/pet-travel-check` (if pets → `PetSafetyTile`)
  → per-activity POST `/api/v1/places/enrich` on tap (`ActivityDetailPanel`)
  → attraction capture persists back into storage in the background
```

### Flow 1b: Pet Travel Data Flow (when pets present)

```
User mentions pets in free-text input
→ POST `/api/v1/trip/parse-input` extracts pets from text
→ POST `/api/v1/trip/stream` injects pets into the planning prompt
→ frontend derives `travelMode` from destination distance + country code
→ POST `/api/generate` includes pet packing categories
→ POST `/api/v1/safety/pet-travel-check` checks all supported carriers + entry rules
→ `ResultsScreen` renders:
    `ItineraryTile` (pet-friendly badges on activities)
    `PackingChecklist` (pet items + affiliate shop links)
    `PetSafetyTile` (airline comparison table + entry requirements)
```

### Flow 2: Profile-Aware Planning

```
1. Load cached profile (if signed in)
2. Parse trip input into expanded intent
3. Merge profile + trip intent (mergeProfileAndIntent)
4. Build compact planner summary (buildPlannerSummary, 150-300 tokens)
5. Inject summary into AI itinerary prompt
6. Profile preferences guide but do not override trip-specific constraints
```

### Flow 3: Error Handling

- **Invalid location:** Backend returns 422 with message
- **Weather API down:** Graceful fallback, trip continues without weather
- **AI API timeout:** Frontend shows error after client timeout
- **AI model failure:** Automatic fallback from GPT-5.4 nano to Claude Haiku 4.5
- **Car seat jurisdiction missing:** Returns `status: "Unavailable"` with source link

### Current Learnings From The Web Code Graph

- The real frontend control plane is `src/frontend/src/hooks/useTrip.js`, not `App.jsx`. `App.jsx` is now mostly a shell that wires the main hooks and current screen.
- The default browser hot path is `parse-input -> trip/stream`. Legacy `/api/trip-plan` still exists, but it is no longer the primary web planning route.
- The browser still uses legacy `POST /api/generate` for packing in the background even though `/api/v1/trip/packing` exists. That distinction matters when changing the live web flow.
- `ResultsScreen.jsx` is the current composition hub. Older references to `TripPlanDisplay.jsx` are historical.
- Places enrichment is lazy and user-driven through `usePlacesEnrich`, which keeps the first-render path lighter.
- Profile import is currently localStorage-first in the browser. Auth-backed profile routes exist, but they are not the default import path used by `ProfileImportModal`.

---

## Key Design Decisions

### Decision 1: Multi-Model AI Routing

**Context:** Started with Claude Sonnet ($0.24/trip), then Gemini, now GPT-5.4 nano.

**Current Strategy:**
- **GPT-5.4 nano** (primary runtime): $0.003/trip, best-case 6-16s for simple trips
- **Claude Haiku 4.5** (fallback): Activates on GPT nano failure or timeout
- **Claude Sonnet 4.6** (offline precompute): Rich reasoning for attraction discovery, tagging, and editorial summaries

**Rationale:** Cost dropped from $0.24/trip to $0.003/trip (80x reduction). Latency dropped from 83s baseline to p50 33.7s, avg 38.7s. Per-task model configuration allows optimizing each stage independently.

### Decision 2: Supabase PostgreSQL

**Context:** MVP started with browser localStorage only. Scaled to persistent database for profiles, attractions, and metrics.

**Current State:** 19 tables with RLS, 15+ migrations. Tables include: users, profiles, profile_revisions, profile_imports, trip_requests, trip_feedback, cities, city_attractions, city_attraction_tags, attraction_precompute_runs, attraction_verification_cache, trip_metrics.

**Rationale:** Profile persistence, attraction intelligence layer, and ops metrics all require structured storage. RLS provides row-level security. Supabase Auth middleware supports magic link authentication (UI pending).

### Decision 3: Progressive SSE Rendering

**Context:** Full trip generation takes 30-40s. Users should not wait for everything.

**Strategy:** Results screen renders in ~2s with hero and weather. Itinerary streams in background (~14s on GPT nano). Packing, safety, and pet checks run non-blocking after itinerary.

**Rationale:** Perceived latency drops dramatically. Users see progress immediately rather than a blank loading screen.

### Decision 4: Attraction Intelligence Layer

**Context:** Open-ended AI attraction reasoning was slow, inconsistent, and expensive.

**Strategy:** Offline precompute 1,452+ curated attractions across 66+ cities. At runtime, load cached attractions, rank against trip intent, inject verified shortlist into AI prompt.

**Rationale:** Reduces AI reasoning load, improves consistency, enables cross-day dedup, and supports 8 PM family hard cap and dinner-only meal recommendations.

### Decision 5: Visual Crossing for Weather

**Context:** Weather.gov is US-only. Visual Crossing provides international coverage.

**Decision:** Migrated from Weather.gov to Visual Crossing for unified domestic and international weather data.

### Decision 6: PostHog Analytics

**Context:** Needed full funnel tracking and session recordings to understand user behavior.

**Current State:** Full funnel tracking with session recordings, PII masking enabled. Ops dashboard at /ops shows persistent Supabase metrics.

---

## API Endpoints

### Core Trip Routes

| Method | Path | Service | Description |
|--------|------|---------|-------------|
| GET | `/api/health` | inline | Liveness probe |
| POST | `/api/v1/trip/parse-input` | parseInput.js + inputSafety.js | AI-powered free-text parsing |
| POST | `/api/v1/trip/stream` | tripPlanAI.js + SSE | Progressive streaming trip generation |
| POST | `/api/v1/trip/plan` | weather.js + tripPlanAI.js | Non-streamed v1 itinerary response |
| POST | `/api/v1/trip/bundle` | weather.js + tripPlanAI.js + deterministicPacking.js | Single-call plan + packing response |
| POST | `/api/v1/trip/replan` | tripPlanAI.js | Rebuild itinerary from cached weather |
| POST | `/api/v1/trip/packing` | weather.js + deterministicPacking.js | Dedicated v1 packing generation |
| POST | `/api/generate` | deterministicPacking.js | Current browser packing path |
| POST | `/api/safety/car-seat-check` | safetyRules.js + carSeatRules.js | Jurisdiction car seat guidance |
| POST | `/api/safety/travel-tips` | travelSafety.js + travelAdvisory.js | AI safety tips |
| POST | `/api/v1/safety/pet-travel-check` | petSafety.js | Airline + entry requirements |
| POST | `/api/v1/places/enrich` | placesEnrich.js | Lazy itinerary activity enrichment |
| GET | `/api/v1/geo/detect` | inline proxy logic | IP-based location fallback |

### Attraction Intelligence Routes

| Method | Path | Service | Description |
|--------|------|---------|-------------|
| POST | `/api/v1/attractions/rank` | attractionMemory.js | Rank cached attractions for trip |

### Profile Routes

| Method | Path | Service | Description |
|--------|------|---------|-------------|
| POST | `/api/v1/profile/import/validate` | inline server normalization flow | Validate pasted JSON |
| POST | `/api/v1/profile/import/normalize` | inline server normalization flow | Normalize to internal schema |
| GET | `/api/v1/profile/me` | Supabase profile query | Fetch user profile |
| PUT | `/api/v1/profile/me` | Supabase profile write + revisions | Update profile |
| POST | `/api/v1/profile/me/feedback` | Supabase feedback write | Store feedback signals |

### Ops Routes

| Method | Path | Service | Description |
|--------|------|---------|-------------|
| GET | `/api/v1/ops/metrics` | tripMetrics + Supabase | Ops dashboard data |

---

## Database Schema (Supabase PostgreSQL)

### Tables (19 total)

**User and Profile:**
- `users` -- auth provider, email
- `profiles` -- normalized profile JSON, version, summary
- `profile_revisions` -- non-destructive revision history
- `profile_imports` -- raw import text, normalized result, validation

**Trip:**
- `trip_requests` -- raw input, parsed JSON, profile snapshot
- `trip_feedback` -- signal type (more/less like this, save preference)
- `trip_metrics` -- latency breakdown, model, cost tracking

**Attraction Intelligence:**
- `cities` -- canonical city records, priority tier, lat/lon
- `city_attractions` -- 1,452+ curated attractions with metadata
- `city_attraction_tags` -- tag groups and weights
- `attraction_precompute_runs` -- offline LLM job tracking
- `attraction_verification_cache` -- Places verification results

All tables have RLS (Row Level Security) enabled.

---

## Security

### Completed Security Hardening

- 13 OWASP findings fixed
- 7 race conditions fixed
- CVE patches applied (express-rate-limit, lodash, path-to-regexp)
- RLS on all Supabase tables
- Input sanitization on all endpoints
- PostHog PII masking enabled

### API Key Protection

- AI API keys and Supabase credentials stored in environment variables
- Never exposed to frontend (backend proxy pattern)
- Startup validation: server exits if keys are missing

### Input Validation

- Backend sanitization: all string fields through `sanitizeString`
- Prompt injection protection via `inputSafety.js`
- Rate limiting: 10 AI-intensive requests per 15 minutes per IP; 60 lightweight API requests per 15 minutes per IP
- Request body size limit: 10 KB cap

### AI Prompt Security

- System/user separation: static instructions via `system:` parameter
- Injection marker stripping: `IGNORE PREVIOUS`, `SYSTEM:`, `ASSISTANT:` removed
- Temperature 0 for deterministic structured JSON output

---

## Performance

### Current Latency (Production)

| Metric | Value |
|--------|-------|
| p50 latency | 33.7s |
| Average latency | 38.7s |
| Baseline (before optimizations) | 83s |
| Best case (simple trips, GPT nano) | 6-16s |
| Parse input (GPT-5.4 nano) | ~2.4s |
| Geocode (Nominatim) | ~0.5s |
| Weather (Visual Crossing) | ~0.1s |
| Trip plan AI (GPT nano + shortlist) | ~14s |

### Cost Per Trip

| Model | Cost |
|-------|------|
| GPT-5.4 nano (current) | $0.003/trip |
| Claude Sonnet (previous) | $0.24/trip |
| Reduction | 80x |

### Test Coverage

| Type | Count |
|------|-------|
| Unit tests | 350 |
| Playwright e2e tests | 59 |
| Request errors (sampled) | 0 |

### Caching Strategy

- **Weather data:** In-memory cache, 1 hour TTL
- **Geocoding:** In-memory cache, 6 hour TTL
- **Attractions:** Supabase persistent storage, freshness model (fresh/aging/stale/unverified)
- **AI responses:** Not cached (each trip is unique)

---

## Deployment Architecture

```
┌─────────────────────────────────────────────┐
│              Railway                         │
│  ┌───────────────────────────────────────┐  │
│  │  Node.js Backend + Static Frontend    │  │
│  │  - Express server                     │  │
│  │  - React build served as static files │  │
│  │  - Auto-deploys on push to main       │  │
│  └───────────────┬───────────────────────┘  │
└──────────────────┼──────────────────────────┘
                   │
        ┌──────────┼──────────┐
        ▼          ▼          ▼
┌──────────┐ ┌──────────┐ ┌──────────┐
│ Supabase │ │ PostHog  │ │ External │
│ Postgres │ │ Analytics│ │ APIs     │
│ + Auth   │ │ + Session│ │          │
│          │ │ Recording│ │ GPT-5.4  │
│ 19 tables│ │          │ │ Visual C.│
│ RLS      │ │ PII mask │ │ Nominatim│
│ 15+ migr.│ │          │ │ Google P.│
└──────────┘ └──────────┘ └──────────┘
```

### Environment Variables (Railway)

| Variable | Purpose |
|----------|---------|
| `NODE_ENV` | `production` -- enables static file serving |
| `OPENAI_API_KEY` | GPT-5.4 nano API calls |
| `ANTHROPIC_API_KEY` | Claude fallback + precompute |
| `SUPABASE_URL` | Database connection |
| `SUPABASE_ANON_KEY` | Supabase client auth |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase admin operations |
| `VITE_API_URL` | Baked into Vite build |
| `VITE_POSTHOG_KEY` | PostHog analytics |
| `ALLOWED_ORIGINS` | CORS allowlist |

---

## Technology Stack Summary

| Layer | Technology | Notes |
|-------|-----------|-------|
| Frontend | React 18 + Vite + Tailwind | Progressive SSE rendering |
| Backend | Node.js + Express | Railway auto-deploy |
| Database | Supabase PostgreSQL | 19 tables, RLS, 15+ migrations |
| Auth | Supabase Auth | Magic link planned |
| AI (runtime) | GPT-5.4 nano | $0.003/trip |
| AI (fallback) | Claude Haiku 4.5 | Automatic failover |
| AI (precompute) | Claude Sonnet 4.6 | Offline attraction intelligence |
| Weather | Visual Crossing | Domestic + international |
| Geocoding | Nominatim + Overpass | OpenStreetMap |
| Enrichment | Google Places | Hours, ratings, reviews |
| Analytics | PostHog | Full funnel + session recordings |
| Styling | Tailwind CSS | Responsive, dark mode |
| Testing | Node.js test + Playwright | 350 unit + 59 e2e |

---

## References

- [Railway Deployment](https://docs.railway.app/)
- [Supabase Docs](https://supabase.com/docs)
- [PostHog Docs](https://posthog.com/docs)
- [Visual Crossing API](https://www.visualcrossing.com/resources/documentation/)
- [React Docs](https://react.dev/)
