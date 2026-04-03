# Build Spec Sheet: Attraction Intelligence Layer and Demand-Driven Storage

**Last Updated: April 2, 2026**

**Project Name:** SproutRoute
**Phase:** Attraction Intelligence Layer
**Version:** 2.0
**Date:** March 29, 2026 (originally); updated April 2, 2026
**Status:** Largely implemented -- see Current Status section below

---

## Current Status (as of April 2, 2026)

The attraction intelligence layer is live in production with the following state:

- **1,452+ curated attractions** across **66+ cities** stored in Supabase PostgreSQL
- **All database tables created and migrated:** cities, city_attractions, city_attraction_tags, attraction_precompute_runs, attraction_verification_cache (plus 14 other tables for profiles, users, trips, metrics)
- **Demand-driven capture:** Live -- attractions discovered during trip generation are captured back into storage
- **Canonicalization and dedupe:** Live -- name normalization and city-level dedup rules active
- **Freshness ranking:** Live -- freshness model classifies attractions as fresh / aging / stale / unverified
- **Runtime shortlist injection:** Live -- cached attractions loaded from Supabase (up to 20 per city), ranked against trip intent, and injected into AI prompt
- **Cross-day dedup:** Live in scheduler
- **8 PM hard cap** for family trips and **dinner-only meal recommendations** active
- **Wave 1 (15 cities):** Complete -- US major cities + international (San Diego, LA, Anaheim, SF, Seattle, Orlando, NYC, DC, Miami, Chicago, London, Tokyo, Dubai, Singapore, Bali)
- **Wave 2 (20 cities):** Complete -- expanded US + India + Europe
- **Wave 3 (62 cities):** In progress -- targeting top 100 North American tourist destinations
- **AI models:** Precompute uses Claude Sonnet 4.6 (offline). Runtime uses GPT-5.4 nano (primary) with Claude Haiku 4.5 fallback
- **Latency impact:** p50 33.7s, avg 38.7s (down from 83s baseline); best case simple trips 6-16s
- **Cost:** $0.003/trip on GPT-5.4 nano (down from $0.24/trip on Claude Sonnet)

---

## 1. Build Objective

Implement a reusable attraction intelligence system that:

- stores attractions generated during live trip planning
- assigns freshness and verification metadata
- supports selective offline precompute for high-priority destinations
- ranks stored attractions for new trip requests
- verifies only top candidates live before itinerary generation

---

## 2. Scope for This Phase

### In Scope

- attraction extraction from generated trip outputs
- destination normalization to canonical city records
- attraction storage and dedupe
- freshness model
- shortlist destination seeding
- offline precompute pipeline for seed destinations
- runtime ranking and verification

### Out of Scope

- full household profile memory system
- collaborative curation tooling
- global city rollout beyond the seeded wave

---

## 3. Recommended Build Order

### Step 1: Demand-Driven Attraction Capture

Capture attractions from:

- trip plan suggested activities
- itinerary day activities
- any enriched attraction payloads already present in the trip response

Store them with:

- city
- canonicalized name
- source trip ID
- verification status
- freshness state

### Step 2: Canonicalization and Dedupe

Add city-level dedupe rules:

- normalize names
- merge exact duplicates
- merge records sharing the same place ID
- mark ambiguous matches for later enrichment

### Step 3: Freshness and Verification Cache

Add:

- freshness state
- freshness score
- last verified timestamp
- verification payload cache

### Step 4: Seed Precompute Wave

Run offline LLM jobs for the 50 seeded destinations in the PRD.

### Step 5: Runtime Rank and Verify

On trip request:

- pull city candidates
- rank
- verify top 10-20
- pass verified shortlist to itinerary generation

---

## 4. Exact New Tables

Create the following tables in PostgreSQL.

### `cities`

- `id`
- `country_code`
- `region_code`
- `city_name`
- `display_name`
- `lat`
- `lon`
- `priority_tier`
- `seed_source`
- `created_at`
- `updated_at`

### `trip_seen_attractions`

- `id`
- `trip_request_id`
- `city_id`
- `raw_name`
- `canonical_name`
- `category`
- `summary`
- `tags_json`
- `shown_to_user`
- `used_in_itinerary`
- `google_place_id`
- `verification_status`
- `freshness_state`
- `freshness_score`
- `last_seen_at`
- `last_verified_at`
- `confidence_score`
- `source_model`
- `created_at`
- `updated_at`

