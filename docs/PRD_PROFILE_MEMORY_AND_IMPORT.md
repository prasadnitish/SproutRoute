# Claude Code Implementation Brief: Profile Memory, AI Import, Personalized Planning, and Attraction Intelligence

**Last Updated: April 2, 2026**

**Project Name:** SproutRoute
**Feature Area:** Profiles, accounts, persistent memory, richer parsing, faster personalized trip generation
**Version:** 3.0
**Author:** Codex implementation brief
**Date:** March 29, 2026 (originally); updated April 2, 2026
**Status:** Implemented -- see Current Status section below

---

## Current Status (as of April 2, 2026)

All phases (0-7) have been implemented and are live in production:

- **Database:** 19 tables in Supabase PostgreSQL with RLS enabled, 15+ migrations applied
- **Auth middleware:** Supabase Auth middleware built and integrated (magic link UI pending)
- **Profile import:** Validate + normalize + review UI live. Supports paste from ChatGPT, Claude, and Gemini.
- **Profile merge:** mergeProfileAndIntent + buildPlannerSummary live. Compact planner summary (150-300 tokens) injected into AI prompts.
- **Expanded parsing:** Rich trip intent schema with extraContext preservation
- **Attraction intelligence:** 1,452+ curated attractions across 66+ cities. Wave 1 and Wave 2 complete; Wave 3 in progress.
- **Feedback endpoint:** Live -- captures preference signals (more/less like this, save as preference)
- **Model journey:** Started with Claude Sonnet ($0.24/trip, ~83s) -> Gemini 3 Flash (as planned in this PRD) -> GPT-5.4 nano (current primary, $0.003/trip, p50 33.7s). Claude Haiku 4.5 serves as automatic fallback. Claude Sonnet 4.6 used for offline attraction precompute.
- **Observability:** PostHog full funnel tracking + session recordings. Ops dashboard at /ops with persistent Supabase metrics.
- **Testing:** 350 unit tests, 59 Playwright e2e tests, 0 request errors in sampled window
- **Security:** 13 OWASP findings fixed, 7 race conditions fixed, CVE patches applied, RLS on all tables, input sanitization on all endpoints, PostHog PII masking enabled

---

## 1. Objective

Turn SproutRoute from a single-trip planner into a memory-driven family travel planner that:

- lets users create a profile by pasting JSON from ChatGPT, Claude, Gemini, or another LLM
- persists profiles across devices using accounts and a database
- preserves rich trip intent instead of dropping extra context during parsing
- uses saved profile memory during itinerary and packing generation
- reduces live planning latency by moving attraction discovery and tagging into an offline precompute layer
- migrates the performance-sensitive runtime generation path to Gemini 3 Flash

This brief is sequenced for implementation, not ideation.

---

## 2. Product Decisions Already Made

Claude Code should treat the following as locked unless implementation reveals a hard blocker.

### Core Product Decisions

- We want persistent user accounts and a database
- Profile creation should be low-friction and should not rely on a long questionnaire
- Users should be able to import profile JSON from external LLMs
- The parser must preserve extra trip context instead of silently dropping it
- Saved profile memory should be merged into trip generation
- SproutRoute should build a proprietary attraction intelligence layer using offline LLM precompute

### Performance Decisions

- Runtime itinerary generation is the primary latency bottleneck
- Personalization must not meaningfully degrade the live trip flow
- Slow models should be used offline for attraction precompute, not on the hot path
- Runtime model strategy should move to Google Gemini 3 Flash

### Model Decision (Updated April 2, 2026)

- Original plan: `gemini-3.1-flash-live-preview` (implemented, then superseded)
- **Current primary runtime model:** GPT-5.4 nano ($0.003/trip)
- **Automatic fallback:** Claude Haiku 4.5
- **Offline precompute:** Claude Sonnet 4.6 (attraction intelligence)
- Per-task model configuration is used instead of one global model
- Model journey: Claude Sonnet -> Gemini 3 Flash -> GPT-5.4 nano

---

## 3. Success Criteria

### User Outcomes

- A new user can create a useful travel profile in under 2 minutes
- A returning user can start a new trip with their preferences already applied
- Personalized plans visibly reflect family taste, pace, and constraints

### Technical Outcomes

- First itinerary render within the defined latency budget
- Profile import works across major LLMs
- Expanded parse no longer drops meaningful trip context
- Attraction intelligence reduces open-ended runtime reasoning

### Launch Criteria

- Profile import, persistence, and editing work end-to-end
- Trip generation uses profile + trip intent + verified attraction candidates
- Gemini 3 Flash is production-ready behind fallback
- Timings and benchmarks are instrumented

---

## 4. Latency Budget and Performance Guardrails

Claude Code must build to this budget.

### User-Facing Targets

| Stage | Budget p50 | Budget p95 | Blocking |
| ------ | ------ | ------ | ------ |
| Auth or session restore | <= 100ms | <= 250ms | No |
| Profile fetch | <= 150ms | <= 400ms | No, prefetch |
| Submit overhead | <= 100ms | <= 250ms | Yes |
| Parse input | <= 1.5s | <= 3s | Yes |
| Geocode | <= 500ms | <= 1.5s | Yes |
| Weather | <= 500ms | <= 1.5s | Yes |
| Profile merge and summary build | <= 20ms | <= 50ms | Yes |
| Itinerary AI | <= 6s | <= 10s | Yes |
| Packing AI | <= 4s | <= 8s | No, parallel or background |
| First itinerary render | <= 8s | <= 12s | Yes |
| Full core trip result | <= 10s | <= 15s | Yes |
| Safety enrichment | <= 2s | <= 6s | No |
| Trip save and feedback write | <= 100ms | <= 300ms | No, async only |

