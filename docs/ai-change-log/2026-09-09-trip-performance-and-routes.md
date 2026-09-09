# Trip performance, route maps, and demo reliability

## Evidence and diagnosis

Production metrics remained available at `/api/v1/ops/metrics`, but `/ops` had no sign-in form and the dashboard referenced nonexistent summary fields. Its historical sample (111 trips, April–September; not a controlled current-release cohort) reported AI p50 32.3s, total p50 33.7s, and p95 total 80.8s. Geocoding p50 was 375ms; weather p50 63ms.

The previous recovery addressed same-origin API requests and provider deadlines (PR #21). Remaining delays came from sequential city generation, a hardcoded itinerary model, output repair/retries, and a full bundle retry even after an explicit stream error. Browser reproduction also found `Hakone (Hot Springs)` failed geocoding and restarted generation. Dates/duration are still inferred when the user only says “winter”; confirm the route review before timing or comparing runs.

## Implemented

- Configurable itinerary provider via `AI_PROVIDER_TRIP_PLAN`, with existing per-provider task model variables. Gemini 3 uses low thinking and omits unsupported temperature settings. Existing Anthropic fallback remains; 60s total provider deadline remains.
- At most two route stops plan concurrently. Streamed activity IDs are scoped to their city; days merge in route order. Parenthetical city descriptions are removed for geocoding. City display names remain readable.
- Packing starts independently; safety starts when destination country is available. Explicit generation errors remain visible with retry/edit actions instead of silently regenerating the trip. Partial route failures preserve the visible results.
- Maps retain named attractions lacking coordinates and qualify each by its route city. Google computes the actual street route; no fabricated line geometry or screenshots are used. The numbered legend is outside the map. Embedded routes currently show driving; Google Maps offers other transport options. This legacy embed URL was visually verified; a restricted Maps Embed key is the longer-term supported integration.
- Safety highlights are on Plan, with a link to all tips. Date context reaches safety generation. Missing emergency/advisory data stays unknown. Existing jurisdiction rule files are untouched; generated advice still requires local verification.
- Route weather appears in the weather panel. Trip tips collapse. Suggested times replace the unsubstantiated “Verified hours” label. Dinner no longer overlaps the previous activity.
- Documents/personal prescriptions have no shopping buttons; adults-only lists omit toys. Existing retail search links remain; no purchases occurred.
- `/ops` now has a key-to-HttpOnly-session login; `/dashboard` redirects there. No URL credentials or public telemetry. The login uses same-origin referrer policy so browser form submissions pass CORS. Authenticated dashboard remains no-referrer/no-store. Dashboard counts describe bounded samples, not invented totals/costs. Database response errors fall back to recent in-memory telemetry.
- Photo proxy explicitly resolves Google metadata, validates an HTTPS googleusercontent host, and fetches bounded images without forwarding the key. Required author names are retained for display.

## Model benchmark

Synthetic Tokyo 3-day adults, Kyoto 3-day family, Tokyo 6-day adults; production prompt; two passes; 16,384 output token ceiling; direct calls with no fallback. Six samples per model, 18 total. API keys remained in process environment. Timing measured locally, not Railway; no p95 claims are justified.

| Model | Mean | Range |
|---|---:|---:|
| GPT-5.4 nano | 28.1s | 19.8–38.8s |
| Gemini 3.8 Flash, low thinking | 13.8s | 10.8–18.2s |
| Gemini 3.5 Flash Lite, low thinking | 10.7s | 7.3–17.2s |

Choose Gemini 3.8 Flash for itinerary generation: second-pass cases all supplied at least four activities per day, named dinners, unique IDs, and valid references. Lite supplied only three activities on some days; nano had an invalid reference in pass one and a repeated activity in pass two. Raw quality is structural, not independent verification of opening hours, restaurant availability, geographic suitability, or child suitability. The first pass's dinner scorer incorrectly expected breakfast/lunch; only pass-two dinner results are used. Pass-two results are in `docs/benchmarks/2026-09-09-trip-models.json`.

Official documentation: https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash ; https://ai.google.dev/gemini-api/docs/latest-model ; https://developers.google.com/maps/documentation/embed/embedding-map ; https://developers.google.com/maps/documentation/places/web-service/place-photos . Actual model listing and generation succeeded with the existing Google key.

## Verification and rollout

- Unit/integration coverage includes login/session security, metrics DB-error fallback, map names/order, bounded city concurrency, activity-ID collisions, generation error handling, early packing/safety, seasonal context, dinner overlap, shopping exclusions, photo destination validation, and rendered Plan content.
- Local browser: 15-day Japan / four stops completed in 33.081s, first stop 13.933s; all 15 day tabs, named attractions, actual day-route geometry, packing, and safety rendered. This differs from the prior 8-day/3-stop run and is not a controlled production comparison.
- Deployment/production smoke results are appended after verification.

## Diagnostics and follow-up

Open `/ops`, sign in using the existing Railway OPS_SECRET (never put it in a URL), and compare stage times and model/task errors. Collect request ID, timestamp, destination/dates, stream completion/error event, and stage/model latency; do not export secrets or raw personal prompts. Preserve a fixed synthetic prompt plus explicit dates/route for future performance comparisons. Distinguish an empty itinerary response from missing frontend data and a provider timeout from a rendering error.

Longer-term: real token-usage billing, release/model cohort metrics and failure counts, a broader quality benchmark including venues/hours, cancellation propagation into all upstream calls, and place-ID-based route resolution with a supported Maps Embed configuration. Country-tour stop labels that combine cities still need explicit base-city modeling. No model or screenshot can substitute for current venue and legal/safety verification.
