# SproutRoute AI eval: the fastest reliable itinerary

*Exploratory synthetic evaluation, updated September 26, 2026. Includes the paid OpenRouter screen and a direct-provider recovery pilot.*

## The product decision

SproutRoute turns a family's free-text request into a usable trip plan. We want the lowest latency **among systems that meet the product's quality and safety bar**. If the first model or provider fails, a slower valid itinerary is better than a quick error or a polished but unusable partial result. This is an end-to-end system objective, not a model leaderboard.

The web path parses the request, resolves the destination, streams weather and itinerary results, and fetches packing and safety information in the background. Some of those steps are deterministic. The live web packing path, for example, does not need a language model. Evaluating every component as though it were an interchangeable AI call would obscure the actual reliability question.

Our evidence includes a small direct-provider pilot, paid OpenRouter calls on synthetic trips, and ten runs through the updated generation/recovery code. These measure structure, latency, recovery behavior, and, for the OpenRouter screen, billed model charges. They do **not** establish production trip-completion rate or venue truth. We shipped validation-triggered recovery and the explicit-destination guard in [PR #26](https://github.com/prasadnitish/SproutRoute/pull/26). The [release record](2026-09-26-recovery-release.md) separates that change from the earlier first-attempt screens.

## The evaluation contract

We adapted Calibre Labs' [AI PRD template](https://github.com/Calibre-Labs/reforge-ai-evals/blob/main/rubric-templates/ai-prd-template.md) and its four-part rubric—Outcome, Trajectory, Governance, and Experience—to a family trip planner. The [Corner consumer trace](https://claude.ai/artifact/PBvMFLueCm7iRK4cQYQXQZ) is a reminder that unnecessary questions and undisclosed substitutions can be hidden behind an apparently successful final message. The [Ledger trace](https://claude.ai/artifact/Qgsm4E3GC3w2xRnfmX9Dv5) shows why source-dependent claims need an auditable path, not just plausible prose. Those examples motivate our rubric; their specific rules and thresholds do not transfer to travel planning. The [Calibre article](https://blog.calibrelabs.ai/p/an-eval-rubric-that-drives-your-ai) recommends revising a v1 rubric after inspecting diverse traces.

| Template element | SproutRoute adaptation |
| --- | --- |
| Product, user, jobs | A parent requests a trip in natural language and expects an actionable, family-appropriate itinerary without re-entering known details. |
| Tool surface and autonomy | Parsing, geocoding, weather, model generation, and Places enrichment are read or draft actions. The app does not book travel or make purchases. Safety/legal guidance has a stricter evidence boundary than general suggestions. |
| Golden dataset | Explicit and ambiguous destinations, varied family/pet constraints, longer trips, international requests, malformed model output, and injected provider failures. Keep expected outcomes and source evidence separate from the prompts. |
| Eval rubric | Score the final plan **and** the trace using the four dimensions below. Critical checks are not averaged away by pleasant prose. |
| Release thresholds and rollout | Set numerical gates after baseline measurement; test pinned models first, then fallback policies, then a small canary. A passing single trace is not a launch decision. |

### Rubric v1

Each criterion has an observable check. `D` is deterministic; `H` requires human review or an independently verified source. An LLM judge may help triage subjective failures but is not the source of truth for venue or legal facts.

| ID | Dimension | Pass condition | Check |
| --- | --- | --- | --- |
| O1 | Outcome | An explicit destination such as “Las Vegas” is preserved, with no destination-choice interruption; a genuinely vague request offers appropriate choices. Traveler, date, pet, and dietary constraints are retained. | D, with labeled input cases |
| O2 | Outcome | A complete, parseable itinerary covers the requested days; activity references resolve; days are not empty, repetitive, or internally contradictory. | D, then H for usefulness |
| O3 | Outcome | Recommended places are real, in the relevant area, and not presented as open, bookable, or pet-friendly without evidence. Travel time and family suitability are plausible. | H plus Places/geographic evidence |
| O4 | Outcome | After a recoverable model/provider failure, the user still receives a complete usable itinerary rather than an indefinitely loading screen or success-shaped partial plan. | D with fault injection; H for usability |
| T1 | Trajectory | The system does not ask the user to choose a destination already supplied. Ambiguity prompts are limited to missing decisions that matter. | D on parse/UI trace |
| T2 | Trajectory | Attempts, model/provider identity, validation failures, retries, and fallback reasons are visible in the trace; invalid output is not counted as a successful trip. | D on trace and final state |
| T3 | Trajectory | Recovery is bounded by a total user-facing budget while reserving time for a different failure domain; streamed results do not contradict or silently erase earlier content. | D with timeout/SSE fault injection |
| X1 | Experience | First useful feedback and the complete itinerary arrive within measured latency distributions; progress and delayed/fallback states are honest. | D timing plus H review |
| X2 | Experience | The plan is readable and actionable for a parent; necessary caveats are concise, and an error explains what can be retried. | H, blinded to model |
| G1 | Governance | Safety and legal claims do not invent rules or imply source verification that did not occur. Jurisdiction-specific rules require the appropriate official source and human review before a release change. | D source linkage plus H review |
| G2 | Governance | Benchmark inputs contain no real user profile or private trip data; provider routing complies with the chosen data policy and does not expose credentials in traces or the report. | D review of fixtures, routing, logs |
| G3 | Governance | Per-run spend caps, request limits, and escalation behavior are enforced in code or account settings—not delegated to a model response. | D configuration review |

The most important vetoes are O1 for explicit destinations, O2 for usable structure, O4 for recoverable failures, and G1–G2 for safety and privacy. O3 needs independent venue evidence before we claim itinerary accuracy. We will publish criterion-level results and failure examples, not only a weighted average.

## What the exploratory test showed

We ran a local, synthetic-only comparison against the then-deployed source commit [`1b9ba8c`](https://github.com/prasadnitish/SproutRoute/commit/1b9ba8cc11cb63b2f04417a066c5585e85e04902). The [runner](../../scripts/benchmark-luna.mjs) uses production prompts for parsing, travel safety, and itinerary generation and a 4,200-completion-token cap for two-day itineraries. The legal case uses invented official-source text, and offline attraction generation uses a shorter proxy prompt. The figures below are first-attempt structural scores; the full case definitions and limitations are in the [exploratory benchmark record](2026-09-25-luna-all-tasks.md).

| Task | Current comparator | Comparator | GPT-6 Luna (`low`) |
| --- | --- | --- | --- |
| Trip parse | GPT-5.4 nano | 6/6 pass; 3.5s median | 6/6; 4.7s median |
| Two-day itinerary | Gemini 3.8 Flash | 3/4; 17.9s median | 4/4; 20.0s median |
| Two-day itinerary fallback | GPT-5.4 nano | 3/4; 14.4s median | 4/4; 20.0s median |
| Travel safety | Claude Haiku 4.5 | 4/4; 3.8s median | 4/4; 5.1s median |
| JSON repair | Claude Haiku 4.5 | 2/2; 1.1s median | 2/2; 1.6s median |
| Synthetic law extraction | Claude Haiku 4.5 | 2/2; 3.1s median | 2/2; 3.8s median |

Both comparator itinerary failures were token-truncated JSON, not proven end-to-end failures: the app may recover on retry or repair. Four successful Luna itinerary calls are nowhere near enough to establish a reliability advantage. The parser's explicit Las Vegas case produced no suggestions in this small test, but a separate UI condition at that snapshot showed suggestions whenever any were present, even when the destination was populated. PR #26 fixes this with parser and UI guards. The test did not verify whether venues exist, are open, fit the geography, or accept pets. Successful Luna itinerary model charges were approximately $0.0013–$0.0016 per two-day request; this is **not** a full-trip cost and excludes failed calls and other services.

The experiment also exposed a configuration prerequisite: the pre-release OpenAI call shape sent `temperature: 0`, which GPT-6 Luna rejected with HTTP 400. Luna needed that field omitted and `reasoning_effort: "low"` in our test. An environment-variable-only model swap is therefore not a valid rollout.

### Static reliability findings, not incident measurements

Code inspection shows why the follow-up must run the whole system. The AI client gives primary and fallback attempts one shared deadline, so a slow primary can leave no time for backup. Its provider fallback is entered on a request error; structurally invalid output is handled later by the itinerary retry/repair path and does not itself invoke a different provider. The itinerary path can also return a “best-effort” repetitive plan after a quality retry. These are test hypotheses and improvement targets, not measured production failure rates. Likewise, the Las Vegas picker condition needs a deterministic UI guard regardless of model selection.

## OpenRouter: market scan, candidates, and routing experiments

The original six-model list was a starting sample, not a claim that we had found the best models. On September 25, 2026, we refreshed the [OpenRouter model catalog](https://openrouter.ai/api/v1/models), [Artificial Analysis' cross-model quality/speed measurements](https://artificialanalysis.ai/leaderboards/models), [Arena's human-preference and instruction-following rankings](https://arena.ai/leaderboard/text/instruction-following), and [OpenRouter's usage rankings](https://openrouter.ai/rankings). These sources nominate candidates; none measures SproutRoute's destination handling, venue truth, safety, or end-to-end completion. OpenRouter explicitly says its usage ranking is traffic, **not** accuracy. Model version and reasoning effort must be pinned; a family name or a leaderboard score is not a reproducible experiment.

The selection funnel is: current production baselines; models with usable text/JSON output, adequate output limits, published rates, and available endpoints; distinct model/provider families for failure recovery; and at least one current external quality, speed, adoption, or recency signal. We then use SproutRoute's task rubric to qualify models. Newness and popularity are reasons to **screen**, never reasons to deploy. Catalog rates below are US dollars per million input/output tokens as read on September 25, 2026, **not** observed cost per trip. All listed catalog entries advertised `response_format` and `structured_outputs`; actual enforcement must be checked with a negative-control request. Re-snapshot availability, endpoint policy, and prices before paid inference.

| Lane | Candidate | Catalog input/output $/M | Nomination reason; not a task result |
| --- | --- | ---: | --- |
| Fast/current | `openai/gpt-6-luna` | $0.10 / $0.50 | Extends our small direct-provider pilot at pinned `low` effort. |
| Fast/current | `google/gemini-3.8-flash` | $0.75 / $3.75 | Current itinerary comparator; strong recent external instruction-following signal. |
| Fast/current | `deepseek/deepseek-v4.1-flash` | $0.14 / $0.42 | Newer than V3.2; strong external speed/quality signal and high OpenRouter adoption. |
| Fast/current | `z-ai/glm-5.3-flash` | $0.04 / $0.50 | Strong external quality signal at low catalog price; another model family. |
| Fast/current | `qwen/qwen3.8-flash` | $0.15 / $0.47 | Current affordable Qwen-family candidate; do not equate it with the separately scored *Flash-Next* variant. |
| New wildcard | `xiaomi/mimo-v2.6-flash` | $0.14 / $0.28 | Very recent, rapidly adopted; weaker independent task evidence, so screen before full evaluation. |
| Quality anchor | `qwen/qwen3.8-max-0902` | $2.00 / $6.00 | Strong external quality signal from a non-incumbent family; price/latency make it a possible escalation, not a default. |
| Quality anchor | `anthropic/claude-sonnet-5` | $2.00 / $10.00 | Independent higher-quality fallback candidate to test when a fast model fails validation. |
| Quality anchor | `anthropic/claude-opus-5.5` | $4.00 / $20.00 | More expensive Anthropic fallback to test only if cheaper independent routes fail the itinerary gate. |
| Quality anchor | `openai/gpt-6-sol` | $2.00 / $10.00 | Measures the quality ceiling for our Luna comparison; same model provider, so not cross-provider redundancy. |
| Speed probe | `inception/mercury-2.5` | $0.04 / $0.15 | Extremely fast externally, but substantially lower general-quality score; try parse/repair only unless it clears the itinerary gates. |

Retain the direct GPT-5.4 nano path as a baseline and Claude Haiku 4.5 as the current safety/repair comparator. The earlier DeepSeek V3.2, Qwen3.5 35B, and Mistral Small 2603 candidates move to reserve rather than consuming the first $25 screen. This is not a verdict that they are worse on our tasks. Exclude opaque/stealth model aliases from the primary comparison because identity, version stability, and failure-domain independence cannot be audited reliably.

### Paid synthetic results

We sent 56 sequential requests in the [fast-candidate screen](2026-09-25-openrouter-fast-screen.jsonl): three parse cases, two two-day itineraries, two safety cases, and one JSON repair per model. We reused SproutRoute's task prompts and current 4,200-token two-day itinerary cap. The runner pinned a serving endpoint, required JSON-capable parameters, and kept provider fallback off to separate model behavior from routing recovery. OpenRouter billed $0.079 for the 48 completed model responses. Four requests returned HTTP errors and four timed out. We scored those eight as request failures, not as inaccurate model outputs. The remaining pass counts are structural checks; they do not establish venue accuracy.

| Model | Parse | Itinerary | Safety | Repair | Main failure observed |
| --- | ---: | ---: | ---: | ---: | --- |
| GPT-6 Luna (`low`) | 3/3 | 2/2 | 2/2 | 1/1 | None in this small set |
| Gemini 3.8 Flash (default effort) | 2/3 | 1/2 | 1/2 | 1/1 | The dog-trip JSON exceeded the 4,200-token cap |
| DeepSeek V4.1 Flash | 0/3 | 0/2 | 0/2 | 0/1 | Reasoning used the full itinerary token cap |
| GLM 5.3 Flash | 0/3 | 0/2 | 0/2 | 1/1 | Both itinerary calls timed out at 90 seconds |
| Qwen 3.8 Flash | 0/3 | 0/2 | 0/2 | 1/1 | Three 429s and one itinerary timeout |
| MiMo V2.6 Flash | 2/3 | 0/2 | 2/2 | 1/1 | One invalid itinerary JSON and one timeout |
| Mercury 2.5 | 0/3 | 1/2 | 0/2 | 1/1 | One invalid itinerary JSON; weak parse/safety results |

The first-party DeepSeek endpoint conflicted with the account's existing model-training privacy rule. We left that rule in place and used a pinned DeepInfra endpoint for DeepSeek's measured rows. The earlier 404 on the excluded first-party endpoint and a separate 404 caused by a price ceiling below the cheapest JSON-capable GLM endpoint are routing findings, not model-quality scores. Endpoint-level pricing and parameters mattered more than the catalog headline rate.

Output caps changed the result. Gemini's failed dog-trip call produced 4,094 completion tokens, including 1,848 reasoning tokens, and stopped at `length`. A separate [8,000-token Gemini run](2026-09-25-openrouter-gemini-8k-trip.jsonl) passed both two-day structures with default reasoning, at 14.2 and 19.5 seconds. Qwen Max's default-effort parse truncated at 1,200 tokens; [low effort](2026-09-25-openrouter-qwen-low-parse.jsonl) recovered the explicit Las Vegas case but finished only 1/3 parse cases. Sonnet 5 returned two parseable but too-thin itineraries in a [low-effort repeat](2026-09-25-openrouter-sonnet-sol-trip.jsonl). GPT-6 Sol passed both, but costs about $0.022 and $0.029 per itinerary and shares OpenAI as a failure domain with Luna. Qwen Max timed out on its first low-effort itinerary, so we stopped that arm instead of repeating a 90-second failure.

We then tested three candidates on Las Vegas, San Diego with a dog, and a five-day Tokyo family trip with a separately labeled 12,000-token cap and `low` reasoning effort. The [raw tuned run](2026-09-25-openrouter-long-trip-12k-low.jsonl) includes model, serving provider, tokens, finish reason, and billed cost for each case.

| Itinerary model | Structural passes | Median latency | Total billed for three | Mean cost per valid output |
| --- | ---: | ---: | ---: | ---: |
| Gemini 3.8 Flash, Google AI Studio | 3/3 | 10.8s | $0.0388 | $0.0129 |
| GPT-6 Luna, OpenAI | 3/3 | 24.2s | $0.0055 | $0.0018 |
| Claude Opus 5.5, Anthropic | 3/3 | 34.5s | $0.2668 | $0.0889 |

The three Tokyo outputs each covered five days with the required activity structure. Luna took 38.2s/$0.0025, Gemini 19.0s/$0.0191, and Opus 55.5s/$0.1266. This is a three-case comparison, not a measured failure probability. We did not verify opening hours, pet access, geography, or whether a family would choose these activities.

We also ran one synthetic legal-source extraction per finalist; [all three passed](2026-09-25-openrouter-synthetic-law.jsonl). The test used invented statute text and says nothing about real jurisdictional accuracy. One attraction-precompute case passed structurally for [Luna and Gemini](2026-09-25-openrouter-precompute.jsonl) and [Opus](2026-09-25-openrouter-opus-other.jsonl): 40.1s/$0.0034, 25.7s/$0.0275, and 85.7s/$0.2238. We have not verified that the 20-plus places in any list currently operate. Opus's other task results were 2/3 parse, 2/2 safety, and 1/1 repair. The full paid experiment, including pilots, repeats, and interrupted arms, consumed $1.11 on the dedicated key at the last account readback; a $20 key limit remained in force.

The paid model screens used `provider.only`, `allow_fallbacks: false`, and `require_parameters: true`. The next evaluation should compare **routing policies** as systems; the September 26 pilot below covers the generation portion of the first two:

1. Current direct-provider path, including its real retries and UI/SSE behavior.
2. Fastest rubric-passing primary with a reserved, cross-provider fallback budget and validation-triggered escalation.
3. OpenRouter provider failover for a model with multiple eligible endpoints, then cross-model `models` fallback for independently qualified models.
4. If warranted, a hybrid direct primary plus OpenRouter backup, so OpenRouter itself is not the sole broker failure domain.

OpenRouter's [provider routing](https://openrouter.ai/docs/guides/routing/provider-selection) can prefer latency or throughput and fall back across endpoints. Its [model fallback](https://openrouter.ai/docs/guides/routing/model-fallbacks) handles API errors such as outages or rate limits; it is **not** a replacement for SproutRoute's own JSON, itinerary-quality, venue, and safety validation. We will log the actual returned model/provider and cost. We will not use an opaque automatic router as the quality baseline, because the model chosen could change between cases.

### Budget and next evaluation

The owner funded OpenRouter and limited the dedicated key to $20. At the last September 25 API readback, that key had used $1.11 and had $18.89 of its allowance left; the account had $23.92 in credits remaining. These are account snapshots, not a forecast of future charges. During the OpenRouter screen we used synthetic inputs, did not attach existing provider keys to OpenRouter, and made no production configuration changes. The separate September 26 direct-provider rollout is documented below. OpenRouter's [BYOK behavior](https://openrouter.ai/docs/guides/overview/auth/byok) can change routing and should be a separately declared test condition if considered later.

The key is stored in the macOS Keychain as `sproutroute-openrouter-benchmark`, not in a report, chat, committed file, frontend `VITE_` variable, or Railway production configuration. OpenRouter [supports per-key limits](https://openrouter.ai/docs/api/api-reference/api-keys/create-keys). The local [OpenRouter screen runner](../../scripts/benchmark-openrouter.mjs) checks the live key limit and credit balance, requires a limit of at most $20, reserves worst-case per-request cost, and stops before its budget is exhausted. The existing direct-provider runner remains a separate baseline. The initial $50 limit blocked inference until the owner changed that same key to $20.

The next dataset needs independently sourced venue fixtures, human review for family and pet suitability, and at least ten diverse full app traces. It must inject 429, 5xx, timeout, empty-success, invalid-schema, and token-truncated responses at each relevant step. The current synthetic set covers explicit Las Vegas, vague Bellevue, family constraints, a dog, two- and five-day itineraries, and international context; it does not yet measure whether the browser delivers a complete trip after those failures. Revise this v1 rubric after inspecting the traces, as the Calibre method recommends.

Report two distinct denominators: first-attempt valid outputs, and user-visible complete trips after all retries/fallbacks. For each, capture model/provider, prompt and output token counts, actual billed cost, time to first useful result, time to complete itinerary, p50/p95 latency, timeout rate, fallback rate, criterion failures, and cost per **usable** itinerary. Randomize model order, repeat identical cases, keep prompts and caps versioned, and include uncertainty intervals rather than ranking tiny differences. A 4/4 result is a pilot signal, not a “100% reliable” claim.

## September 26 release decision

We retained Gemini 3.8 Flash as itinerary primary and selected GPT-6 Luna at low effort as the first cross-provider fallback. We did not switch parse, safety, legal extraction, or offline precompute to Luna. We did not add OpenRouter to production. The model client now rejects empty/truncated output and runs itinerary validation before recording success, reserves time for remaining providers, and disables hidden SDK retries. A compact regeneration and repair share a bounded generation deadline. This budget applies to each generation chunk, not an entire multi-stop trip.

The [recovery pilot](2026-09-26-recovery-release.md) passed 10/10 synthetic structural cases: three primary runs and seven injected Gemini failures (429, 503, malformed JSON, empty output, truncation). One recovery took 100.3 seconds after a Luna timeout and a rejected Haiku attempt; the compact regeneration then succeeded. Unit tests cover primary timeout and cancellation. The release passed 568 unit/integration tests and 74 mocked browser tests, including the resolved-Las-Vegas picker regression. These are different denominators from real-user completed trips. Opus remains an expensive candidate, not a deployed fallback. Venue/source verification, human usefulness scoring, and a larger live baseline remain necessary before stronger reliability or accuracy claims.

### Reforge session mapping

We reviewed the owner's local export of “Reforge - AI Evals session.” Its four-section rubric matches the public Calibre framework above. We used its distinction between a rubric, a trace, a score, and an aggregate metric to keep raw outputs and criterion checks separate from headline results. Its recommendation to human-score roughly ten traces before automating a judge remains an outstanding calibration step; ten automated synthetic passes do not satisfy it. The session also highlighted retrieval and tool/API failures, which informed the provider fault-injection tests. We do not redistribute the private transcript or imply that its speakers reviewed SproutRoute.

## Sources and disclosure

Framework: [Calibre Labs article](https://blog.calibrelabs.ai/p/an-eval-rubric-that-drives-your-ai), [AI PRD template](https://github.com/Calibre-Labs/reforge-ai-evals/blob/main/rubric-templates/ai-prd-template.md), [Corner rubric v2](https://github.com/Calibre-Labs/reforge-ai-evals/blob/main/rubric-templates/corner/corner-rubric-v2.html), [Ledger rubric v2](https://github.com/Calibre-Labs/reforge-ai-evals/blob/main/rubric-templates/ledger/ledger-rubric-v2.html), and the linked [Corner](https://claude.ai/artifact/PBvMFLueCm7iRK4cQYQXQZ) and [Ledger](https://claude.ai/artifact/Qgsm4E3GC3w2xRnfmX9Dv5) trace artifacts. Market nomination: [OpenRouter models API](https://openrouter.ai/api/v1/models) and [usage rankings](https://openrouter.ai/rankings), [Artificial Analysis](https://artificialanalysis.ai/leaderboards/models), and [Arena instruction-following](https://arena.ai/leaderboard/text/instruction-following). Routing: [OpenRouter provider selection](https://openrouter.ai/docs/guides/routing/provider-selection), [model fallbacks](https://openrouter.ai/docs/guides/routing/model-fallbacks), and [API key limits](https://openrouter.ai/docs/api/api-reference/api-keys/create-keys). SproutRoute results come from the synthetic local runner and source snapshot linked above. We also reviewed the owner's local Reforge session export; the private transcript is not part of this public package. The rubric is an AI-assisted draft for owner review, not a human-calibrated judge.
