# Model comparison against the SproutRoute eval rubric

October 28, 2026. Synthetic cases only. One run of 17 cases per model, plus a second run for three of them. This is a
pilot with small samples, not a production reliability or quality estimate.

## The question

Newer models cost less and claim more. Should SproutRoute switch any of its three model jobs to one of them, judged on
the rubric in the [September 25 eval report](../sproutroute-ai-eval-report-2026-09-25.md): latency (X1), cost (G3),
and accuracy (O1, O2, O3, T1, G1)?

| Job | Model in production today | Where it runs |
| --- | --- | --- |
| Parse the free-text request | GPT-5.4 nano | `parseInput`, 1,200-token cap |
| Write the itinerary | Gemini 3.8 Flash, then GPT-6 Luna, then Claude Haiku 4.5 as fallbacks | `tripPlan`, token cap grows with trip length |
| Write travel-safety tips | Claude Haiku 4.5 | `travelSafety`, 1,024-token cap |

Production routing was read from the Railway configuration on October 28: `AI_PROVIDER_TRIP_PLAN=gemini`,
`GOOGLE_GEMINI_MODEL_TRIP_PLAN=gemini-3.8-flash`, `OPENAI_MODEL_ID_TRIP_PLAN=gpt-6-luna`.

## What was run

Eight configurations. Each answers all three jobs, so every model can be compared with the current choice for each job.
Prices are US dollars per million input and output tokens: Anthropic and OpenAI from the OpenRouter catalog on October 28,
Gemini from the Google billing export used in `src/backend/utils/aiCost.js`. Cost per call is the tokens Langfuse
recorded for that call times these prices, so it is an estimate and not an invoice.

| Configuration | Model | Price in / out | Setting |
| --- | --- | ---: | --- |
| gemini-3-8-flash | `gemini-3.8-flash` | $0.75 / $3.75 | production itinerary model |
| gpt-5-4-nano | `gpt-5.4-nano` | $0.20 / $1.25 | production parse model; newest nano |
| gpt-6-luna | `gpt-6-luna` | $0.10 / $0.50 | low reasoning effort |
| haiku-4-5 | `claude-haiku-4-5-20251001` | $1.00 / $5.00 | production travel-tips model |
| haiku-5-5 | `claude-haiku-5-5` | $0.10 / $0.50 | effort low, thinking left on |
| haiku-5-5-nothink | `claude-haiku-5-5` | $0.10 / $0.50 | effort low, thinking off |
| sonnet-5-5 | `claude-sonnet-5-5` | $2.00 / $10.00 | effort low, thinking left on |
| sonnet-5-5-nothink | `claude-sonnet-5-5` | $2.00 / $10.00 | effort low, thinking off (`between_tools`) |

Left out on price: Claude Opus 5.5 ($4 / $20) and Fable 5.1 ($10 / $50), GPT-6.1 Terra and Sol, and the Gemini 3.5 to
3.7 Flash models. Gemini 3.8 Flash is the newest Flash.

The 17 cases are in `scripts/eval-cases.mjs`: ten request parses (three from the original golden set, seven new, each
with what a correct parse contains) and seven trips. The trips are Las Vegas, San Diego with a dog, a five-day Tokyo
trip, Seattle with a toddler, London, a six-day Yellowstone trip and New York with two children. A model answers
parses, the itinerary stream and the travel-tips call. The packing list, car-seat card and pet check are rule-based and
were left out.

How it ran: a local copy of the backend per model, started under `railway run`, with `AI_EVAL_MODEL_OVERRIDE` (added in
this change, inert unless `ALLOW_EVAL_MODEL_OVERRIDE=true`) pointing the three jobs at that model with no fallback. A
failure is therefore the model's own, and the app's validation, retries and repair still ran. The local backend read
the real Supabase attraction data, so itineraries are grounded as they are in production. Every call is traced in
Langfuse under the run tag `cmp-<configuration>`.

Scoring is in three layers:

1. **Program checks** (`scripts/eval-scoring.mjs`): a parse against what the request said (O1, T1), an itinerary's
   structure (O2), the share of stops matched to the database, and the number of stops the opening-hours check had to
   fix. Timing comes from the runner and the server log; tokens come from Langfuse.
2. **A blind judge**, Claude Opus 5.5, one plan at a time with no model name, scoring readability (X2) and plausibility
   (O3) from 1 to 5, and listing each legal claim in the travel-safety text (G1). The judge has not been checked
   against human scores. Its numbers are a second opinion, and the notes it wrote are more useful than the averages.
