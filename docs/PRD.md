# Product Requirements Document: SproutRoute (Web MVP)

**Project Name:** SproutRoute
**Version:** 1.0 (Web MVP)
**Author:** Nitish Prasad
**Date:** February 2026
**Status:** MVP Complete

---

## Executive Summary

SproutRoute is an AI-powered trip planning tool for parents that transforms trip intent into a detailed itinerary and weather-appropriate packing list. This web-based MVP demonstrates API integration, AI orchestration, and product thinking for a TPM portfolio.

---

## Problem Statement

### Current Situation

Parents planning trips with children face decision fatigue when packing:

- **Weather uncertainty** - Don't know what to pack without checking forecasts
- **Activity-specific needs** - Different activities require different gear
- **Forgotten items** - Easy to forget essential items in the rush
- **Shopping overwhelm** - Don't know what to buy if items are missing

### Target Users

- **Primary:** Parents with young children (0-5 years) planning domestic trips
- **Secondary:** Caregivers, grandparents taking kids on trips

### Pain Points

1. Spend 30+ minutes researching weather and making packing lists
2. Forget essential items (rain gear, sun protection, extra clothes)
3. Overpack out of uncertainty
4. Last-minute shopping trips before travel

---

## Goals & Success Metrics

### Primary Goals

1. **Reduce packing planning time** from 30 minutes to 5 minutes
2. **Demonstrate TPM skills** - API integration, AI orchestration, product thinking
3. **Ship a polished prototype** within 1-2 weeks for portfolio

### Success Metrics (MVP)

- **Functional:** User can input trip details and receive AI-generated packing list
- **Technical:** Successfully integrates Weather.gov API and AI packing/itinerary generation
- **UX:** Clear, simple interface that works on desktop and mobile browsers
- **Documentation:** Professional README, architecture docs, learnings

### Non-Goals (Out of Scope for MVP)

- ❌ User authentication (use browser local storage)
- ❌ Database (use local storage or simple file storage)
- ❌ Amazon product integration (complex API, approval required)
- ❌ Natural language date parsing (V2 feature)
- ❌ Mobile app (V2 feature)
- ❌ International weather (Weather.gov is US-only)
- ❌ Social sharing, notifications, premium features

---

## User Stories

### MVP (Minimum Viable Product)

#### Story 1: Trip Intent Input (Natural Language Location)

**As a** parent planning a trip
**I want to** describe my destination in natural language
**So that** the system can suggest concrete places to plan for

**Acceptance Criteria:**

- [ ] User can enter destination in free text (e.g., "Seattle, WA")
- [ ] User can enter intent like "2 hour drive from Seattle"
- [ ] System returns up to 3 nearby destination suggestions
- [ ] User selects a destination to continue
- [ ] Form validation provides helpful error messages

#### Story 2: Weather Forecast Display

**As a** user planning a trip
**I want to** see the weather forecast for my destination
**So that** I know what conditions to pack for

**Acceptance Criteria:**

- [ ] Display 7-day forecast with high/low temperatures
- [ ] Show precipitation probability
- [ ] Display weather conditions (sunny, rainy, cloudy, snowy)
- [ ] Forecast is easy to scan visually
- [ ] Error message if weather unavailable (non-US location)

#### Story 3: AI Itinerary + Packing List Generation

**As a** user
**I want to** receive a detailed itinerary and packing list
**So that** I can plan activities and pack confidently

**Acceptance Criteria:**

- [ ] Itinerary is structured with activities, durations, and tips
- [ ] Packing list generated based on weather + activities + trip duration
- [ ] Items organized by category (Clothing, Toiletries, Gear, Documents, etc.)
- [ ] Each item includes quantity suggestion
- [ ] List includes child-specific items based on ages provided
- [ ] Loading indicator shown while generating (3-5 seconds)
- [ ] AI rationale shown for key items ("Rain jacket - 70% rain chance Wed-Fri")

#### Story 4: Customize Activities + Interactive Checklist

**As a** user
**I want to** customize activities and check off items as I pack
**So that** my list matches what we actually plan to do

**Acceptance Criteria:**

