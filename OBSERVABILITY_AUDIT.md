# SproutRoute observability audit

Audited 2026-10-30 against `origin/main` at `08c1527` (worktree `strollerscout-audit`, branch `audit/observability`). Nothing has been changed except this file. iOS code is from `~/VS Code Projects/sproutroute-ios` at `86f78b5`.

Services scored separately: backend (Express on Railway), web frontend (React), iOS app (SwiftUI), Expo mobile (`mobile/`, scaffold).

Scale assumed: one developer, one Railway replica, low traffic. "Later" means later for that reason.

## Implementation status (2026-10-30)

Everything below is on `main` and deployed: backend and web in `db3daa8` and `447e81b`, iOS in `240a020`. Railway reported the deploy as successful and production was probed afterwards (readiness route, `X-Request-Id`, v1 error envelope). `npm test` passes 816 of 816 (baseline was 766) and `vite build` succeeds. The iOS suite passes 380 of 380. The scorecard, journey table and gap plan further down describe the state before these changes.

| # | Item | Status | Where |
| --- | --- | --- | --- |
| 1 | v1 error paths log name, code and stack | Done | `server.js` (9 `log.error` calls), `logger.js` `errorFields` |
| 2 | Process and Express error handlers | Done | `utils/errorHandler.js`, `utils/processHandlers.js`, wired in `server.js` |
| 3 | Swallowed catches on the main path | Done | `stream:schedule-failed`, `parse-input:geo-failed`, `multi-stop:schedule-failed`. The `res.end` catches are left alone on purpose. |
| 4 | Web PostHog consent | Done | `analyticsConsent.js`, `AnalyticsConsent.jsx`, `analytics.js` no longer loads PostHog without a "granted" choice; `privacy.html` sentence updated. iOS was already opt-in. |
| 5 | One request id | Done | Assigned before the body parser, equal to the tracer run id, returned as `X-Request-Id`, used as `requestId` in v1 responses, added to every log line through `AsyncLocalStorage` |
| 6 | Railway settings | Done | `healthcheckPath=/api/health`, `healthcheckTimeout=60`, `drainingSeconds=10` on production. Deploy-failure alerts use Railway's built-in email notifications (Account Settings) because there is no Slack or Discord target for a webhook. That toggle is the owner's to confirm. |
| 7 | Readiness check | Done, with a change | `/api/health/ready` checks Supabase (2 s timeout, 503 on failure). `/api/health` stays a cheap liveness route so a database blip cannot fail a deploy. |
| 8 | 5xx alert | Done | `aiAlerts.recordResponse`: 5 server errors in 5 minutes (`HTTP_5XX_ALERT_THRESHOLD`), then a 30 minute cooldown |
| 8b | Alert email | Done | Alerts (5xx, daily spend, provider credits) also email through Resend when `RESEND_API_KEY` and `ALERT_EMAIL_TO` are set. Sender defaults to `onboarding@resend.dev`, which Resend delivers only to the account owner's address. `scripts/send-test-alert.mjs` sends a test through the production variables (`railway run -s SproutRoute -e production node scripts/send-test-alert.mjs`); Resend accepted one on 2026-10-30. |
| 9 | iOS journey id | Done | `beginJourney()` called at the start of each submission; `X-Journey-Id` on every request; failed requests log `requestId` |
| 10 | Langfuse gaps | Done, one part open | Reasoning tokens exported as `output_reasoning_tokens`; `completed` score posted per eval trace (`scripts/lib/langfuseScore.mjs`); SIGTERM flush added. Reasoning text is not captured: it needs thought summaries turned on per provider, which changes requests and cost. |
| 11 | Candidate set logging | Done | `attractions:candidates` (name, category, status, capped at 20) in `loadCachedAttractionsForTrip`, covering plan, bundle, stream and replan |

Open points:

- The consent banner was checked in a browser on sproutroute.app on 2026-10-30. The first version had an invisible Allow button (`bg-sprout-green` is not in the Tailwind config, so the button was white on white). Fixed in `542374d`, with a test that checks every `sprout-*` class against the config. After the fix: no PostHog request before a choice or after "No thanks", PostHog loads and sends events after "Allow", and the stored choice survives a reload.
- Two third-party hosts still load before any consent choice: Google Fonts (`fonts.googleapis.com`, `fonts.gstatic.com`) and the Cloudflare Web Analytics beacon (`static.cloudflareinsights.com`, injected by Cloudflare). Neither is PostHog, and they were outside this audit's first pass. Whether they are acceptable under the no-third-party-without-consent rule is the owner's call. Fonts can be self-hosted; the beacon is a toggle in the Cloudflare dashboard.
- The `completed` score was checked against production on 2026-10-30. One eval case (`parse-vegas-explicit`) produced a BOOLEAN `completed` score on its trace. Writing stays on `POST /api/public/scores`. Reading scores back needs `GET /api/public/v3/scores`: the v2 read is unavailable to this Langfuse organization, and Langfuse removes legacy endpoints on 2026-11-16. Nothing in the repo reads from a legacy endpoint.
- A stream that fails after its 200 status line does not count toward the 5xx alert. Those failures are logged as `stream:error`.
- Alert email uses the Resend test sender. Sending from a project domain, or to anyone but the account owner, needs a verified domain and `ALERT_EMAIL_FROM`.
- Items under "Later or skip" are unchanged.

## Scorecard: backend

| Level | Rating | Evidence | If it breaks at 2 AM |
| --- | --- | --- | --- |
| 1 Logs | Partial | JSON logger `src/backend/utils/logger.js`; `req:start` and `req:end` for every `/api` request (`server.js:464-477`); stream and parse steps logged. But `devLog` is a no-op when `NODE_ENV=production` (`server.js:414-418`) and the catch blocks of 9 `/api/v1/*` routes log only through it (`server.js:1286, 1444, 1594, 2056, 2141, 2208, 2267, 2297, 2329`). None of the 40 `log.error`/`log.warn` calls include a stack, error name or code. 16 empty or no-op catches (`server.js:1891, 1946, 1958, 1959, 2384`; `metrics.js:35`; `multiStopPlanner.js:173`; `fetchUtils.js:60`). | A 500 on `/api/v1/trip/plan` leaves one line, `req:end status=500`. We would know it failed, not why. |
| 2 Metrics | Partial | `services/metrics.js` keeps 200 recent events in memory and writes `trip_metrics` rows to Supabase (request, trip, AI call, latency). Read through `/api/v1/ops/metrics` and `/ops`. No error-rate or p95 view over time, no alert on it. Railway metrics are not used. | We could see yesterday's trip count and AI latency in `/ops`. We would not see a rising error rate until we looked. |
| 3 Traces | Present for timing, Partial for diagnosis | `services/tracing.js` records a payload-free span tree per request, with `X-Trace-Id` returned; `tracedFetch` wraps 9 outbound services. Langfuse eval capture (`evalCapture.js`) records full prompts and outputs but only for token-bearing synthetic requests. The in-memory ring holds 100 traces. `TRACE_ARCHIVE_PATH` is optional and Railway has no volume mounted (`describe-environment`: `volumes: []`), so traces vanish on every deploy. | We can see where a slow request spent time if we look before the next deploy. A real user's failed trip leaves no prompt or output anywhere, by design. |
| 4 Correlation | Partial, broken across IDs | Five unrelated IDs: `req.reqId` (8-char, `server.js:468`), per-route `requestId` UUIDs minted in each v1 handler (22 sites, returned to clients but never logged), tracer `X-Trace-Id`, client `X-Journey-Id`, Langfuse trace id. Only the last two are linked (`meta.eval_trace_id`). `reqId` reaches only the stream and parse logs. `ai:call` and `AI call failed` lines (`aiClient.js:413-444`) and all weather, places and geocoding warnings carry no `reqId`. Only 1 file outside `server.js` and `logger.js` uses it. | A user reports an error id from the app. We cannot find the matching Railway log line, and an AI failure cannot be tied to the request that caused it. |
| 5 Alerts | Partial | `services/aiAlerts.js` alerts on daily AI spend and provider 401/402 failures, through `AI_ALERT_WEBHOOK_URL` (variable is set in production; its target was not read). Nothing for 5xx rate, crash loops, deploy failure or downtime: no Railway webhooks (`list-webhooks: []`), CI has no notifier (`.github/workflows/*.yml`), no uptime check, no Sentry. | An outage, crash loop or failed deploy is found by a user. AI spend and key failures are caught, which is the failure that actually happened on 2026-10-23 to 27. |
| 6 SLOs | Absent | Searched `docs/`, `README.md`, `AGENTS.md`, `src/` for slo, sli, objective, error budget: only the eval rubric exists, which scores output quality, not availability or latency. | No agreed definition of "broken" for trip generation. |
| 7 Cardinality | Present | `safeDetail` in `tracing.js:9-25` allows only fixed-vocabulary keys; labels are route templates, not URLs (`tracing.js` middleware); metrics rows keep `req_id` and destination as columns, not labels. No Prometheus-style metrics exist to bloat. | Nothing to fix. |