### Hard Caps

- Added hot-path latency from accounts and profile memory must stay under `500ms`
- Added prompt overhead from profile memory must stay under `500` input tokens for itinerary generation
- Expanded parsing must not add more than `1s` beyond the current parse stage
- Time to first itinerary render must stay under `12s`
- Full core trip generation must stay under `15s`

### Prompt Budget Rules

- Never inject full raw profile JSON into itinerary or packing prompts
- Build a compact planner summary instead
- Profile summary target: `150-300` tokens, hard cap `500`
- Trip-specific parsed intent target: `200-400` tokens
- Combined personalization overhead for itinerary prompts must stay under `700` tokens

### Off-Critical-Path Work

These must never block first itinerary render:

- saving trip history
- saving profile revisions
- saving feedback signals
- safety enrichment
- pet safety enrichment
- analytics events

---

## 5. Required Implementation Sequence

Claude Code should implement in this order.

### Phase 0: Observability and Hot-Path Fixes

Goal: make performance measurable before deeper architectural work.

Deliverables:

- add timings instrumentation for parse, geocode, weather, merge, itinerary, packing, and total
- update stream orchestration so itinerary emits as soon as it is ready
- preserve packing as parallel or background work
- log p50 and p95 timings by stage

Definition of done:

- streaming route no longer waits for packing before emitting itinerary
- benchmark logs clearly show end-to-end timing breakdown

### Phase 1: AI Provider Refactor and Gemini Runtime Path

Goal: move the hot path to Gemini 3 Flash safely.

Deliverables:

- add Gemini as a first-class provider in the backend AI client abstraction
- support per-task model selection
- configure parse-input, trip-plan, and packing-list to use `gemini-3.1-flash-live-preview`
- keep Anthropic fallback available
- add structured output handling for Gemini where possible

Definition of done:

- all three AI tasks can run on Gemini
- fallback path works
- latency and JSON validity are benchmarked

### Phase 2: Shared Contracts and Internal Schema

Goal: establish durable shared types before building storage and UI.

Deliverables:

- add shared TypeScript contracts for:
  - user travel profile
  - profile import payloads
  - profile normalization results
  - expanded parsed trip intent
  - attraction intelligence entities
- keep external LLM import shape separate from internal normalized profile shape

Definition of done:

- shared contracts exist in `src/shared/types/`
- backend and frontend can rely on the same shapes

### Phase 3: Database and Auth Foundation

Goal: make profile memory durable.

Deliverables:

- add database integration
- add lightweight auth
- support local draft profile before signup
- attach local draft to account after sign-in
- add persistence for profiles, revisions, imports, trip requests, and feedback

Definition of done:

- signed-in users can create, load, update, and delete a profile
- unsigned users can still try import locally

### Phase 4: Profile Import Flow

Goal: make profile creation extremely easy.

Deliverables:

- build `Import from AI` entry point
- provide provider-neutral copyable prompt
- validate pasted JSON
- normalize import into internal schema
- show lightweight review UI with confidence cues
- save locally or to account

Definition of done:

- user can paste JSON from an external LLM and get a usable profile

### Phase 5: Rich Parsing and Merge Logic

Goal: stop dropping trip context and combine profile defaults with current trip intent.

Deliverables:

- expand parse schema
- preserve `extraContext`
- classify hard constraints vs soft preferences
- merge saved profile and current trip request using deterministic precedence
- create compact profile summary for planner prompts

Definition of done:

- trip generation receives structured profile-aware context
- extra user intent is preserved instead of lost

### Phase 6: Precomputed Attraction Intelligence Layer

Goal: move slow attraction reasoning offline.

Deliverables:

- add city and attraction tables
- add offline precompute pipeline using slower richer LLMs
- resolve attractions to canonical place IDs
- add ranking and verification endpoints
- pass verified candidate shortlist into itinerary generation

Definition of done:

- supported cities use ranked verified attraction candidates instead of fully open-ended city prompting

### Phase 7: Feedback and Learning

Goal: make the app improve over time.

Deliverables:

- add `more like this`, `less like this`, and `save as future preference`
- store feedback signals
- support profile revisions and non-destructive learning

Definition of done:

- user feedback is captured and can influence future profile updates

### Week-by-Week Execution Plan

Claude Code should use this as the default 3-week execution plan.

#### Week 1: Runtime Performance and Foundation

Goal: stabilize the hot path and make the new architecture measurable.

Build this week:

- Phase 0: observability and stream fix
- Phase 1: Gemini provider integration
- Phase 2: shared contracts

Expected deliverables:

- timings instrumentation for parse, geocode, weather, merge, itinerary, packing, total
- itinerary emitted before packing completes
- Gemini provider added with per-task configuration and Anthropic fallback
- shared profile, trip-intent, and attraction types added

Week 1 exit criteria:

- end-to-end timings are visible in logs
- Gemini can run parse, itinerary, and packing in development
- no contract ambiguity remains for profile and attraction data

#### Week 2: Persistence, Auth, and Profile Import

Goal: make profile memory real and usable.

Build this week:

- Phase 3: database and auth foundation
- Phase 4: profile import flow
- initial Phase 5: parse schema expansion and merge logic

Expected deliverables:

- DB migrations applied
- auth flow working
- profile CRUD endpoints working
- import validate and normalize endpoints working
- frontend import and review flow working
- local draft profile can be attached to a new account
- expanded parsed trip intent available in backend contracts

