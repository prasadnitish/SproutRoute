# Attractions database audit

Date: 2026-10-27. Scope: does itinerary generation use the Supabase attractions tables?
Method: schema and row counts from Supabase (read-only SQL), a code trace with file and line numbers, and three real generations through `/api/v1/trip/plan` with production data and every database write swallowed (`scripts/audit-attractions.mjs`). Raw output is in `docs/attractions-audit-runs-1.json` and `docs/attractions-audit-runs-2.json`.

## Verdict: IGNORED

The generation path queries the database on every request and tells the model to use the result ("MANDATORY ATTRACTION LIST"). The query returns zero rows for every city, so the model recalls venues from memory every time. This has been true since 2026-07-11 (commit `3339f90`).

Why zero rows:

- The read filter is `verification_status = 'verified'` and `source_type != 'generated'` (`src/backend/services/attractionMemory.js:537-538`).
- All 656 verified rows have `source_type = 'generated'`. All 1,802 rows that are not `generated` (they are `precomputed`) are `unverified`. No row satisfies both conditions.
- Before `3339f90` the filter was `verification_status != 'rejected'`, which returned rows.

Neither "USED" nor "PARTIALLY USED" fits: in the three runs the model was handed 0 candidates, so nothing it produced came from the database.

## 1. Schema inventory

Row counts are `count(*)`. The row estimates in the Supabase table list are stale (it reported 2 cities; there are 104).

| Table | Rows | Last write | Notes |
|---|---:|---|---|
| `cities` | 104 | 2026-10-08 | One row per place name. 103 have at least one attraction. |
| `city_attractions` | 2,468 | 2026-10-27 | The attractions table. There is no table called `attractions`. |
| `city_attraction_tags` | 0 | never | Empty. |
| `attraction_precompute_runs` | 116 | 2026-04-03 | 77 completed and 39 failed runs of `claude-sonnet-4-6`, prompt `precompute-v1`, 2026-03-29 to 2026-04-03. |
| `attraction_verification_cache` | 1,848 | 2026-10-27 | All `google_places_identity`. 1,838 of 1,848 are past `expires_at`. Covers 657 attractions. |

`city_attractions` columns: `id, city_id, canonical_name, short_summary, category, subcategories_json, age_bands_json, indoor_outdoor, duration_bucket, pace_fit, crowd_level, budget_tier, stroller_friendly, rainy_day_fit, parent_appeal_score, kid_appeal_score, pet_friendly, booking_needed, why_recommended, timing_tip, llm_notes, confidence_score, source_type, verification_status, times_seen, last_seen_at, last_verified_at, google_place_id, created_at, updated_at`.

Provenance. There is no crawl provenance: no source URL, crawler name or crawl timestamp. Rows come from two places:

| `source_type` | `verification_status` | Rows | With `google_place_id` | Origin |
|---|---|---:|---:|---|
| `precomputed` | unverified | 1,802 | 0 | Claude Sonnet 4.6 batch runs, March 29 to April 3 (`attraction_precompute_runs`). |
| `generated` | verified | 656 | 656 | A model's trip-plan suggestions saved by `persistTripAttractions` (`attractionMemory.js:929`, `:561`), then matched to a Google place (`:647`). |
| `generated` | unverified | 10 | 1 | Same, with no Google match. |

So the database holds model-recalled venues, not crawled ones. Only 657 of 2,468 rows (27%) have a Google place id (603 distinct), and 563 of those were last verified more than 30 days ago.

Coverage:

- 35 of 104 cities have any place id. The other 69, including San Francisco, Chicago, Tokyo, London and Paris, have none.
- Seattle has 33 rows: 20 `generated`/verified, 13 `precomputed`/unverified. Las Vegas has 57. Leavenworth has 12. Anchorage is not in `cities`.
- `cities` has duplicates and junk created by the geocoder (`createIfMissing`): "Kyoto" and "Kyoto, Japan", "New York" and "New York City", "Tokyo" and "Tokyo, Japan", "London" and "Greater London", "Consulaat-Generaal van het Verenigd Koninkrijk", "Government Hospital", and a city named ",".

Missing against the Part B column list: `place_id` (exists as `google_place_id`), `rating`, `rating_count`, `price_level`, `opening_hours`, `photo_ref`, `business_status`, `status`, `source` (exists as `source_type`), `trend_score`, `trend_updated_at`. Tables `refresh_log` and `city_seeds` do not exist.

## 2. Trace of the generation path