### `city_attractions`

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
- `google_place_id`
- `verification_status`
- `freshness_state`
- `freshness_score`
- `last_verified_at`
- `source_type`
- `created_at`
- `updated_at`

### `city_attraction_tags`

- `id`
- `attraction_id`
- `tag`
- `tag_group`
- `weight`
- `created_at`

### `attraction_precompute_runs`

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

### `attraction_verification_cache`

- `id`
- `attraction_id`
- `provider`
- `verification_payload_json`
- `verified_at`
- `expires_at`

---

## 5. Exact Migration Filenames

Create these migrations under `src/backend/db/migrations/`.

1. `20260329_101_create_cities.sql`
2. `20260329_102_create_trip_seen_attractions.sql`
3. `20260329_103_create_city_attractions.sql`
4. `20260329_104_create_city_attraction_tags.sql`
5. `20260329_105_create_attraction_precompute_runs.sql`
6. `20260329_106_create_attraction_verification_cache.sql`
7. `20260329_107_add_attraction_indexes.sql`
8. `20260329_108_add_attraction_foreign_keys.sql`
9. `20260329_109_seed_priority_cities.sql`

---

## 6. Exact New Module Names

### Backend

- `src/backend/db/client.js`
- `src/backend/db/migrate.js`
- `src/backend/services/cityRepository.js`
- `src/backend/services/attractionRepository.js`
- `src/backend/services/tripAttractionCapture.js`
- `src/backend/services/attractionCanonicalize.js`
- `src/backend/services/attractionFreshness.js`
- `src/backend/services/attractionRanker.js`
- `src/backend/services/attractionVerifier.js`
- `src/backend/services/attractionPlaceResolver.js`
- `src/backend/services/attractionPrecompute.js`
- `src/backend/services/attractionPrecomputeRunner.js`
- `src/backend/services/attractionSeedData.js`

### Shared Types

- `src/shared/types/attraction.ts`
- `src/shared/types/city.ts`

### Scripts

- `scripts/precompute-city-attractions.mjs`
- `scripts/resolve-attraction-place-ids.mjs`
- `scripts/reverify-city-attractions.mjs`
- `scripts/benchmark-attraction-reuse.mjs`

---

## 7. Exact API Surface

### `POST /api/v1/attractions/capture-from-trip`

Purpose:

- internal endpoint or service hook to persist attractions from a completed trip-generation response

Request:

```json
{
  "tripRequestId": "trip_123",
  "city": {
    "displayName": "San Diego, CA",
    "countryCode": "US",
    "regionCode": "CA"
  },
  "attractions": [
    {
      "name": "Birch Aquarium",
      "category": "aquarium",
      "summary": "Compact family-friendly aquarium with strong kid appeal.",
      "shownToUser": true,
      "usedInItinerary": true,
      "confidenceScore": 0.91,
      "googlePlaceId": "ChIJ123",
      "verificationStatus": "verified"
    }
  ]
}
```

Response:

```json
{
  "saved": 1,
  "deduped": 0,
  "cityId": "city_san_diego"
}
```

### `POST /api/v1/attractions/rank`

Request:

```json
{
  "destination": "San Diego, CA",
  "childrenAges": [4, 7],
  "tripGoals": ["beaches", "aquarium"],
  "avoidances": ["crowded tourist traps"],
  "pacePreference": "moderate",
  "weather": {
    "summary": "Sunny and warm"
  },
  "maxCandidates": 15
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
      "sourceType": "trip_memory",
      "rankScore": 0.93,
      "freshnessState": "fresh",
      "verificationStatus": "verified",
      "reasons": ["matches aquarium goal", "good for ages 4-7", "moderate pace"]
    }
  ]
}
```

### `POST /api/v1/attractions/verify`

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
      "displayName": "Birch Aquarium at Scripps",
      "isOpenNow": true,
      "verificationStatus": "verified",
      "verifiedAt": "2026-03-29T12:00:00.000Z"
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

### `POST /api/v1/admin/attractions/precompute`

Request:

```json
{
  "cityIds": ["city_san_diego", "city_orlando"],
  "model": "gemini-3.1-pro",
  "promptVersion": "attraction-precompute-v1"
}
```

