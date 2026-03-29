# Attraction Layer Handoff Checklist

This document is the tactical handoff for continuing the attraction intelligence build if Codex context limits are reached.

## Current Status

- [x] Demand-driven attraction memory is live on production.
- [x] Generated trip attractions are persisted into `public.city_attractions`.
- [x] `/api/v1/attractions/rank` can return stored attractions from memory.
- [x] Trip generation can consume cached attractions via `cachedAttractions` in the planner prompt.
- [x] Google Place identity resolution and verification-cache writes are implemented on the current branch.
- [ ] Canonical duplicate cleanup for previously stored rows is not yet run as a backfill.
- [ ] Runtime shortlist verification with freshness TTL is not yet used to filter itinerary candidates.
- [ ] Offline precompute is not started.

## Branches and Recent Commits

- Live production baseline for attraction memory: commit `203fb26` on `main`
- Current working branch for next slice: `codex/attraction-canonicalization`

## Files To Know First

Backend:
- [src/backend/services/attractionMemory.js](/Users/nitish/VS%20Code%20Projects/tpm-portfolio/strollerscout/src/backend/services/attractionMemory.js)
- [src/backend/services/tripPlanAI.js](/Users/nitish/VS%20Code%20Projects/tpm-portfolio/strollerscout/src/backend/services/tripPlanAI.js)
- [src/backend/services/placesEnrich.js](/Users/nitish/VS%20Code%20Projects/tpm-portfolio/strollerscout/src/backend/services/placesEnrich.js)
- [src/backend/server.js](/Users/nitish/VS%20Code%20Projects/tpm-portfolio/strollerscout/src/backend/server.js)
- [src/backend/db/migrations/20260329_017_add_attraction_memory_columns.sql](/Users/nitish/VS%20Code%20Projects/tpm-portfolio/strollerscout/src/backend/db/migrations/20260329_017_add_attraction_memory_columns.sql)

Tests:
- [tests/unit/attractionMemory.test.js](/Users/nitish/VS%20Code%20Projects/tpm-portfolio/strollerscout/tests/unit/attractionMemory.test.js)
- [tests/unit/attractions.test.js](/Users/nitish/VS%20Code%20Projects/tpm-portfolio/strollerscout/tests/unit/attractions.test.js)
- [tests/unit/tripPlanAI.test.js](/Users/nitish/VS%20Code%20Projects/tpm-portfolio/strollerscout/tests/unit/tripPlanAI.test.js)
- [tests/unit/placesEnrich.test.js](/Users/nitish/VS%20Code%20Projects/tpm-portfolio/strollerscout/tests/unit/placesEnrich.test.js)

## What Was Verified Live

- Santa Barbara started with no stored attraction-memory rows.
- A live `POST /api/v1/trip/plan` generated 4 attractions and persisted them.
- A follow-up `POST /api/v1/attractions/rank` returned those rows from `source: attraction_memory` in under 1 second.
- A second same-city trip call incremented `times_seen` on repeated attractions.

## Next Recommended Order

### Phase 1: Canonicalization and Identity

- [x] Finish the current branch changes and deploy them.
- [x] Ensure persisted attractions use `google_place_id` when Places can resolve them.
- [x] Write `google_places_identity` records into `public.attraction_verification_cache`.
- [x] Collapse duplicate shortlist entries by `google_place_id` first, then safe near-duplicate naming heuristics.
- [x] Confirm the prompt receives deduped cached attractions.

Acceptance:
- Repeat-city attraction lists do not fragment into obvious near-duplicates.
- `city_attractions.google_place_id` is populated for common attractions when API key is present.
- `attraction_verification_cache` receives rows on successful identity resolution.

### Phase 2: Freshness-Based Runtime Reuse

- [ ] Add a helper that reads the latest verification cache row per attraction.
- [ ] Compute freshness buckets: `fresh`, `aging`, `stale`, `unverified`.
- [ ] Make `getPlanningCandidates()` prefer `fresh` and `verified` rows.
- [ ] Re-check only top shortlist candidates if the cached verification is stale.
- [ ] Do not block trip generation if Places refresh fails.

Acceptance:
- Runtime reuse favors verified/fresh places.
- A Places outage does not break trip planning.
- Candidate ranking still returns quickly.

### Phase 3: Cleanup and Backfill

- [ ] Add a one-time dedupe script for existing rows in high-traffic cities.
- [ ] Merge rows sharing the same `google_place_id`.
- [ ] Review top duplicate clusters by normalized name for manual-safe merges.
- [ ] Backfill `times_seen`/`last_seen_at` consistency where needed.

Acceptance:
- Known duplicate clusters are merged.
- Ranking endpoints do not surface duplicate attractions for major repeat cities.

### Phase 4: Shortlist-Driven Itinerary Reduction

- [ ] Pass only the top 5-8 cached attractions into itinerary generation.
- [ ] Shrink itinerary prompt instructions so the model composes from shortlist rather than discovering places from scratch.
- [ ] Measure whether repair-path rate drops when cached attractions are present.

Acceptance:
- Repeat-city itinerary generation shows lower token usage and lower repair frequency.
- Quality does not regress for cities with no attraction memory.

### Phase 5: Offline Precompute, After Runtime Reuse Is Stable

- [ ] Start with the Wave 1 city set from the attraction PRD/spec docs.
- [ ] Seed only destinations with real demand or strategic value.
- [ ] Use stronger offline models for curation and fast runtime models for trip composition.

## Commands

Run tests:

```bash
npm test
node --test tests/unit/attractionMemory.test.js
node --test tests/unit/placesEnrich.test.js
node --test tests/unit/tripPlanAI.test.js
```

Build:

```bash
npm run build
```

Apply a single remote Supabase migration safely:

```bash
supabase db query --linked -f "/Users/nitish/VS Code Projects/tpm-portfolio/strollerscout/src/backend/db/migrations/<migration>.sql"
```

Check remote rows:

```bash
supabase db query --linked "select canonical_name, google_place_id, times_seen, verification_status from public.city_attractions order by updated_at desc limit 20;"
supabase db query --linked "select provider, verified_at, expires_at from public.attraction_verification_cache order by verified_at desc limit 20;"
```

Deploy:

```bash
git checkout main
git merge --no-ff <feature-branch>
git push origin main
railway deployment list --service SproutRoute
```

## Suggested Live Verification Flow

1. Pick a city with no rows in `city_attractions`.
2. Run `POST /api/v1/trip/plan`.
3. Query Supabase for the city rows.
4. Run `POST /api/v1/attractions/rank`.
5. Run the same trip again.
6. Verify `times_seen` increments and duplicate count stays controlled.

## Risks To Watch

- Places identity matches can be wrong for generic attraction names.
- Over-aggressive near-duplicate merging can collapse legitimately distinct venues.
- Verification status semantics should stay honest: identity verification is not the same as real-time open-hours validation.
- Reuse should never block trip generation if Supabase or Places is slow.

## Product Principle For This Phase

The goal is not full attraction intelligence yet. The goal is to make repeat destinations faster, more grounded, and less hallucination-prone using the data we are already earning from live trip generation.