Week 2 exit criteria:

- a user can import and save a profile end-to-end
- signed-in users can reload saved profile
- trip parsing preserves `extraContext`

#### Week 3: Attraction Intelligence and Feedback Loop

Goal: improve personalization quality and reduce live reasoning load.

Build this week:

- Phase 6: precomputed attraction intelligence layer
- Phase 7: feedback and learning
- production benchmarks and polish

Expected deliverables:

- city and attraction tables working
- precompute job for a small seed set of cities
- attraction ranking and verification endpoints working
- itinerary generation uses verified shortlist when available
- feedback endpoints and UI hooks working
- benchmark report for Gemini latency, JSON validity, and itinerary quality

Week 3 exit criteria:

- supported cities use verified ranked attraction candidates
- profile-aware generation stays within latency budget
- the full loop works:
  - import profile
  - save profile
  - plan with memory
  - use verified city shortlist
  - collect feedback
  - store learning signals

---

## 6. Architecture Decisions

### Auth

Preferred order:

1. magic link
2. Google
3. Apple

Requirements:

- users can try import before signup
- sign-in is required for cross-device persistence
- local draft profile must be attachable to a new account

### Database

Use PostgreSQL with JSONB-friendly storage patterns.

Why:

- user/profile/trip/feedback relationships are relational
- imported and normalized profile payloads benefit from JSONB
- attraction intelligence needs structured querying plus flexible metadata

### Runtime Model Strategy

- `parse-input`: Gemini 3 Flash
- `trip-plan`: Gemini 3 Flash
- `packing-list`: Gemini 3 Flash
- fallback: existing Anthropic path

### Offline Model Strategy (Updated April 2, 2026)

Claude Sonnet 4.6 is used for attraction precompute only (offline). 1,452+ attractions across 66+ cities have been precomputed.

Offline uses (all implemented):

- attraction discovery
- attraction tagging
- editorial summaries
- age-suitability reasoning
- family-fit clustering

---

## 7. Data Contracts

### Internal Profile Schema

Implement a normalized profile schema in `src/shared/types/`.

```ts
export type Confidence = "high" | "medium" | "low";
export type SourceBasis = "memory" | "chat_context" | "inference" | "user_edit" | "explicit_trip_input";

export interface ProfileSectionMeta {
  confidence: Confidence;
  sourceBasis: SourceBasis[];
  summary?: string;
  updatedAt: string;
}

export interface FoodProfile {
  cuisinesLiked: string[];
  cuisinesDisliked: string[];
  dietaryRestrictions: string[];
  kidFoods: string[];
  foodAdventurousness: "low" | "medium" | "high" | "unknown";
  notes: string;
  meta: ProfileSectionMeta;
}

export interface TravelStyleProfile {
  pace: "slow" | "moderate" | "fast" | "unknown";
  planningStyle: "structured" | "flexible" | "spontaneous" | "unknown";
  accommodationPreference: string;
  transportPreference: string;
  notes: string;
  meta: ProfileSectionMeta;
}

export interface ActivityProfile {
  preferredActivities: string[];
  dislikedActivities: string[];
  activityIntensity: "relaxed" | "moderate" | "active" | "unknown";
  notes: string;
  meta: ProfileSectionMeta;
}

export interface PersonalityTravelProfile {
  travelerType: string;
  noveltyVsComfort: 1 | 2 | 3 | 4 | 5 | null;
  crowdTolerance: "low" | "medium" | "high" | "unknown";
  notes: string;
  meta: ProfileSectionMeta;
}

export interface FamilyContextProfile {
  travelingWith: string;
  kidsDetails: string;
  kidPreferences: string;
  petContext?: string;
  notes: string;
  meta: ProfileSectionMeta;
}

export interface ConstraintProfile {
  budgetRange: string;
  timeConstraints: string;
  accessibilityNeeds: string;
  notes: string;
  meta: ProfileSectionMeta;
}

export interface TripPriorityProfile {
  mustHaves: string[];
  avoidances: string[];
  notes: string;
  meta: ProfileSectionMeta;
}

export interface UserTravelProfile {
  id: string;
  userId: string;
  version: number;
  food: FoodProfile;
  travelStyle: TravelStyleProfile;
  activities: ActivityProfile;
  personality: PersonalityTravelProfile;
  family: FamilyContextProfile;
  constraints: ConstraintProfile;
  priorities: TripPriorityProfile;
  profileSummary: string;
  unknowns: string[];
  createdAt: string;
  updatedAt: string;
}
```

### Expanded Trip Intent Schema

Replace the narrow parse shape with:

```ts
export interface ParsedTripIntent {
  destination: string | null;
  suggestedDestinations: Array<{ name: string; emoji?: string; description?: string; seasonNote?: string }>;
  startDate: string | null;
  endDate: string | null;
  adults: number;
  childrenAges: number[];
  pets: Array<{ type: string; breed?: string | null; ageMonths?: number | null; weightLb?: number | null; name?: string | null }>;
  vibe: string;
  foodPreferences: {
    dietary: string[];
    cuisines: string[];
    avoidances: string[];
    kidFoods: string[];
    budget: string | null;
  };
  tripGoals: string[];
  mustHaves: string[];
  avoidances: string[];
  accommodationPreferences: string[];
  transportPreferences: string[];
  pacePreference: "slow" | "moderate" | "fast" | "unknown";
  budgetSignals: string[];
  accessibilityNeeds: string[];
  scheduleConstraints: string[];
  celebrationContext: string | null;
  specialNotes: string[];
  extraContext: string[];
  unresolvedQuestions: string[];
  detectedRegion?: string | null;
}
```