3. **A person**, who has not yet read the plans. The rubric calls for human review of O3 and G1, and that has not
   happened.

## Results

### Cost, latency and completion

| Model | Parse pass | Parse p50 | Itinerary complete | Itinerary p50 | Itinerary p95 | Tips valid | Tips p50 | Cost per trip (parse + itinerary + tips) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| gemini-3-8-flash | 10/10 | 4.6s | 7/7 | 30.7s | 44.1s | 7/7 | 4.5s | 2.10¢ |
| gpt-5-4-nano | 10/10 | 4.1s | 2/7 | 51.8s | 78.0s | 2/2 | 2.7s | 1.24¢ |
| gpt-6-luna | 10/10 | 7.3s | 7/7 | 36.1s | 53.1s | 7/7 | 7.1s | 0.30¢ |
| haiku-4-5 | 9/10 | 6.1s | 7/7 | 36.6s | 112.8s | 7/7 | 4.3s | 4.27¢ |
| haiku-5-5 | 4/10 | 5.6s | 7/7 | 46.6s | 59.1s | 4/7 | 5.8s | 0.61¢ |
| haiku-5-5-nothink | 9/10 | 2.0s | 7/7 | 18.0s | 31.8s | 7/7 | 3.7s | 0.30¢ |
| sonnet-5-5 | 10/10 | 3.7s | 7/7 | 50.0s | 66.5s | 7/7 | 6.7s | 8.34¢ |
| sonnet-5-5-nothink | 10/10 | 4.1s | 7/7 | 47.5s | 89.7s | 7/7 | 7.4s | 9.80¢ |

### Itinerary quality signals

| Model | Mean output tokens | Stops in the database | Durations 45-180 min | Hours corrections per 10 stops | Thin days per plan | Repeated stops, trips over 3 days | Judge: readable (X2) | Judge: plausible (O3) | Judge issues per plan |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| gemini-3-8-flash | 3535 | 97% | 95% | 0.8 | 0.0 | 2.7 | 2.1 | 1.9 | 13.1 |
| gpt-5-4-nano | 7782 | 100% | 82% | 0.0 | 0.0 | n/a | 1.5 | 1.5 | 13.0 |
| gpt-6-luna | 3643 | 100% | 92% | 0.7 | 0.3 | 1.7 | 2.1 | 1.9 | 11.4 |
| haiku-4-5 | 5954 | 100% | 91% | 0.7 | 0.1 | 4.0 | 1.7 | 1.6 | 15.3 |
| haiku-5-5 | 9617 | 100% | 94% | 0.3 | 0.0 | 0.7 | 2.1 | 1.9 | 13.0 |
| haiku-5-5-nothink | 4224 | 100% | 91% | 0.9 | 0.4 | 4.0 | 1.9 | 1.7 | 12.0 |
| sonnet-5-5 | 6449 | 100% | 95% | 0.3 | 0.0 | 2.7 | 2.4 | 2.1 | 12.3 |
| sonnet-5-5-nothink | 7471 | 100% | 94% | 0.7 | 0.0 | 3.7 | 2.0 | 1.6 | 12.6 |

### Travel-safety answers

| Model | Valid answers | Legal claims listed for review (per answer) | Judge concern: none / low / high |
| --- | ---: | ---: | ---: |
| gemini-3-8-flash | 7/7 | 4.7 | 0 / 6 / 1 |
| gpt-5-4-nano | 2/2 | 5.5 | 0 / 1 / 1 |
| gpt-6-luna | 7/7 | 6.0 | 0 / 7 / 0 |
| haiku-4-5 | 7/7 | 5.3 | 0 / 2 / 5 |
| haiku-5-5 | 4/7 | 4.3 | 3 / 2 / 2 |
| haiku-5-5-nothink | 7/7 | 7.0 | 0 / 4 / 3 |
| sonnet-5-5 | 7/7 | 9.3 | 0 / 4 / 3 |
| sonnet-5-5-nothink | 7/7 | 8.6 | 0 / 6 / 1 |

### Run to run variation (second pass of the same cases)