- [ ] User can choose activities from the suggested itinerary
- [ ] Packing list regenerates based on selected activities
- [ ] User can check/uncheck items
- [ ] Progress bar shows completion percentage
- [ ] Checked items visually distinct (strikethrough or faded)
- [ ] Categories can collapse/expand
- [ ] Checklist persists in browser (local storage)
- [ ] "Print List" button for offline reference

#### Story 5: List Persistence

**As a** user
**I want to** return to my packing list later
**So that** I can pack incrementally

**Acceptance Criteria:**

- [ ] Packing list saved to browser local storage
- [ ] List persists across browser sessions (7-day TTL)
- [ ] "Clear List" button to start fresh
- [ ] Last modified date shown

---

## Requirements

### Functional Requirements

1. **FR-1:** System shall resolve a natural-language destination into 1-3 suggested places
2. **FR-2:** System shall accept trip dates (up to 14 days) and children ages
3. **FR-3:** System shall fetch 7-day weather forecast from Weather.gov API
4. **FR-4:** System shall generate a detailed itinerary and packing list using AI API
5. **FR-5:** System shall display packing list with checkboxes for user interaction
6. **FR-6:** System shall save checklist state to browser local storage (7-day TTL)
7. **FR-7:** System shall provide print-friendly version of packing list
8. **FR-8:** System shall provide car seat and booster seat guidance by US jurisdiction, based on child age/weight/height and destination state
9. **FR-9:** System shall store jurisdiction safety rules with source URL, effective date, and data version for traceability
10. **FR-10:** System shall show recommendation rationale with citation links and status tags (`Verified`, `Needs review`, `Unavailable`)
11. **FR-11:** System shall provide graceful fallback behavior when external APIs fail, including cached/stale indicators where applicable
12. **FR-12:** System shall support optional account-based cloud sync for cross-device continuity
13. **FR-13:** System shall support reusable family profiles (children ages/sizes/preferences) to speed repeat trip planning

### Non-Functional Requirements

1. **NFR-1:** Page load time < 2 seconds
2. **NFR-2:** AI packing list generation < 10 seconds
3. **NFR-3:** Responsive design works on mobile browsers (viewport 375px+)
4. **NFR-4:** Accessible (WCAG 2.1 Level AA - keyboard navigation, screen readers)
5. **NFR-5:** Works in Chrome, Safari, Firefox (latest versions)
6. **NFR-6:** Regulatory data freshness checks run at least monthly with auditable change history
7. **NFR-7:** Safety recommendation UI must always display source and "last updated" metadata

### Technical Requirements

- **Frontend:** React (with Vite) or vanilla JavaScript
- **Backend:** Node.js + Express (simple API server)
- **APIs:** Weather.gov API (free, US-only), Anthropic AI API
- **Storage:** Browser local storage for MVP
- **Hosting:** Cloudflare Pages (frontend) + Railway (backend)
- **Security:** Environment variables for API keys, no hardcoded secrets

### Feature Build Status (Repo Evidence: February 2026)

| Feature | Status | Repo Evidence |
| ------ | ------ | ------ |
| Natural-language destination resolution | **Built** | `src/backend/server.js` route `/api/resolve-destination`; `src/backend/services/geocoding.js` parser + suggestions |
| Date + child-age trip input | **Built** | `src/frontend/src/App.jsx` wizard steps (`dates`, `kids`) and validation |
| Weather forecast integration | **Built** | `src/backend/services/weather.js` Weather.gov points + forecast flow |
| AI itinerary generation | **Built** | `src/backend/services/tripPlanAI.js` + `/api/trip-plan` in `src/backend/server.js` |
| AI packing list generation | **Built** | `src/backend/services/packingListAI.js` + `/api/generate` in `src/backend/server.js` |
| Interactive checklist + progress + print | **Built** | `src/frontend/src/components/PackingChecklist.jsx` |
| Local persistence (trip + checked items) | **Built** | `localStorage` usage in `src/frontend/src/App.jsx` and `src/frontend/src/components/PackingChecklist.jsx` |
| Car seat / booster rules by jurisdiction | **Built** | `src/backend/services/safetyRules.js` + `/api/safety/car-seat-check` in `src/backend/server.js`; `src/frontend/src/components/TravelSafetyCard.jsx` |
| Regulatory rules dataset with source/effective-date/version | **Built** | `src/backend/services/safetyLawResearch.js` dataset with `sourceUrl`, `effectiveDate`, and `version` fields |
| Trust layer (citation links + status tags) | **Built** | `TravelSafetyCard.jsx` renders source URL, effective date, and `Verified` / `Needs review` / `Unavailable` status tags |
| API outage fallback with stale-data messaging | **Not built** | Backend caches exist; explicit stale-data UX contract not yet implemented |
| Account + cloud sync | **Not built** | No auth, user model, or server-side persistence layer in repo |
| Family profile memory for repeat trips | **Not built** | No profile entity/storage beyond single-trip localStorage |