Critical rule:

- anything useful that does not map cleanly must still be preserved in `extraContext`

---

## 8. Merge Rules

Apply merge precedence in this order:

1. safety and legal constraints
2. explicit trip request hard constraints
3. explicit trip request soft preferences
4. saved profile high-confidence fields
5. saved profile medium-confidence fields
6. saved profile low-confidence fields
7. model inference from destination, weather, and activity context

Operational rules:

- trip-specific constraints override profile defaults
- avoidances are stronger than preferences
- low-confidence profile data should guide suggestions, not enforce them
- planner prompts should use compact summaries, not full profile documents

---

## 9. Database Schema

Use PostgreSQL. Implement migrations for the following tables.

### Exact Migration Filenames

Claude Code should create the migrations in this exact order under a new backend migration directory, for example `src/backend/db/migrations/`.

1. `20260329_001_create_users.sql`
2. `20260329_002_create_profiles.sql`
3. `20260329_003_create_profile_revisions.sql`
4. `20260329_004_create_profile_imports.sql`
5. `20260329_005_create_trip_requests.sql`
6. `20260329_006_create_trip_feedback.sql`
7. `20260329_007_create_cities.sql`
8. `20260329_008_create_city_attractions.sql`
9. `20260329_009_create_city_attraction_tags.sql`
10. `20260329_010_create_attraction_precompute_runs.sql`
11. `20260329_011_create_attraction_verification_cache.sql`
12. `20260329_012_add_profile_indexes.sql`
13. `20260329_013_add_attraction_indexes.sql`
14. `20260329_014_add_foreign_keys_and_constraints.sql`

### Core User and Profile Tables

#### `users`

- `id`
- `email`
- `auth_provider`
- `created_at`
- `updated_at`

#### `profiles`

- `id`
- `user_id`
- `version`
- `profile_json`
- `profile_summary`
- `source`
- `created_at`
- `updated_at`

#### `profile_revisions`

- `id`
- `profile_id`
- `version`
- `change_source`
- `change_summary`
- `profile_json`
- `created_at`

#### `profile_imports`

- `id`
- `user_id`
- `provider_hint`
- `raw_import_text`
- `normalized_profile_json`
- `validation_result_json`
- `created_at`

#### `trip_requests`

- `id`
- `user_id`
- `raw_input`
- `parsed_trip_json`
- `resolved_profile_snapshot_json`
- `created_at`

#### `trip_feedback`

- `id`
- `user_id`
- `trip_request_id`
- `signal_type`
- `payload_json`
- `created_at`

### Attraction Intelligence Tables

#### `cities`

- `id`
- `country_code`
- `region_code`
- `city_name`
- `display_name`
- `lat`
- `lon`
- `priority_tier`
- `created_at`
- `updated_at`

#### `city_attractions`

- `id`
- `city_id`
- `canonical_name`
- `short_summary`
- `category`
- `subcategories_json`
- `age_bands_json`
- `indoor_outdoor`
- `duration_bucket`
- `pace_fit`
- `crowd_level`
- `budget_tier`
- `stroller_friendly`
- `rainy_day_fit`
- `parent_appeal_score`
- `kid_appeal_score`
- `pet_friendly`
- `booking_needed`
- `confidence_score`
- `llm_notes`
- `google_place_id`
- `last_verified_at`
- `verification_status`
- `created_at`
- `updated_at`

#### `city_attraction_tags`

- `id`
- `attraction_id`
- `tag`
- `tag_group`
- `weight`
- `created_at`

#### `attraction_precompute_runs`

- `id`
- `city_id`
- `model_provider`
- `model_name`
- `prompt_version`
- `run_status`
- `input_snapshot_json`
- `output_snapshot_json`
- `started_at`
- `completed_at`

#### `attraction_verification_cache`

- `id`
- `attraction_id`
- `provider`
- `verification_payload_json`
- `verified_at`
- `expires_at`

Storage rules:

- normalized profile JSON is the source of truth
- raw import text should only be retained if privacy policy allows it
- prefer revision history over destructive overwrite

---

## 10. API Surface

All new endpoints should live under `/api/v1`.

### Profile APIs

- `POST /api/v1/profile/import/validate`
- `POST /api/v1/profile/import/normalize`
- `GET /api/v1/profile/me`
- `PUT /api/v1/profile/me`
- `DELETE /api/v1/profile/me`
- `POST /api/v1/profile/me/feedback`

### Trip APIs

- `POST /api/v1/trip/parse-input`
  - expanded schema
  - preserve `extraContext`
- `POST /api/v1/trip/stream`
  - accept optional `profileId` or profile snapshot
- `POST /api/v1/trip/bundle`
  - accept optional `profileId` or profile snapshot

### Attraction Intelligence APIs

- `POST /api/v1/attractions/rank`
- `POST /api/v1/attractions/verify`
- `GET /api/v1/attractions/city/:cityId`
- `POST /api/v1/admin/attractions/precompute`
- `POST /api/v1/admin/attractions/resolve-place-ids`
- `POST /api/v1/admin/attractions/reverify`

Behavior rules:

- profile APIs require auth except validation of a pasted import draft
- trip APIs must work with or without profile
- attraction ranking must use precomputed data when available and gracefully fall back when absent

### Exact API Request and Response Examples

#### `POST /api/v1/profile/import/validate`

Request:

```json
{
  "providerHint": "chatgpt",
  "rawText": "{ \"food_preferences\": { \"cuisines_liked\": [\"mexican\"], \"confidence\": \"medium\" } }"
}
```