Other backend findings:

- No Express error middleware and no `unhandledRejection` or `uncaughtException` handler (searched `src/` for `process.on`, `unhandledRejection`, `(err, req, res, next)`: no hits). An uncaught async error crashes the process on Node 22 with an unstructured stderr trace, and Railway restarts it.
- No SIGTERM handler, so `evalCapture.shutdown()` and in-flight metric inserts are never flushed on redeploy.
- `/api/health` (`server.js:554`) returns a constant. It does not touch Supabase or any provider. Railway's service config shows no `healthcheckPath`.
- Error tracking: absent. Searched all JS, TS, Swift and `package.json` for sentry, bugsnag, rollbar, datadog, honeybadger, newrelic, crashlytics, logrocket.
- Retrieval visibility is thin: `stream:attractions` logs only a count (`server.js:1863`); `trip-plan:grounding` logs matched ratio (`tripPlanAI.js:671`). The candidate set is never logged, so a bad itinerary cannot be sorted into retrieval miss, noisy context or corpus gap from production logs.
- AI calls: model, provider, latency, success, tokens and cost are recorded (`aiClient.js:413-433` into `metrics.recordAiCall`, plus Langfuse for eval runs). Reasoning tokens are not broken out; Gemini thinking tokens are summed into output.

## Critical journey: trip stream (`POST /api/v1/trip/stream`)

| Step | Visible today | Blind spot |
| --- | --- | --- |
| Request in | `req:start` and `req:end` with `reqId`; tracer root span with `X-Trace-Id` | `reqId` and `X-Trace-Id` are different IDs |
| Input | `stream:input` (counts, destination, dates; no names or free text) | none |
| Weather, geocode, places | `http.dependency` spans with status and timing | failure warnings have no `reqId` |
| Attraction candidates | count only (`stream:attractions`) | candidate set and why items were chosen or dropped |
| AI itinerary | `ai:call` line plus `trip_metrics` row; Langfuse only for eval runs | no `reqId` on the line; failures fall back to another provider with a warning that cannot be tied to the request |
| Grounding check | matched ratio per destination | no `reqId`; unmatched names logged but not tied to the request |
| Stream end | `stream:done` with timings; on failure `stream:error` with message only | no stack; client disconnects and `res.end` failures are swallowed (`server.js:1946-1959`) |
| Client side | web sends `X-Journey-Id` and browser milestones; iOS sends neither | iOS requests cannot be joined to a journey |

## Free tooling not in use

- Railway: deploy-failure notifications and webhooks (none configured), a `healthcheckPath` for the service, per-service CPU, memory and HTTP error and latency graphs, log search on the JSON fields already emitted.
- Supabase: project logs and the security and performance advisors (not checked in this audit).
- Cloudflare (sproutroute.app is proxied; `CF_ORIGIN_SECRET` is set): traffic and error analytics. Whether its notification features are available depends on the plan, which was not checked.
- Apple: crash and hang reports in App Store Connect and Xcode Organizer for the iOS app, and MetricKit (0 uses in the Swift sources).
- GitHub Actions: failure emails already go to the repo owner; a scheduled smoke job could reuse `scripts/verify-trip-hub-production.mjs` (the `smoke:trip-hub` script exists).

## Scorecard: other services