---

## User Flow

```text
[Start]
   ↓
[Input Trip Intent]
- Destination (free text)
- Optional natural language (e.g., "2 hour drive from Seattle")
   ↓
[Select Destination Suggestion]
   ↓
[Select Dates + Kids]
- Dates (start/end)
- Number of kids & ages
   ↓
[Click "Generate List"]
   ↓
[Loading State] (3-5 sec)
   ↓
[Display Weather Forecast + Itinerary]
- 7-day forecast
- High/low temps
- Precipitation
   ↓
[Display AI Packing List]
- Categorized items
- Quantity suggestions
- AI reasoning
   ↓
[Optional Activity Customize]
   ↓
[User Interacts]
- Check off items
- Collapse/expand categories
- Print list
   ↓
[List Saved to Local Storage]
   ↓
[Return Later] → Load saved list
```

---

## Wireframes/Mockups

### Screen 1: Trip Intent (Minimal Wizard + Sidebar)

```text
┌──────────────────────────────────────────────────────────────┐
│ SproutRoute                                                 │
│ Smart packing, minus the chaos                                │
├───────────────────────────────┬──────────────────────────────┤
│                               │ Your plan                    │
│  Where do you want to go?     │ Destination: —               │
│  [ 2 hour drive from Seattle ]│ Dates: —                      │
│                               │ Kids: —                       │
│  [ Continue ]                 │ Ages: —                       │
│                               │                               │
└───────────────────────────────┴──────────────────────────────┘
```

### Screen 2: Packing List

```text
┌─────────────────────────────────────┐
│  Trip to Seattle, WA                │
│  May 15-20, 2026 (5 days)          │
├─────────────────────────────────────┤
│  Weather Forecast:                  │
│  Wed: 62°/50° ⛅ 40% rain          │
│  Thu: 58°/48° 🌧️ 70% rain         │
│  Fri: 65°/52° ⛅ 30% rain          │
│  ...                                │
├─────────────────────────────────────┤
│  Packing List (0/23 packed) ▓░░░░   │
│                                     │
│  ▼ Clothing (0/8)                   │
│  ☐ Rain jackets (2) - High rain    │
│  ☐ Long pants (3)                   │
│  ☐ Warm layers (2)                  │
│  ...                                │
│                                     │
│  ▼ Toiletries (0/6)                 │
│  ☐ Diapers (20-25)                  │
│  ☐ Wipes                            │
│  ...                                │
│                                     │
│  [ Print List ]  [ Clear & Restart ]│
└─────────────────────────────────────┘
```

---

## Technical Considerations

### Dependencies

- **Frontend:** React 18+ with Vite
- **Backend:** Express.js
- **APIs:** @anthropic-ai/sdk, Weather.gov REST API
- **Utilities:** dotenv (environment variables)

### API Rate Limits

- **Weather.gov:** No rate limit for reasonable use (recommended: cache for 1 hour)
- **AI API:** Tier-dependent; rate-limited at 30 requests / 15 minutes per IP at the application layer

### Risks & Mitigation

| Risk                         | Impact | Probability | Mitigation                                   |
| ---------------------------- | ------ | ----------- | -------------------------------------------- |
| Weather API unavailable      | High   | Low         | Graceful fallback, cached data, error UI     |
| AI API slow/rate limited     | Medium | Medium      | Loading indicator, timeout after 15 seconds  |
| Non-US location entered      | Medium | High        | Clear error message, suggest US destinations |
| Browser local storage full   | Low    | Low         | Limit storage to 1 trip, clear old data      |