Response:

```json
{
  "valid": true,
  "errors": [],
  "warnings": [
    "Missing sections were filled with defaults during validation preview."
  ],
  "detectedFormat": "external_profile_v1"
}
```

#### `POST /api/v1/profile/import/normalize`

Request:

```json
{
  "providerHint": "chatgpt",
  "rawText": "{ \"food_preferences\": { \"cuisines_liked\": [\"mexican\", \"japanese\"], \"dietary_restrictions\": [], \"food_adventurousness\": \"medium\", \"notes\": \"Likes familiar favorites plus sushi\", \"confidence\": \"medium\", \"source_basis\": [\"memory\", \"inference\"] }, \"travel_style\": { \"pace\": \"moderate\", \"planning_style\": \"structured\", \"accommodation_preference\": \"family-friendly hotels\", \"transport_preference\": \"walkable areas and short drives\", \"notes\": \"Prefers predictable days\", \"confidence\": \"medium\", \"source_basis\": [\"memory\"] }, \"activity_preferences\": { \"preferred_activities\": [\"aquariums\", \"parks\", \"beaches\"], \"disliked_activities\": [\"nightlife\"], \"activity_intensity\": \"moderate\", \"notes\": \"Likes kid-friendly outdoor activities\", \"confidence\": \"medium\", \"source_basis\": [\"inference\"] }, \"personality_profile\": { \"traveler_type\": \"family comfort planner\", \"novelty_vs_comfort\": 3, \"crowd_tolerance\": \"low\", \"notes\": \"Avoids overly packed attractions\", \"confidence\": \"medium\", \"source_basis\": [\"inference\"] }, \"family_context\": { \"traveling_with\": \"partner and children\", \"kids_details\": \"young children\", \"kid_preferences\": \"animals, playgrounds, beach time\", \"notes\": \"Needs flexible pacing\", \"confidence\": \"medium\", \"source_basis\": [\"memory\"] }, \"constraints\": { \"budget_range\": \"moderate\", \"time_constraints\": \"early dinners preferred\", \"accessibility_needs\": \"\", \"notes\": \"Avoids very late schedules\", \"confidence\": \"medium\", \"source_basis\": [\"inference\"] }, \"trip_priorities\": { \"must_haves\": [\"kid-friendly food\", \"not too rushed\"], \"avoidances\": [\"overcrowded attractions\"], \"notes\": \"\", \"confidence\": \"medium\", \"source_basis\": [\"memory\"] }, \"profile_summary\": \"Moderate-paced family traveler who prefers kid-friendly, lower-stress trips.\", \"unknowns\": [\"exact hotel tier\"] }"
}
```

Response:

```json
{
  "normalizedProfile": {
    "food": {
      "cuisinesLiked": ["mexican", "japanese"],
      "cuisinesDisliked": [],
      "dietaryRestrictions": [],
      "kidFoods": [],
      "foodAdventurousness": "medium",
      "notes": "Likes familiar favorites plus sushi",
      "meta": {
        "confidence": "medium",
        "sourceBasis": ["memory", "inference"],
        "updatedAt": "2026-03-29T12:00:00.000Z"
      }
    },
    "travelStyle": {
      "pace": "moderate",
      "planningStyle": "structured",
      "accommodationPreference": "family-friendly hotels",
      "transportPreference": "walkable areas and short drives",
      "notes": "Prefers predictable days",
      "meta": {
        "confidence": "medium",
        "sourceBasis": ["memory"],
        "updatedAt": "2026-03-29T12:00:00.000Z"
      }
    },
    "activities": {
      "preferredActivities": ["aquariums", "parks", "beaches"],
      "dislikedActivities": ["nightlife"],
      "activityIntensity": "moderate",
      "notes": "Likes kid-friendly outdoor activities",
      "meta": {
        "confidence": "medium",
        "sourceBasis": ["inference"],
        "updatedAt": "2026-03-29T12:00:00.000Z"
      }
    },
    "personality": {
      "travelerType": "family comfort planner",
      "noveltyVsComfort": 3,
      "crowdTolerance": "low",
      "notes": "Avoids overly packed attractions",
      "meta": {
        "confidence": "medium",
        "sourceBasis": ["inference"],
        "updatedAt": "2026-03-29T12:00:00.000Z"
      }
    },
    "family": {
      "travelingWith": "partner and children",
      "kidsDetails": "young children",
      "kidPreferences": "animals, playgrounds, beach time",
      "notes": "Needs flexible pacing",
      "meta": {
        "confidence": "medium",
        "sourceBasis": ["memory"],
        "updatedAt": "2026-03-29T12:00:00.000Z"
      }
    },
    "constraints": {
      "budgetRange": "moderate",
      "timeConstraints": "early dinners preferred",
      "accessibilityNeeds": "",
      "notes": "Avoids very late schedules",
      "meta": {
        "confidence": "medium",
        "sourceBasis": ["inference"],
        "updatedAt": "2026-03-29T12:00:00.000Z"
      }
    },
    "priorities": {
      "mustHaves": ["kid-friendly food", "not too rushed"],
      "avoidances": ["overcrowded attractions"],
      "notes": "",
      "meta": {
        "confidence": "medium",
        "sourceBasis": ["memory"],
        "updatedAt": "2026-03-29T12:00:00.000Z"
      }
    },
    "profileSummary": "Moderate-paced family traveler who prefers kid-friendly, lower-stress trips.",
    "unknowns": ["exact hotel tier"]
  },
  "warnings": [],
  "repairSuggestions": []
}
```

#### `GET /api/v1/profile/me`

