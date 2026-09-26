# GPT-6 Luna task benchmark (exploratory)

Run on September 25, 2026 Pacific time against deployed source commit `1b9ba8cc11cb63b2f04417a066c5585e85e04902`, using the existing Railway production provider credentials in a local, synthetic-only runner. No production routing, data, or database rows were changed.

The runner is `scripts/benchmark-luna.mjs`. It compares each active AI task with its current primary or fallback model. Direct model calls used the production prompts for parsing, travel safety, and itinerary generation, plus the production two-day itinerary cap of 4,200 completion tokens. The law case uses a mock official-source page, and attraction precompute uses a shorter proxy prompt. Results below are **first-attempt model output**, not end-to-end app reliability after retries, normalization, and provider fallback.

| Task | Current comparator | Comparator pass / median / max | Luna `low` pass / median / max |
| --- | --- | ---: | ---: |
| Trip input parse | GPT-5.4 nano | 6/6 · 3.5s · 4.6s | 6/6 · 4.7s · 22.7s |
| Two-day itinerary | Gemini 3.8 Flash | 3/4 · 17.9s · 19.1s | 4/4 · 20.0s · 22.8s |
| Two-day itinerary fallback | GPT-5.4 nano | 3/4 · 14.4s · 22.8s | 4/4 · 20.0s · 22.8s |
| Travel safety | Claude Haiku 4.5 | 4/4 · 3.8s · 4.0s | 4/4 · 5.1s · 5.7s |
| JSON itinerary repair | Claude Haiku 4.5 | 2/2 · 1.1s · 1.1s | 2/2 · 1.6s · 1.7s |
| Car-seat law extraction from supplied text | Claude Haiku 4.5 | 2/2 · 3.1s · 3.1s | 2/2 · 3.8s · 3.9s |

The itinerary failures at the production cap were truncated JSON (`MAX_TOKENS` for Gemini; `length` for nano). The app may recover through its compact retry/repair path, which this comparison did not exercise. Luna `low` had no first-attempt structural failures in four itinerary samples, but that small difference is not statistically meaningful. The itinerary checks covered exact day count, four activities per day, valid activity references, no repeated IDs, and named dinners; they did **not** independently verify that venues are real, open, pet-friendly, or geographically feasible.

Luna settings matter. With its default `medium` reasoning effort and a more generous 6,200-token cap, it passed only 1/2 itinerary cases; one request used all 6,200 tokens on reasoning and returned no JSON after 52s. At `none` with that cap, it passed 2/4, with a thin day and a missing activity reference. `low` was the best tested setting. Current SproutRoute OpenAI calls send `temperature: 0`, which Luna rejects with HTTP 400. Switching only an environment model ID would fail over rather than test Luna; the client must omit `temperature` for Luna and set `reasoning_effort: "low"` before a rollout.

Attraction precompute, an offline task, was tested once with a shorter 20–25-attraction proxy prompt: Luna `medium` passed the structural check in 40.2s; Sonnet 4.6 timed out at the runner's 90s cap. This is inconclusive on relative accuracy, and Luna `low` was not tested there. Legacy AI packing was excluded because the live web flow uses deterministic packing. Pet travel rules and profile normalization are deterministic, not model tasks.

The explicit “Las Vegas” parse case passed 2/2 on both nano and Luna `low` with no destination suggestions. This does not resolve the reported picker bug: `GeneratingScreen.jsx` displays suggestions whenever they are present, even if `destination` is already set. A deterministic UI guard is needed independently of model choice.

OpenAI's [API catalog](https://developers.openai.com/api/docs/models/gpt-6-luna) lists Luna for Chat Completions, and [Standard API pricing](https://developers.openai.com/api/docs/pricing) is $0.10/M input and $0.50/M output tokens. The observed successful two-day Luna itinerary calls were about **$0.0013–$0.0016 each** in OpenAI model charges; this excludes retries, other providers, Places, weather, and full-trip cost. Provider bills, cache effects, and full-request cost were not independently reconciled.

Recommendation: keep production routing unchanged until the Luna parameter compatibility is patched and an end-to-end canary is tested. A bounded canary for parse and itinerary fallback at `low` effort is justified; replacing Gemini, Haiku, or the legal extraction path across the board is not justified by these small synthetic samples. Keep existing provider fallbacks and require zero critical schema failures plus independently checked venue/safety facts before widening traffic.
