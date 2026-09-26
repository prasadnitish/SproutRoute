# Cortex demo trip-generation recovery

## Observed failure

On September 24 (Pacific time), production logs showed `parse-input` 429 responses after the shared AI limiter counted parsing, streaming, and deterministic packing against a 10-request/15-minute per-IP budget. The Gemini trip model repeatedly returned HTTP 402 (prepayment credits depleted); slow Anthropic fallbacks then exhausted the 60-second provider deadline on some bundle requests. A separate stream error showed Nominatim rejecting `Portland, Oregon (Columbia River Gorge day trips)`.

The authenticated aggregate metrics endpoint showed 15 errors in 24 sampled Gemini calls and trip-plan latency p95 of about 81 seconds. These are bounded historical samples, not an incident-only cohort. No raw prompts, keys, or billing details are recorded here.

## Change

- Raise the shared AI budget to 50 requests/hour/IP; keep deterministic packing on the lightweight limiter.
- Do not retry 429 responses or turn a rate-limited stream into a bundle request. Preserve the server's rate-limit error for the UI.
- Use the already-configured OpenAI provider before slower Anthropic/DeepSeek fallbacks when Gemini fails. This does not replenish Gemini credits or alter the configured primary model.
- Retry geocoding with the place name before a trailing parenthetical trip description.

## Verification and release boundary

New regression tests cover the limiter, packing route, fallback order, geocoding, and browser API behavior. A synthetic, non-personal two-day Seattle itinerary succeeded through the configured OpenAI path. Local verification: 543 tests passed, zero failed; the frontend production build passed. The build reported pre-existing dependency audit findings, which were not upgraded as part of this incident fix. This branch is local until a reviewed push/merge and production deployment are authorized.