Response:

```json
{
  "profile": {
    "id": "prof_123",
    "userId": "usr_123",
    "version": 3,
    "profileSummary": "Moderate-paced family traveler who prefers kid-friendly, lower-stress trips.",
    "food": {
      "cuisinesLiked": ["mexican", "japanese"],
      "cuisinesDisliked": [],
      "dietaryRestrictions": [],
      "kidFoods": ["pizza", "pasta"],
      "foodAdventurousness": "medium",
      "notes": "",
      "meta": {
        "confidence": "high",
        "sourceBasis": ["user_edit"],
        "updatedAt": "2026-03-29T12:00:00.000Z"
      }
    }
  }
}
```

#### `PUT /api/v1/profile/me`

Request:

```json
{
  "profile": {
    "profileSummary": "Moderate-paced family traveler who prefers kid-friendly, lower-stress trips.",
    "food": {
      "cuisinesLiked": ["mexican", "japanese"],
      "cuisinesDisliked": [],
      "dietaryRestrictions": [],
      "kidFoods": ["pizza", "pasta"],
      "foodAdventurousness": "medium",
      "notes": "",
      "meta": {
        "confidence": "high",
        "sourceBasis": ["user_edit"]
      }
    }
  }
}
```

Response:

```json
{
  "profile": {
    "id": "prof_123",
    "version": 4,
    "updatedAt": "2026-03-29T12:05:00.000Z"
  }
}
```

#### `POST /api/v1/trip/parse-input`

Request:

```json
{
  "text": "Plan a San Diego trip in June with my partner and two kids ages 4 and 7. We want beaches, an aquarium, not too much driving, early dinners, and avoid crowded tourist traps.",
  "detectedLat": 34.0522,
  "detectedLon": -118.2437
}
```

Response:

```json
{
  "destination": "San Diego, CA",
  "suggestedDestinations": [],
  "startDate": "2026-06-12",
  "endDate": "2026-06-16",
  "adults": 2,
  "childrenAges": [4, 7],
  "pets": [],
  "vibe": "beach",
  "foodPreferences": {
    "dietary": [],
    "cuisines": [],
    "avoidances": [],
    "kidFoods": [],
    "budget": null
  },
  "tripGoals": ["beaches", "aquarium"],
  "mustHaves": ["early dinners"],
  "avoidances": ["crowded tourist traps", "too much driving"],
  "accommodationPreferences": [],
  "transportPreferences": ["short drives", "walkable areas"],
  "pacePreference": "moderate",
  "budgetSignals": [],
  "accessibilityNeeds": [],
  "scheduleConstraints": ["early dinners"],
  "celebrationContext": null,
  "specialNotes": [],
  "extraContext": [],
  "unresolvedQuestions": [],
  "detectedRegion": "Los Angeles, California"
}
```

#### `POST /api/v1/attractions/rank`

Request:

```json
{
  "destination": "San Diego, CA",
  "profileId": "prof_123",
  "tripIntent": {
    "tripGoals": ["beaches", "aquarium"],
    "avoidances": ["crowded tourist traps"],
    "pacePreference": "moderate"
  },
  "weather": {
    "summary": "Sunny and warm",
    "forecast": [
      { "name": "Day 1", "high": 76, "condition": "Sunny", "precipitation": 0 }
    ]
  }
}
```

Response:

```json
{
  "city": {
    "id": "city_san_diego",
    "displayName": "San Diego, CA"
  },
  "candidates": [
    {
      "attractionId": "attr_1",
      "canonicalName": "Birch Aquarium",
      "category": "aquarium",
      "shortSummary": "Compact family-friendly aquarium with strong kid appeal.",
      "rankScore": 0.93,
      "reasons": ["matches aquarium goal", "good for ages 4-7", "moderate pace fit"],
      "googlePlaceId": "ChIJ123"
    },
    {
      "attractionId": "attr_2",
      "canonicalName": "La Jolla Shores",
      "category": "beach",
      "shortSummary": "Family-friendly beach with gentle surf and room to spread out.",
      "rankScore": 0.91,
      "reasons": ["matches beach goal", "lower crowd fit", "easy half-day outing"],
      "googlePlaceId": "ChIJ456"
    }
  ]
}
```

#### `POST /api/v1/attractions/verify`

Request:

```json
{
  "cityId": "city_san_diego",
  "candidateIds": ["attr_1", "attr_2", "attr_3"]
}
```

Response:

```json
{
  "verified": [
    {
      "attractionId": "attr_1",
      "googlePlaceId": "ChIJ123",
      "displayName": "Birch Aquarium at Scripps",
      "isOpenNow": true,
      "verificationStatus": "verified",
      "verifiedAt": "2026-03-29T12:10:00.000Z"
    },
    {
      "attractionId": "attr_2",
      "googlePlaceId": "ChIJ456",
      "displayName": "La Jolla Shores Park",
      "isOpenNow": true,
      "verificationStatus": "verified",
      "verifiedAt": "2026-03-29T12:10:00.000Z"
    }
  ],
  "rejected": [
    {
      "attractionId": "attr_3",
      "verificationStatus": "not_found"
    }
  ]
}
```

#### `POST /api/v1/profile/me/feedback`

Request:

```json
{
  "tripRequestId": "trip_123",
  "signalType": "save_as_future_preference",
  "payload": {
    "path": "activities.preferredActivities",
    "value": "aquariums",
    "reason": "User kept and positively rated aquarium suggestions"
  }
}
```

Response:

```json
{
  "ok": true,
  "feedbackId": "fb_123"
}
```