| Step | File and line |
|---|---|
| Routes that generate itineraries: `/api/v1/trip/plan`, `/bundle`, `/stream`, `/replan` | `server.js:1353`, `:1472`, `:1624`, `:1965` |
| Multi-stop trips load candidates per stop | `server.js:1319` |
| Candidate loader (limit `max(16, days*4+4)`, capped at 36) | `server.js:255-290` |
| Service entry | `attractionMemory.js:825` (`getPlanningCandidates`) |
| City lookup by name | `attractionMemory.js:431` (`resolveCityRecord`) |
| Row fetch with the filter | `attractionMemory.js:529-542`, filter on `:537-538` |
| Fallbacks when fewer than 12 rows: same-region cities, then nearby cities | `attractionMemory.js:857-885` |
| Rank, then refresh stale rows against Places (writes) | `attractionMemory.js:925` (`refreshStaleCandidates`) |
| Shortlist handed to the model (max 28) | `tripPlanAI.js:891-895` |
| Prompt block "MANDATORY ATTRACTION LIST", allows 1 new discovery per day | `tripPlanAI.js:978-996` |
| Each shortlist line carries name, category, area, mode, duration bucket, status only. No hours, rating or price. | `attractionMemory.js:392-415` |
| Write-back of the model's own suggestions after every plan | `server.js:1406`, `:1551`, `:1931`, `:2039` into `attractionMemory.js:929` |
| Unfiltered public read (not generation) | `server.js:2832` (`/cities/:cityId/attractions`) |

Supabase queries reachable from generation (from the run log): `cities` by country and name; `city_attractions` by city ids with the filter above; `cities` by region (limit 12); `cities` by country (limit 216) for the nearby pool; `city_attractions` again for the pool (limit 160); `attraction_verification_cache` by attraction id; writes to `city_attractions` and the cache from `refreshStaleCandidates` and `persistTripAttractions`.

## 3. Runs

Request for all three: 4 days (2026-12-19 to 12-22), 2 adults, children aged 3 and 7, default activities. Supabase writes were swallowed; none were attempted (the candidate list was empty, so there was nothing to refresh).

| Case | City rows in DB | Rows returned by the read | Shortlist sent to the model | HTTP | Seconds |
|---|---:|---:|---:|---|---:|
| Seattle | 33 | 0 | 0 | 200 | 69 |
| Leavenworth, WA (long tail) | 12 | 0 | 0 | 500 (twice) | 137 |
| Anchorage, AK (not in DB) | none | 0 | 0 | 200 | 48 |

Seattle log, in order:

1. City requested: `Seattle, WA`.
2. DB: `cities` lookup returned 1 row (Seattle); `city_attractions` returned 0 rows; regional and nearby city pools returned 4 and 70 cities; the second `city_attractions` read returned 0 rows. Service log: `attraction-memory:loaded`, `source: city+nearby`, `rawCount: 0`, then `rankedCount: 0`.
3. Final itinerary: 23 named venues (Pike Place Market, Seattle Aquarium, Space Needle, Chihuly Garden and Glass, Pacific Science Center, Woodland Park Zoo and others), none of them from a database candidate.

Do not read name overlap as database use. 16 of the 23 Seattle venues match a name in the city's stored rows, with no candidate reaching the model. The overlap exists because the model recalls the same famous places the database holds. A "% of stops from the DB" check has to count membership in the candidate list sent to the model, not name matches.

Leavenworth returned HTTP 500 on both attempts because every AI provider failed (section 4), so there is no itinerary to inspect. The database measurement still stands: the city exists with 12 rows and the read returned 0. Anchorage has no city row (the `cities` lookup returned 0 rows twice), got an itinerary with 20 named venues (Anchorage Museum, Alaska Native Heritage Center, Alaska Botanical Garden and others), and none appear in any stored row.

## 4. Other findings from the runs

- **Production AI providers are failing.** In every run Gemini returned HTTP 402 ("prepayment credits are depleted") and OpenAI returned 401 (invalid key). Requests fall through to Anthropic, which rejected most attempts for repeated activities, then to DeepSeek. The Seattle plan was returned by DeepSeek. Two of the first three requests ended in HTTP 500 after about 145 seconds. This is the live configuration, not a test artifact.
- **Merging PR #31 (remove DeepSeek) before fixing the keys would make this worse**, because DeepSeek was the only provider that produced a valid Seattle plan.
- **The audit wrote 41 rows to production `trip_metrics`** (`ai_call` and `error` events from the audit runs, `created_at` 2026-10-27 18:03 to 18:14 UTC). Only the attraction tables were protected. Every row with `created_at` after 17:55 UTC that day is from the audit.
- The write-back loop feeds the model's own output into the table that is supposed to ground it. Rows labelled `verified` are venues a model suggested that Google could match by name. That confirms the place exists, not that it suits families or is open.

## 5. What this means for the next parts

- The table is `city_attractions`, not `attractions`; Part B should extend it rather than create a new table.
- Part B has to cover 2,468 rows, and 1,811 have never been matched to a Google place.
- Part D needs a policy for cities with no rows (Anchorage). "Select stops only from the table" returns nothing there, so either the table is filled on demand from Places or generation falls back to free recall for uncovered cities.
- The retrieval filter should change to `status`-based exclusion (closed rows out, everything else in), once rows carry Places data. Changing it first would put 1,802 unverified model-recalled rows into prompts under a "verified" label.