### Open Questions

- [ ] Should we support international locations in V2? (requires different weather API)
- [ ] How many past trips to save in local storage? (Suggest: 1 for MVP)
- [ ] Should we add a "shopping list" feature without Amazon integration? (Simple text export?)

### Technical Design: Car Safety Rules Engine

**Implementation Status:** **Built** — backend service, API endpoint, and frontend UI card shipped in MVP.

#### Goal

Provide trip-specific car seat and booster guidance by US jurisdiction using child age, weight, and height, while showing traceable legal sources and update metadata.

#### Scope (MVP for this subsystem)

- US state-level rules for rear-facing, forward-facing, booster, and seat belt transitions
- Child-level recommendations for each child profile in a trip
- Source-backed output with `sourceUrl`, `effectiveDate`, and `lastUpdated`
- Fallback states when jurisdiction data is unavailable or stale

#### Data Schema

| Entity | Key Fields | Notes |
| ------ | ------ | ------ |
| `safety_rule_set` | `id`, `jurisdictionCode`, `jurisdictionType`, `effectiveDate`, `version`, `status` | One active ruleset per jurisdiction/date window |
| `safety_rule` | `id`, `ruleSetId`, `priority`, `minAgeMonths`, `maxAgeMonths`, `minWeightLb`, `maxWeightLb`, `minHeightIn`, `maxHeightIn`, `requiredRestraint`, `seatPosition`, `text` | Structured condition + plain-language legal text |
| `safety_source` | `id`, `ruleSetId`, `sourceUrl`, `publisher`, `retrievedAt`, `lastVerifiedAt`, `citationSnippet`, `confidence` | Traceability and audit metadata |
| `safety_change_log` | `id`, `jurisdictionCode`, `previousVersion`, `newVersion`, `changeSummary`, `changedAt` | Supports monthly refresh and legal-change monitoring |

`requiredRestraint` enum (initial): `rear_facing`, `forward_facing_harness`, `booster`, `seat_belt`, `not_found`.

#### Ingestion and Refresh Pipeline

1. Maintain a jurisdiction source registry (`state -> official source URL`).
2. Fetch source pages on a scheduled cadence (monthly) and on-demand for reported changes.
3. Parse and normalize legal text into structured thresholds (age/weight/height) plus exceptions.
4. Run validation checks:
   - Required metadata present (`effectiveDate`, `sourceUrl`, `version`)
   - Rule interval sanity (no invalid min/max ranges)
   - Overlap detection for conflicting thresholds within a jurisdiction
5. Publish new ruleset version and append changelog entry.
6. Mark prior version superseded but queryable for audit.

#### API Contract

`POST /api/safety/car-seat-check`

Request:

```json
{
  "jurisdictionCode": "CA",
  "tripDate": "2026-06-15",
  "children": [
    { "id": "child-1", "ageMonths": 30, "weightLb": 30, "heightIn": 36 }
  ]
}
```

Response:

```json
{
  "jurisdictionCode": "CA",
  "ruleSetVersion": "2026.05",
  "lastUpdated": "2026-05-20",
  "status": "Verified",
  "results": [
    {
      "childId": "child-1",
      "requiredRestraint": "forward_facing_harness",
      "seatPosition": "rear_seat_preferred",
      "rationale": "Based on CA thresholds for age/weight/height",
      "sourceUrl": "https://example.state.gov/carseat-law",
      "effectiveDate": "2025-01-01"
    }
  ]
}
```

Error contracts:

- `404` jurisdiction or rules not found -> return status `Unavailable`
- `422` invalid child input (missing age/weight/height)
- `503` upstream/source refresh unavailable -> return last known rules + stale flag when possible

#### UI States

| State | Trigger | User-facing behavior |
| ------ | ------ | ------ |
| `Loading` | Request in progress | Skeleton + "Checking local car seat rules..." |
| `Verified` | Rule match with current source metadata | Show recommendation, rationale, source link, effective date |
| `Needs review` | Rule exists but stale/low-confidence metadata | Show warning banner and prompt to re-check before travel |
| `Unavailable` | No ruleset for jurisdiction or request error | Show "Not found in repo data" style fallback and external resource link |