---

## 11. UX and Runtime Flows

### Profile Import Flow

1. User opens `Import from AI`
2. User taps `Copy prompt`
3. User pastes prompt into an external LLM
4. User pastes JSON into SproutRoute
5. System validates and normalizes
6. System shows lightweight review UI
7. User saves locally or to account

Review UI requirements:

- emphasize confidence levels
- highlight missing critical fields
- allow fast edits using chips, selects, and small text areas
- avoid a long blank form

### Runtime Planning Flow

1. Load cached profile if available
2. Parse trip input into expanded trip intent
3. Resolve destination
4. Fetch weather
5. Merge profile + trip intent into a compact planner summary
6. If city attraction intelligence exists:
   - rank attraction candidates
   - verify top shortlist live
   - pass verified shortlist to itinerary generation
7. Generate itinerary using Gemini 3 Flash
8. Generate packing in parallel or background
9. Render itinerary as soon as it is ready
10. Run safety and feedback writes asynchronously

### Human-Like Planning Rules

The planner should:

- start from hard constraints
- account for family routines
- balance novelty with familiarity
- avoid overpacking days if pace is slow or crowd tolerance is low
- align food and activity suggestions with known family taste
- prefer vetted city-specific options over invented attractions when a city catalog exists

---

## 12. Attraction Intelligence Layer

This is a first-class architecture component, not a side experiment.

### Purpose

Move slow reasoning about what exists in a city and what is good for different family types into an offline LLM pipeline.

### Offline LLM Precompute Should Handle

- attraction discovery
- categorization
- age suitability
- stroller friendliness
- indoor or outdoor classification
- duration estimates
- rainy-day usefulness
- crowd profile
- budget tier
- parent appeal
- novelty and comfort fit
- editorial summaries

### Runtime Verification Should Handle

- whether the place currently exists
- live open status or hours where supported
- exact address or map pin
- current rating and review count if needed
- temporary or permanent closure signals

### Runtime Query Strategy

When a user plans a trip in a supported city:

1. fetch city candidates from DB
2. rank them against profile + trip intent + weather
3. verify top `10-20` with live place data
4. remove stale or invalid candidates
5. send only verified shortlist to the runtime planner

### City Rollout Strategy

Start with:

1. top `25` family-travel US cities
2. then top `100` US cities
3. then top `250` global family destinations
4. then top `500` cities by demand

### Refresh Strategy

- rerun precompute every `30-90` days
- rerun when prompt version changes
- rerun high-volume or low-satisfaction cities sooner
- verify only shortlisted candidates at runtime

### Quality Guardrails

- precomputed attraction data is candidate intelligence, not absolute truth
- runtime planner should prefer verified candidates
- stale candidates should be deprioritized
- high-traffic cities should receive QA sampling
- precompute runs must be versioned

---

## 13. Model and Prompting Guidance

### Runtime Model Strategy (Updated April 2, 2026)

- **Primary runtime provider:** OpenAI (GPT-5.4 nano)
- **Automatic fallback:** Anthropic (Claude Haiku 4.5)
- Model journey: Gemini 3 Flash was implemented per this PRD, then superseded by GPT-5.4 nano for better cost/latency tradeoff

### Per-Task Model Configuration (Current)

- `parse-input`: GPT-5.4 nano (~2.4s)
- `trip-plan`: GPT-5.4 nano (~14s with attraction shortlist)
- `packing-list`: GPT-5.4 nano (background, non-blocking)

### Gemini Prompting Rules

- prefer structured or JSON-only output modes where supported
- keep response schema concise
- avoid raw profile JSON in prompts
- use compact profile summaries and relevant slices only

### Offline Model Strategy

Slow, rich models are allowed for attraction precompute because latency does not affect users directly.

Do not use slow models on the live trip hot path unless explicitly benchmarked and approved.

---

## 14. File and Module Targets

Claude Code will likely need to change or add code in these areas.

### Shared Contracts

- `src/shared/types/trip.ts`
- `src/shared/types/profile.ts`
- `src/shared/types/attraction.ts`
- `src/shared/types/auth.ts`

### Backend

- `src/backend/utils/aiClient.js`
- `src/backend/services/parseInput.js`
- `src/backend/services/tripPlanAI.js`
- `src/backend/services/packingListAI.js`
- `src/backend/server.js`
- `src/backend/db/client.js`
- `src/backend/db/migrate.js`
- `src/backend/db/migrations/20260329_001_create_users.sql`
- `src/backend/db/migrations/20260329_002_create_profiles.sql`
- `src/backend/db/migrations/20260329_003_create_profile_revisions.sql`
- `src/backend/db/migrations/20260329_004_create_profile_imports.sql`
- `src/backend/db/migrations/20260329_005_create_trip_requests.sql`
- `src/backend/db/migrations/20260329_006_create_trip_feedback.sql`
- `src/backend/db/migrations/20260329_007_create_cities.sql`
- `src/backend/db/migrations/20260329_008_create_city_attractions.sql`
- `src/backend/db/migrations/20260329_009_create_city_attraction_tags.sql`
- `src/backend/db/migrations/20260329_010_create_attraction_precompute_runs.sql`
- `src/backend/db/migrations/20260329_011_create_attraction_verification_cache.sql`
- `src/backend/db/migrations/20260329_012_add_profile_indexes.sql`
- `src/backend/db/migrations/20260329_013_add_attraction_indexes.sql`
- `src/backend/db/migrations/20260329_014_add_foreign_keys_and_constraints.sql`
- `src/backend/services/auth/session.js`
- `src/backend/services/auth/requireUser.js`
- `src/backend/services/profileImport.js`
- `src/backend/services/profileNormalize.js`
- `src/backend/services/profileMerge.js`
- `src/backend/services/profileSummary.js`
- `src/backend/services/profileRepository.js`
- `src/backend/services/tripRepository.js`
- `src/backend/services/feedbackRepository.js`
- `src/backend/services/attractionRanker.js`
- `src/backend/services/attractionVerifier.js`
- `src/backend/services/attractionRepository.js`
- `src/backend/services/attractionPrecompute.js`
- `src/backend/services/attractionPlaceResolver.js`
- `src/backend/services/attractionPrecomputeRunner.js`