Response:

```json
{
  "queuedRuns": 2
}
```

---

## 8. Runtime Integration Points

### Existing Trip Flow Integration

Hook into:

- trip plan generation output
- itinerary generation output
- any attraction enrichment step that already resolves real places

### Required Runtime Order

1. destination resolved
2. existing attraction memory loaded
3. precomputed attraction data loaded
4. candidates merged and ranked
5. top 10-20 verified live
6. verified shortlist injected into itinerary prompt
7. final itinerary generated
8. surfaced attractions captured back into storage

---

## 9. Seed Destination Rollout

### Wave 1: Validation Wave

Implement precompute first for these 15 destinations:

- San Diego
- Los Angeles
- Anaheim / Orange County
- San Francisco
- Seattle
- Orlando
- New York City
- Washington, DC
- Miami
- Chicago
- London
- Tokyo
- Dubai
- Singapore
- Bali / Denpasar

Wave 1 purpose:

- validate ranking and verification architecture
- prove attraction reuse value
- prove latency gains on repeat or seeded destinations

### Wave 2: Controlled Expansion

Implement next for these 25 destinations:

- Santa Barbara
- Monterey / Carmel
- Lake Tahoe
- Portland
- Honolulu / Oahu
- Boston
- Philadelphia
- Atlanta
- Charleston
- Niagara Falls / Buffalo
- Paris
- Rome
- Vancouver
- Toronto
- Cancun
- Mexico City
- Barcelona
- Goa
- Jaipur
- Udaipur
- Kochi
- Mysuru
- Ooty
- Coorg / Madikeri
- Munnar

Wave 2 prerequisite:

- Wave 1 seeded destinations must show measurable latency improvement and acceptable verification quality

### Wave 3: Strategic Long-Tail

Implement only after Waves 1 and 2 prove ROI.

Default Wave 3 shortlist:

- Shimla
- Rishikesh
- Kuala Lumpur
- Phuket
- Hong Kong

Plus any demand-promoted destinations.

### Promotion Rule

Promote a city into precompute if:

- 10 or more trip requests in 30 days
- 3 or more distinct users searched it
- poor live generation quality is observed
- repeated verification reuse is likely

### Spend-Control Rule

Do not move to the next wave unless the current wave shows:

- verified candidate reuse
- acceptable verification success rate
- measurable itinerary latency improvement
- stable ranking quality

---

## 10. Freshness Rules

### Freshness State Logic

- `fresh`
  - verified within 7 days
- `usable`
  - verified within 30 days
- `stale`
  - older than 30 days
- `unverified`
  - known candidate but never verified
- `rejected`
  - failed verification or blocked from reuse

### Ranking Bias

- prefer `fresh`
- allow `usable`
- reverify `stale` if shortlisted
- use `unverified` only as fallback
- never show `rejected`

---

## 11. Implementation Checklist

### Week 1

- [x] create DB tables and migrations
- [x] seed priority cities
- [x] implement trip attraction capture
- [x] implement canonicalization and dedupe
- [x] store freshness metadata

### Week 2

- [x] implement attraction ranking
- [x] implement live verification
- [x] wire attraction ranking into trip generation
- [x] capture shown attractions back into storage
- [x] test reuse path on repeat city requests

### Week 3

- [x] implement offline precompute runner
- [x] run Wave 1 destinations (15 cities complete)
- [x] resolve place IDs
- [x] benchmark latency improvement (p50 33.7s, avg 38.7s, down from 83s)
- [x] promote successful path into default behavior for seeded destinations

### Post-Week 3 (completed)

- [x] run Wave 2 destinations (20 additional cities complete)
- [x] begin Wave 3 destinations (62 cities, in progress)
- [x] demand-driven capture live from real trips
- [x] cross-day dedup in scheduler
- [x] 8 PM hard cap for family trips
- [x] dinner-only meal recommendations
- [x] 1,452+ attractions across 66+ cities

---

## 12. Success Criteria

- [x] repeat destination trips reuse stored attraction candidates
- [x] seeded destinations use verified ranked shortlists
- [x] itinerary generation latency drops for repeat or seeded destinations (p50 33.7s, down from 83s)
- [x] attraction storage grows from real user demand (1,452+ attractions, 66+ cities)
- [x] precompute spend stays constrained to seeded waves and promoted cities