| Model | Itinerary complete (run 1 / run 2) | Itinerary p50 (run 1 / run 2) | Itinerary p95 (run 1 / run 2) | Cost per trip (run 1 / run 2) |
| --- | ---: | ---: | ---: | ---: |
| gemini-3-8-flash | 7/7 / 7/7 | 30.7s / 28.7s | 44.1s / 44.4s | 2.10¢ / 2.06¢ |
| gpt-6-luna | 7/7 / 7/7 | 36.1s / 38.9s | 53.1s / 61.6s | 0.30¢ / 0.30¢ |
| haiku-5-5-nothink | 7/7 / 7/7 | 18.0s / 19.1s | 31.8s / 55.7s | 0.30¢ / 0.38¢ |


"Itinerary complete" means the stream finished without an error, had one day object per requested day, and every
activity id resolved. Thin days (fewer than four stops for a family) and repeated stops are counted separately because
a plan can be complete and still have them. "Stops in the database" is the share of the plan's stops that matched a
Google-confirmed row. A judge score of 3 is a middling plan. The judge was strict: no model's average was above 2.4.

## What the results say

**Itinerary.**

- **GPT-5.4 nano is not usable for itineraries.** It finished 2 of 7. On the other five it failed the app's validation
  ("missing days or invalid activity references") on all three attempts, which took about 60 seconds on average before the error. Production
  routes the OpenAI fallback to Luna, not nano, so this is not a live risk. It does mean nano should never be
  configured as an itinerary fallback.
- **Haiku 5.5 with thinking off is the only model that is both faster and cheaper than Gemini.** Median 18.0 seconds
  against 30.7 (19.1 against 28.7 on the second run), and 0.22¢ per itinerary against 1.66¢, about 87% less. It finished
  14 of 14 across two runs. Its quality signals are a little weaker: the judge scored it 1.9 and 1.7 against Gemini's
  2.1 and 1.9, and it left more thin days (0.4 per plan) and repeated more stops on long trips (4.0 against 2.7). Its
  slowest runs varied more (31.8 seconds at p95 on the first run, 55.7 on the second).
- **GPT-6 Luna matches Gemini on the quality signals at about a seventh of the itinerary cost.** The judge scored it the same
  as Gemini (2.1 and 1.9), it finished 14 of 14, and it repeated fewer stops on long trips (1.7). It is slower: median
  36.1 and 38.9 seconds against 30.7 and 28.7. It is already the production fallback.
- **Sonnet 5.5 scored best with the judge (2.4 and 2.1) and costs 6.6¢ to 7.9¢ per itinerary**, four to five times
  Gemini, with a median near 50 seconds. The gap with the cheaper models is a few tenths of a point on a strict judge.
  Turning its thinking off did not make it faster or cheaper.
- **Haiku 4.5, the current third fallback, is the slowest and weakest of the models that finished.** Its slowest run
  was 112.8 seconds, it had two failed attempts that were retried, and the judge gave it the lowest scores of the models that
  finished most plans (1.7 and 1.6).

**Parse.** Gemini, nano, Luna and both Sonnet runs passed 10 of 10. Haiku 4.5 and Haiku 5.5 with thinking off passed
9, missing the day count on the Maui case ("a week" expects seven or eight days). Haiku 5.5 with thinking left on passed 4 of 10: it
spent the 1,200-token cap on hidden thinking and the call failed with "exceeded its output limit". With thinking off
it parsed in a median 2.0 seconds against nano's 4.1, at half the cost per request (0.05¢ against 0.10¢).

**Travel-safety tips.** Haiku 5.5 with thinking on gave a valid answer for 4 of 7, for the same reason as parse: the
1,024-token cap. With thinking off, Haiku 5.5, Luna, Gemini and Sonnet all answered 7 of 7. Haiku 5.5 with thinking off
costs 0.03¢ per answer against Haiku 4.5's 0.21¢ and is a little faster (median 3.7 seconds against 4.3).

**The legal text is the finding that matters most for safety.** The judge listed about 4 to 9 specific legal claims per
answer and flagged high concern on 5 of Haiku 4.5's 7 answers, 3 of Haiku 5.5's (thinking off) and 3 of Sonnet 5.5's (thinking
on). Luna had none in 7 and Gemini one. The flagged claims were car-seat rules: for Washington, "forward-facing seats are
required from age 2" (the judge says the law allows it but does not require it); for New York, a requirement "under 4
or under 40 lbs" (the judge says the law covers children under 8); for California, a height cutoff misstated; for the
UK, taxi rules and the end of the booster requirement. **These are the judge's readings, not verified facts.** Each
needs checking against the official source before anything is concluded. What does not depend on the judge: the app
already has a curated car-seat card with sources, and the model-written `carSeatLaw` line sits beside it and can say
something different.