| Service | Logs | Errors | Correlation | Notes |
| --- | --- | --- | --- | --- |
| Web frontend | Absent | Absent | Partial | One `console.error` in `PackingChecklist.jsx:90`; no error boundary, `window.onerror` or `unhandledrejection` handler (searched `src/frontend/src`). Sends `X-Journey-Id` (`services/journeyTrace.js`). |
| iOS | Partial | Absent | Absent | `OSLog` `Logger` in `APIClient.swift` (6 calls) and `TripPlanner.swift` (8), with `privacy: .public` on error fields. 36 `try?` calls discard errors. No request or journey header sent (only `Accept`, `Content-Type`, `User-Agent`, and `AnalyticsService` headers). No MetricKit. |
| Expo mobile | Absent | Absent | Absent | No logging, error boundary or tracker found under `mobile/` (excluding `node_modules`). Scaffold stage, so low priority. |

## Secrets and PII

- No API key, token or JWT patterns in tracked files (`git grep` for `sk-ant-`, `AIza`, `sk-lf-`, `pk-lf-`, JWT shape: no hits).
- Logs carry destination, dates, counts, a text-length bucket (`privacyTelemetry.js` `parserLogContext`) and an 8-character user id prefix. No request bodies, headers or free text are logged.
- Langfuse capture masks key-shaped strings (`evalCapture.js` `SECRET_PATTERNS`) and runs only with the eval token.
- Not top-severity, but needs your decision: web PostHog initializes on page load in production with autocapture on and no consent step (`analytics.js:23-34`, `analyticsConfig.js`; no "consent" hits in `src/frontend/src`). That conflicts with your rule that nothing third-party loads without consent. iOS has an in-app analytics toggle (`SettingsView.swift`); its default was not checked.

## Gap plan

### Do now

| # | Fix | Effort |
| --- | --- | --- |
| 1 | Replace `devLog` in the 9 v1 catch blocks with `log.error` including `reqId`, error name, code and stack (truncated). | S |
| 2 | Add `process.on('unhandledRejection' / 'uncaughtException')` handlers that log structured JSON, and an Express error middleware that logs and returns the v1 error envelope. | S |
| 3 | Replace swallowed catches on the main path (`server.js:1891, 2384`; `multiStopPlanner.js:173`) with a `log.warn` carrying `reqId`. Leave the genuinely ignorable ones (`res.end` after close). | S |
| 4 | Decide on web PostHog consent: gate `posthog.init` behind an explicit opt-in, or confirm the current behavior is intended and the privacy page matches it. | S to M |

### Do next

| # | Fix | Effort |
| --- | --- | --- |
| 5 | One ID per request: have the request middleware reuse the tracer run id as `reqId`, return it as `X-Request-Id`, use it as `requestId` in v1 responses, and let the logger read it from the tracer's `AsyncLocalStorage` so `ai:call` and dependency warnings get it without threading arguments. | M |
| 6 | Railway: set `healthcheckPath`, add a deploy-failure webhook to the same Slack or Discord target as `AI_ALERT_WEBHOOK_URL`, and turn on the built-in CPU, memory and HTTP error graphs. | S |
| 7 | Make `/api/health` check Supabase with a cheap query, with a short timeout and no provider calls. | S |
| 8 | Alert on 5xx rate: reuse `aiAlerts` with a rolling count of 5xx responses per window. | M |
| 9 | iOS: send `X-Journey-Id` and read `X-Request-Id` back into the `Logger` error lines. | S |
| 10 | AI tracing gaps from the Langfuse review: reasoning tokens, scores written to Langfuse, SIGTERM flush of the Langfuse processor. | M |
| 11 | Log the attraction candidate ids and scores per stream request (ids only, capped) so a bad itinerary can be classified. | M |

### Later or skip

| Item | Why it is fine to wait |
| --- | --- |
| Sentry or similar for web and backend | Items 1, 2 and 6 cover the same failures for now. Revisit when there is more than one developer or real traffic, and only with a consent decision (item 4). |
| Formal SLOs | Write one line each for trip-stream success and p95 once item 8 gives a number to compare against. |
| Durable trace archive volume | Real-user traces are payload-free by design; a Railway volume costs money for little diagnostic value. |
| Prometheus, OpenTelemetry for the runtime tracer | Current tracer already answers "where did time go". |
| Expo mobile instrumentation | Scaffold only; add when it ships. |
| MetricKit on iOS | Useful after the App Store release has users; App Store Connect crash reports cover launch. |
