# Eval traces in Langfuse

SproutRoute has two kinds of tracing, and they are deliberately different.

- **Runtime tracing** (`services/tracing.js`, see `TRACE_EVIDENCE.md`) runs for every request and records no prompts, answers or trip details. It answers "is the app healthy?".
- **Eval capture** (`services/evalCapture.js`, this doc) records everything a reviewer needs to score a trace against the rubric: the trip request, every model prompt and answer, tool results, fallbacks and the final plan. Because it records content, it only runs for synthetic golden-set requests that carry the eval token. Real users are never captured.

## How a request gets captured

All four have to be true, otherwise the request is handled normally and nothing is sent to Langfuse:

1. `EVAL_CAPTURE_ENABLED=true` on the backend.
2. `EVAL_CAPTURE_TOKEN` is set (32+ characters) and the request sends the same value in the `x-eval-capture` header. A wrong token is treated exactly like no token.
3. `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY` and `LANGFUSE_BASE_URL` (or the older `LANGFUSE_HOST`) are set.
4. The backend runs on Node 22 or newer (the Langfuse v6 SDK needs it). `engines` in `package.json` asks for 22, which is what Railway reads to pick its Node version, and CI runs on 22 so the SDK tests are not skipped. If the running Node is older, capture stays off and the log says why.

The Langfuse SDK is only loaded once the first eval request arrives. Anything shaped like an API key is masked before export, as a backstop for rubric line G2.

## Running the golden set

```
openssl rand -hex 32   # once, then save it as EVAL_CAPTURE_TOKEN in Railway
```

```
EVAL_CAPTURE_TOKEN=<same value> node scripts/run-eval-traces.mjs --base=https://<backend> --client=web --confirm-spend
EVAL_CAPTURE_TOKEN=<same value> node scripts/run-eval-traces.mjs --base=https://<backend> --client=ios --confirm-spend
```

Each run sends ten made-up cases (three free-text parses, seven trips). A trip is several calls, so each case sends the calls its client makes, in order, under one journey id (`scripts/eval-cases.mjs` lists them):

| Client | Calls for a trip |
| --- | --- |
| `web` | `trip/stream`, then `trip/packing`, then `safety/car-seat-check` if the family has children and `safety/pet-travel-check` if it has pets |
| `ios` | `trip/stream`, then `safety/pet-travel-check` if the family has pets. The iOS app packs on the device and never calls packing, car seat or bundle |

If the stream step fails, the later steps are skipped, as a client would. Both runs call real models (the web run also generates a packing list), so each spends provider credit and counts toward the hourly AI rate limit. Use `--only=<case-id>` to rerun one case. Each call prints its journey id and Langfuse trace id.

## What a trace looks like

| Observation | Type | What's in it |
| --- | --- | --- |
| `trip-stream`, `trip-bundle`, `trip-parse-input` | chain (root) | Input: the trip request. Output: what the client received (for streams, grouped by event). Metadata: route, HTTP status, stream event order. |
| `tool.*` (geocode, weather, places, safety, plan) | tool | Arguments and result of each step. |
| `generate.<caller>` (tripPlan, parseInput, packingList, ...) | generation | System and user prompt as messages, the raw answer, model, token usage and cost, attempt (`primary`, `fallback-1`, ...), and whether validation `passed` or was `rejected`. |

Every trace is tagged `eval`, `client:web` or `client:ios`, `case:<id>`, `run:<label>` and `step:<name>`, and the case's main rubric lines are in trace metadata (`rubric_lines`). Environment is `eval`, so these never mix with production dashboards. Release is the deployed commit.

## Following one trip across calls

- **Session = journey.** The runner sends `X-Journey-Id` (32 random hex characters, one per case) on every call, the same header the web app sends for each trip submission. The backend uses it as the Langfuse session, so the parse, stream, packing and safety calls of one trip appear together. Each call is still its own trace, tagged with its `step`. Without a valid journey id the run label is the session, as before.
- **Two ids point at each other.** An eval response carries `X-Langfuse-Trace-Id`. The Langfuse trace metadata has `runtime_trace_id` (the `X-Trace-Id` of the payload-free runtime trace at `/ops`), and that runtime trace records `eval_trace_id` and `journey_id`. Either id finds the other. The runtime trace still holds no prompts or answers.
- The MCP orchestrator's `agent_runs` traces are a separate system and are not linked yet.

## Where each rubric line is read

| Line | Look at |
| --- | --- |
| O1 Destination and constraints kept | Root input vs `generate.parseInput` output and the final plan |
| O2 Complete, parseable itinerary | Root output; `generate.tripPlan` with validation `passed` |
| O3 Real, in-area places, no unsupported open or pet-friendly claims | Plan in root output vs `tool.enrichActivity` and places results |
| O4 Usable plan after a recoverable provider failure | A `fallback-N` generation followed by a root that isn't an error |
| T1 No destination question when one was given | `trip-parse-input` output: destination resolved, no follow-up question |
| T2 Attempts and fallbacks visible, invalid output not counted as success | Each rejected generation is marked ERROR with its reason |
| T3 Bounded recovery, stream doesn't contradict itself | Generations per caller; stream event order |
| X1 Latency and honest progress | Trace duration; stream event order |
| X2 Readable and actionable for a parent | Human read of the root output |
| G1 No invented safety or legal rules | Safety tool output vs what the plan says |
| G2 No real user data, no credentials | Capture gate plus masking; spot-check inputs |
| G3 Spend caps enforced in code | Cost per generation and per session (the cap itself is tested in code) |

To score, create one boolean score config per line in Langfuse, named by its ID (O1 to G3), and score traces from the trace view or an annotation queue. Hand-score about ten traces before automating any LLM judge.

## Limits

- Only the backend is traced. The iOS app's on-device recap never reaches the server, so it isn't in these traces.
- The native iOS app does not send `X-Journey-Id` yet, so real iOS sessions cannot be joined the way the web app's can; only the runner's ios run is. Adding the header to the app is a separate change in the iOS repo.
- Eval traces contain only the synthetic cases in the runner. Don't send real trips with the eval token.
