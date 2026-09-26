# SproutRoute recovery release

September 26, 2026. Synthetic pilot; not a production reliability estimate.

## Decision

Retain Gemini 3.8 Flash for itinerary generation. Use GPT-6 Luna at low reasoning effort as the first cross-provider fallback. Keep GPT-5.4 nano for parsing and Haiku for safety/legal extraction and JSON repair. Keep offline precompute unchanged. The earlier all-task test did not justify switching every call to Luna.

The production change needs `OPENAI_MODEL_ID_TRIP_PLAN=gpt-6-luna`. No OpenRouter key goes into production. Its dedicated benchmark key remains separate.

## Recovery contract

- Give each remaining provider a share of the remaining deadline, so a hung primary cannot use it all.
- Reject empty/truncated output, invalid JSON, missing days, unknown activity references, and unresolved repeats before recording a successful attempt.
- Try a compact regeneration and then JSON repair within the same 150-second generation budget (configurable to at most 180 seconds). This is per generation chunk, not a whole multi-stop trip SLA.
- Disable hidden SDK retries. Honor cancellation; record attempted provider/model and success/failure.
- Preserve future days' activities when filling a sparse day. Compact prompts retain requested day coverage.
- Suppress destination suggestions in both the parser result and picker UI when a destination is resolved.

## Live-provider pilot

The [runner](../../scripts/verify-ai-recovery.mjs) exercised the production generation function using synthetic trips/weather and existing direct-provider credentials. It did not load customer data or production database credentials. [Saved outputs and attempt metadata](2026-09-26-recovery-pilot.json) include failures as well as successes.

| Scenario | Result | Elapsed |
| --- | --- | --- |
| Las Vegas, two days, primary | Pass | 9.4s |
| San Diego with dog, two days, primary | Pass | 10.4s |
| Tokyo, five days, primary | Pass | 21.1s |
| Injected Gemini 429: Las Vegas | Luna recovered | 17.2s |
| Injected Gemini 429: San Diego | Luna recovered | 23.8s |
| Injected Gemini 429: Tokyo | Luna recovered | 52.9s |
| Injected Gemini 503 | Luna recovered | 18.2s |
| Injected invalid JSON | Luna recovered on regeneration | 100.3s |
| Injected empty output | Luna recovered | 17.3s |
| Injected truncation | Luna recovered | 16.8s |

All 10 runs passed deterministic structure checks: exact days, at least four activities per day, valid references, no repeated IDs, named dinner. The difficult invalid-JSON run also encountered a Luna timeout and a rejected Haiku response before Luna completed the compact regeneration. A small clean result is not proof of low production failure probability.

This pilot excludes geocoding, weather retrieval, browser/SSE delivery and venue verification. It does not establish opening hours, pet access, geographic feasibility, or legal accuracy. Actual invoice cost for these direct-provider recovery attempts was not reconciled. The OpenRouter screen's mean charges ($0.0129 Gemini / $0.0018 Luna / $0.0889 Opus per structurally valid itinerary, three cases each) remain a separate experiment, not full-trip production costs.

## Verification and rollback

Local release gate: 568 unit/integration tests passed; 74 mocked browser tests passed; production frontend build passed. Existing npm audit advisories remain (backend 8, frontend 7); this release does not upgrade unrelated dependencies.

PR #26 merged as `b743fc030daa6ec43c64096f739ff0d2dce37956`. GitHub's backend/build and E2E checks passed. Railway deployment `d7e6f9a7-4c25-443f-b4d5-17a0ed536aa0` reported SUCCESS, and a configuration readback confirmed Gemini 3.8 Flash primary and GPT-6 Luna itinerary fallback with no OpenRouter production key.

A [real production browser check](../brag-sproutroute-2026-09-26/evidence/production-browser.json), using a fictional Las Vegas family, resolved the destination in 3.8 seconds with zero suggestions, displayed the first result in 4.0 seconds, and showed an itinerary in 13.3 seconds. The SSE stream contained both requested days and a final `done` event, with no error event or browser exception. All seven observed app API responses were successful. This is one synthetic browser run, not a latency percentile or a measured production failure rate.

Rollback code through the release PR's revert. Restore `OPENAI_MODEL_ID_TRIP_PLAN` to its previous value (unset if absent) to restore the previous fallback model. Keep provider credentials intact. Do not roll back the already-shipped 50/hour application rate limit as part of a model rollback.

Follow-up before stronger public claims: human-score ten diverse full app traces, verify venue/source evidence, evaluate pet and dietary suitability, and measure end-to-end completion and cost including failed attempts and non-model APIs. The model screens are evidence for this bounded routing choice, not a model-quality leaderboard.