## Defects no model choice fixes

The judge's notes repeated across models. Counting themes over the 51 plans it reviewed (a rough keyword count, not a
coded analysis): travel time and geography between stops in 36, winter daylight and sunset in 31, repeated stops in 29,
meal problems in 44 (for example, dinner only, or a dinner pick that does not serve dinner), and overpacked days in
24, often with no allowance for a toddler's nap.

Two of these are checked by the program, not the judge:

- **Stops repeat across days on trips of more than three days, for every model**, including production's Gemini
  (2.7 repeated stops per long trip). Trips over three days are generated in separate three-day chunks and nothing
  stops the second chunk repeating the first. Yellowstone showed up to 7 repeats.
- **Models still plan stops outside opening hours.** The hours check had to correct between 0.2 and 0.9 stops in every
  ten, depending on the model. It is doing real work for every model.

## Recommendations

These are recommendations from a pilot, for the owner to decide.

1. **Keep Gemini 3.8 Flash as the itinerary primary for now.** No model beat it on every axis. Luna matches its
   quality signals at about a seventh of the cost and 18% to 36% more latency. Whether 6 to 10 more seconds matters is a
   product call; the September objective was lowest latency among systems that meet the bar.
2. **Run Haiku 5.5 with thinking off as a canary for the itinerary, and as the parse and travel-tips model.** It is the
   only candidate that improves latency and cost together. Before it takes real traffic, fix the cross-chunk repeats
   (it repeats the most) and human-score about ten of its plans against Gemini's.
3. **Do not configure Haiku 5.5 with thinking on** for any job with a small token cap, and write that down: a "newer
   model" swap that leaves thinking on fails parse 6 times in 10.
4. **Never use GPT-5.4 nano for itineraries.** Keep it, or replace it, for parsing only.
5. **Check the legal claims, then decide whether the model should write `carSeatLaw` at all.** The curated car-seat
   card is the source the app can cite.
6. **Fix the shared defects first.** Passing earlier chunks' stops into later chunks, adding sunset times to the
   prompt, and asking for all three meals would help every model and no model swap would.

## Limits

- One run per case, two for three models. Seven trips per model is not enough to call small differences. Latency
  medians moved by 2 to 3 seconds between runs, and one p95 moved by 24 seconds.
- The judge is a model, uncalibrated, and Opus 5.5 comes from the same vendor as five of the eight configurations, which may flatter
  them. No venue, opening hour or legal claim was independently verified except by the database match.
- Cost is tokens times catalog prices, for the three jobs only. It excludes geocoding, weather and Places calls, and it
  would be different at production traffic mixes.
- The local backend wrote a few extra rows to `trip_metrics` and may have written back stops not in the database.
- No fault injection. This comparison says nothing about recovery from 429s, timeouts or truncation, which the
  September 26 pilot covers.
- Thinking-off settings differ by model and are not portable: Haiku 5.5 takes `disabled`, Sonnet 5.5 rejects it and
  takes `between_tools`. The first Sonnet run failed every call for that reason and was rerun.

Model spend for the comparison was about $2.20 for the 8 configurations and the repeat, plus about $2.70 for the judge
(168,571 input and 102,922 output tokens at Opus 5.5 catalog rates).

## Reproduce

Everything runs from the repository. Needs the Railway CLI linked to the SproutRoute service.

```bash
railway run --service SproutRoute -- node scripts/compare-models.mjs --out=/tmp/cmp --confirm-spend
railway run --service SproutRoute -- node scripts/score-comparison.mjs --dir=/tmp/cmp --out=/tmp/cmp/summary.json
railway run --service SproutRoute -- node scripts/judge-comparison.mjs --dir=/tmp/cmp --out=/tmp/cmp/judgments.json
node scripts/report-comparison.mjs --summary=/tmp/cmp/summary.json --judgments=/tmp/cmp/judgments.json
```

Files in this folder: `summary.json` and `summary-repeat.json` (scored results), `judgments.json` (every judge score and
note), `raw/` and `raw-repeat/` (each response body, timing and server log, gzipped). The Langfuse sessions are tagged
`run:cmp-<configuration>`.