#### Integration Points

- **Frontend:** `src/frontend/src/components/TravelSafetyCard.jsx` renders in results view below weather/itinerary
- **Backend:** `src/backend/services/safetyRules.js` + `/api/safety/car-seat-check` in `src/backend/server.js`
- **Data:** `src/backend/services/safetyLawResearch.js` versioned safety rules dataset (JSON for MVP, DB in V2)

#### Acceptance Criteria

- 95%+ of valid US state queries return a deterministic recommendation with source metadata
- Every rendered recommendation includes source URL and effective date
- Stale data always displays warning state and timestamp
- API p95 response time <= 500 ms using local rules store

---

## Market & Competitive Landscape (Research Update: February 15, 2026)

### Market Sizing (US-focused for MVP)

#### Evidence-based anchors

- **US population baseline:** 340,110,988 (July 1, 2024 estimate, US Census QuickFacts)
- **Children under 5:** 5.5% of US population (US Census QuickFacts)
- **Estimated children under 5 (derived):** ~18.7 million (`340,110,988 x 5.5%`)
- **Families with own children under 6:** 13.337 million in 2024 (BLS CPS Table 4, annual average)
- **Travel spend context:** US domestic leisure travel spend forecast to reach **$895B** in 2025 (US Travel Association forecast)

#### TAM / SAM / SOM model (planning assumptions)

Because SproutRoute is a pre-trip planning and packing workflow (not a booking engine), this PRD sizes opportunity by **households served**, with a secondary spend context.

- **TAM (households):** 13.337M US families with own children under 6
- **SAM (serviceable digital segment):** 4.7M to 8.0M households
  Assumption: 35% to 60% of TAM are active domestic leisure travelers in a given year and reachable by mobile/web planning tools.
- **SOM (12-24 month target):** 33K to 133K households
  Assumption: 0.25% to 1.0% TAM penetration via organic + partner channels.

#### Monetization scenario framing (for roadmap decisions)

If SproutRoute captures 33K to 133K households, with 1.5 planning cycles per household per year and $3 to $8 blended revenue per cycle (subscription, affiliate, or premium features), modeled annual revenue ranges from roughly **$149K to $1.6M**.

These are planning scenarios, not forecasts; they should be refined after MVP retention and conversion data.

### Top Players (Direct and Adjacent)

| Player | Evidence of Scale | Core Offer | Gap / Takeaway vs SproutRoute |
| ------ | ------ | ------ | ------ |
| **TripIt** | 22M+ users (TripIt 20-year milestone) and 5M+ Android downloads | Itinerary aggregation from booking confirmations | Strong itinerary lock-in; less child-specific packing intelligence |
| **Wanderlog** | 1M+ Android downloads | Collaborative trip planning, maps, route planning | Strong planning collaboration; less focused on weather+kids packing workflow |
| **Roadtrippers** | 38M+ trips planned to date | Road trip routing/discovery; launched AI trip planner | Strong for drive trips and POI discovery; less family-young-kids packing specialization |
| **PackPoint** | 1M+ Android downloads; states 2M+ packing lists created yearly | Weather/activity-based packing lists | Most direct feature overlap; opportunity is richer family context + itinerary linkage |
| **BabyQuip (adjacent)** | 425K+ reservations, 2,000+ cities | Family travel gear rental marketplace | Potential partner/channel rather than pure feature competitor |

### SWOT Analysis: SproutRoute (MVP)

| Category | Details |
| ------ | ------ |
| **Strengths** | Clear niche (parents with children 0-5); combines destination intent, weather, itinerary, and packing in one flow; low-friction web MVP with no account required |
| **Weaknesses** | API dependency risk (Anthropic, Weather.gov, OSM); US-only weather coverage; no cross-device sync/account system in MVP |
| **Opportunities** | Partner integrations (family travel creators, baby gear services); premium family templates and reminders; expansion to international weather providers; B2B2C distribution with travel/hospitality partners |
| **Threats** | Incumbent planner apps adding AI packing; platform changes/rate limits; rising acquisition costs in consumer travel apps; user trust concerns around AI recommendation accuracy |