### Frontend

- `src/frontend/src/hooks/useTrip.js`
- `src/frontend/src/hooks/useProfile.js`
- `src/frontend/src/services/profileApi.js`
- `src/frontend/src/components/profile/ProfileImportModal.jsx`
- `src/frontend/src/components/profile/ProfilePasteForm.jsx`
- `src/frontend/src/components/profile/ProfileReviewCard.jsx`
- `src/frontend/src/components/profile/ProfileEditor.jsx`
- `src/frontend/src/components/profile/ProfileSummaryCard.jsx`
- `src/frontend/src/components/profile/PreferenceFeedbackBar.jsx`
- `src/frontend/src/screens/ProfileScreen.jsx`

### Infrastructure

- config for auth provider
- config for Gemini API key and provider routing
- admin script: `scripts/precompute-city-attractions.mjs`
- admin script: `scripts/benchmark-gemini-trip-flow.mjs`

---

## 15. Testing and Benchmarking Requirements

Claude Code must add or update tests for:

- profile import validation
- profile normalization
- expanded trip parse behavior
- merge precedence rules
- profile-aware itinerary prompt construction
- attraction ranking and shortlist creation
- streaming behavior to ensure itinerary is emitted before packing completes
- Gemini provider behavior and fallback behavior

### Benchmark Requirements

Before Gemini becomes the default production path, benchmark:

- p50 and p95 latency
- output token count
- JSON validity rate
- itinerary quality on `5-10` representative trips
- packing quality on `5-10` representative trips
- failure and retry rates

Gemini should only become the default if:

- first itinerary render is under `12s` on representative trips
- JSON validity is acceptable without excessive repair retries
- family-specific quality does not regress materially

---

## 16. Analytics and Metrics

Track:

- profile import start rate
- profile import completion rate
- profile save rate
- account conversion after local profile creation
- profile confidence distribution
- personalized trip satisfaction rate
- repeat trip creation rate for signed-in users
- attraction verification success rate
- percent of itinerary activities sourced from verified precomputed candidates
- p50 and p95 itinerary latency before and after attraction precompute rollout
- average number of live verifications per trip
- prompt token reduction when precomputed candidates exist
- verification cache hit rate

---

## 17. Risks and Mitigations

### Risk 1: External LLMs Hallucinate Profile Data

Mitigation:

- confidence labels
- source basis metadata
- review UI before save
- ability to clear imported guesses

### Risk 2: Paste Workflow Still Feels High-Friction

Mitigation:

- one-click copy prompt
- one paste box
- lightweight review screen
- local trial before signup

### Risk 3: Profile Bloat Increases Latency

Mitigation:

- compact summaries
- task-specific prompt slices
- hard token budgets

### Risk 4: Over-Personalization Reduces Discovery

Mitigation:

- keep room for novelty
- allow trip-specific overrides
- treat low-confidence profile data as advisory

### Risk 5: Gemini Preview Volatility

Mitigation:

- keep model and provider configurable
- retain Anthropic fallback during rollout
- add canary validation and benchmarks
- monitor JSON validity and latency continuously

---

## 18. Final Acceptance Checklist

- [x] Gemini is wired as a first-class provider with safe fallback behavior (Note: runtime primary has since migrated from Gemini to GPT-5.4 nano; Claude Haiku 4.5 serves as fallback)
- [x] First itinerary render is no longer blocked by packing completion (progressive SSE rendering live)
- [x] User can create a profile by pasting JSON from an external LLM (ChatGPT, Claude, Gemini supported)
- [x] Imported profile is normalized into a stable internal schema
- [x] User can review and edit imported profile quickly (review UI with confidence cues live)
- [x] Signed-in users can persist profile across devices (Supabase Auth middleware built; magic link UI pending)
- [x] Expanded parser preserves extra trip context instead of dropping it
- [x] Trip generation uses saved profile plus current trip-specific intent (mergeProfileAndIntent + buildPlannerSummary)
- [x] Attraction intelligence provides ranked verified candidates for supported cities (1,452+ attractions, 66+ cities)
- [x] Personalized trip generation stays within the latency budget (p50 33.7s, best case 6-16s)
- [x] Feedback signals can be captured and stored (feedback endpoint live)
- [x] Tests cover normalization, parsing, merge precedence, streaming behavior, attraction ranking, and runtime behavior (350 unit + 59 e2e tests)

---

## 19. Open Questions for Implementation

Claude Code should raise a decision if blocked on:

1. exact auth provider choice
2. exact database platform choice
3. whether kids and pets should remain embedded in profile JSON or become first-class entities
4. privacy policy for storing raw imported JSON
5. how much admin tooling is needed for city precompute operations

---

## 20. Build Principle

Build the smallest version that proves the loop:

`import profile -> save profile -> plan trip with memory -> use verified city shortlist -> collect feedback -> improve next trip`

Do not overbuild collaboration, social sharing, or advanced explainability before that loop works.