### SWOT Coverage Backlog (What to Add Next)

| Priority | Addition | Status | Why it covers SWOT gaps |
| ------ | ------ | ------ | ------ |
| **P0** | Jurisdiction-specific car seat and booster rule checker | **Built** | Backend service + API endpoint + TravelSafetyCard UI shipped in MVP |
| **P0** | Regulatory rules data pipeline (source URL + effective date + version) | **Built** | Static ruleset with `sourceUrl`, `effectiveDate`, `version` in `safetyLawResearch.js` |
| **P0** | Safety recommendation transparency (citations, `last updated`, status tags) | **Built** | `TravelSafetyCard.jsx` renders source URL, effective date, and status tags |
| **P1** | Outage/stale-data fallback UX across weather and safety modules | **Not built** | Mitigates API dependency weakness and reliability threats |
| **P1** | Optional account + cloud sync | **Not built** | Closes cross-device weakness and improves retention |
| **P2** | Family profile memory + reusable templates | **Not built** | Increases repeat-use moat and lowers planning friction over time |

---

## Timeline & Milestones

### Week 1: Foundation & Core Features

#### Day 1-2: Setup & Trip Input

- [ ] Project structure setup (React + Express)
- [ ] Environment variables configuration
- [ ] Trip input form with validation
- [ ] Basic styling (mobile-first)

#### Day 3-4: Weather Integration

- [ ] Weather.gov API integration
- [ ] Geocoding (lat/long from city name)
- [ ] Weather display component
- [ ] Error handling

#### Day 5-7: AI Packing List

- [ ] AI API integration
- [ ] Prompt engineering for packing list
- [ ] Display categorized list
- [ ] Interactive checklist (check/uncheck)

### Week 2: Polish & Documentation

#### Day 8-10: Features & Testing

- [ ] Local storage persistence
- [ ] Print functionality
- [ ] Loading states and error handling
- [ ] Cross-browser testing

#### Day 11-12: Documentation

- [ ] README with setup instructions and screenshots
- [ ] ARCHITECTURE.md with system design
- [ ] Security review (no hardcoded keys)
- [ ] Deploy to Cloudflare Pages + Railway

#### Day 13-14: Buffer & Learnings

- [ ] Bug fixes
- [ ] Performance optimization
- [ ] Add "Key Learnings" section to README
- [ ] Update main portfolio README

---

## Appendix

### References

- [Weather.gov API Documentation](https://www.weather.gov/documentation/services-web-api)
- [Anthropic API Documentation](https://docs.anthropic.com/claude/reference/messages_post)
- [US Census QuickFacts: United States](https://www.census.gov/quickfacts/)
- [BLS CPS Table 4 (Families with own children, 2024)](https://www.bls.gov/news.release/famee.t04.htm)
- [US Travel Forecasts (Fall 2025 update)](https://www.ustravel.org/research/travel-forecasts)
- [TripIt 20-year milestone (22M+ users)](https://www.tripit.com/web/blog/news-culture/tripit-turns-20)
- [TripIt on Google Play (5M+ downloads)](https://play.google.com/store/apps/details/?hl=en-US&id=com.tripit)
- [Wanderlog on Google Play (1M+ downloads)](https://play.google.com/store/apps/details?hl=en_US&id=com.wanderlog.android)
- [Roadtrippers About (38M+ trips planned)](https://roadtrippers.com/about/)
- [PackPoint website (2M+ lists/year)](https://www.packpnt.com/)
- [PackPoint on Google Play (1M+ downloads)](https://play.google.com/store/apps/details?hl=en-US&id=com.YRH.PackPoint)
- [BabyQuip FAQs (425K+ reservations; 2,000+ cities)](https://www.babyquip.com/faqs)

### Future Enhancements (V2+)

- Mobile app (React Native as originally planned)
- User accounts and cloud sync
- Amazon product recommendations
- International weather support
- Trip history and templates
- Share packing lists with family
