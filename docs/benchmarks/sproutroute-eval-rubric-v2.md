# SproutRoute eval rubric v2 (draft)

November 6, 2026. Draft for owner review. Built on [rubric v1](sproutroute-ai-eval-report-2026-09-25.md#rubric-v1). The evidence is the October 28 eight-model comparison (PR #42) and the Yellowstone winter case in this folder. The owner's hand read of ten traces against v1 hasn't happened yet. Every new or changed line is a proposal to confirm in that read, and no line here has been calibrated against human labels.

## How each failure was handled

Before a failure becomes an eval, ask three questions in order:

1. Was the agent told what to do? If not, fix the prompt.
2. Does it have what it needs? If not, fix the system.
3. Does it fail only some of the time? If so, write an eval.

A code check is used wherever a rule can decide. An LLM judge is used only when the scoring needs judgment, and it still gives pass or fail. A failure that is fixed keeps a check as its regression test.

| Failure seen on October 28 | How often | Told? Has it? | Decision |
| --- | --- | --- | --- |
| Winter trip planned as summer: interior stops by car, closed lodges (Yellowstone) | 7 of 7 finished plans | Told the opposite ("each one exists and is open"); no seasonal data | **Fix** in this change (seasonal-access note, shortlist filter), not yet rerun. `checkSeasonalAccess` is the regression test (O3). |
| Stops repeated across days on trips over 3 days | Every model; production Gemini 2.7 per long trip | Told ("avoid repeating"), but duplicate repair runs inside each three-day chunk and can't see earlier chunks | **Fix next**: give the repair step the earlier chunks' names. The repeated-stop count is the regression test (O2). |
| "A week" parsed as five days (Maui) | 2 of 8 configurations | Told | **Eval** (O1). Fails some of the time; the parse check already catches it. |
| Model-written car-seat rules that contradict the law (judge's reading, not verified) | High concern on 5 of 7 Haiku 4.5 answers (the production tips model); 0 to 3 on the other models | The app already has a curated, sourced car-seat card, but the model also writes its own `carSeatLaw` line | **Fix first**: stop the model writing legal rules, or limit it to the curated card. Then G1 checks that the two agree. |
| Day not doable: travel time, daylight, overpacked, meals | Judge themes in 24 to 44 of 51 plans (rough keyword count) | Partly told; no sunset times; prompt asks for 4 to 6 stops and dinner only | **Fix first** where a fact is missing (sunset times, all three meals). Then **judge** what is left (O5), after the judge is calibrated. |
| Itinerary never finishes (GPT-5.4 nano, 5 of 7) | One model | n/a | **Routing rule**, not an eval: never configure nano for itineraries. O4 covers recovery when a provider fails. |

## The rubric

`Code` is a deterministic check. `Judge` is an LLM judge giving pass or fail per plan or per day, used only after it agrees with the owner's labels. `Human` needs a person or an official source. A must-have should pass close to 100% before a release. A target improves over time. The numbers for each threshold live in the PRD, not here.

| ID | Pass condition | Change from v1 | Check | Level |
| --- | --- | --- | --- | --- |
| O1 | An explicit destination is kept with no destination question; a vague request gets fitting choices. Travelers, dates, trip length (including phrases such as "a week"), pets and diet are kept. | Adds trip length phrases, after the Maui miss. | Code (parse cases with expected fields) | Must-have |
| O2 | A complete, parseable plan covers the requested days. Activity references resolve. No day is empty or contradicts itself, and **no stop appears on two days, across chunks too**. | Makes cross-chunk repeats an explicit fail. | Code (completion, repeated-stop count) | Must-have |
| O3 | Places are real and in the area, and **open and reachable on the trip's dates**, including seasonal road and lodge closures. Nothing is called open, bookable or pet-friendly without evidence. A meal pick serves that meal. | Adds seasonal access and meal fit, after the Yellowstone case. Moves travel time and family fit to O5. | Code (database match, `checkSeasonalAccess`, hours check) plus Human for venue truth | Must-have |
| O4 | After a recoverable provider failure the parent still gets a complete, usable plan, not an endless spinner or a partial plan presented as success. | No change. | Code with fault injection; Human for usability | Must-have |
| O5 | **Each day is doable for this family**: travel time between stops, daylight, meal and nap timing, and pace for the youngest child. | New. Split out of v1's O3, because the judge raised these in most plans. | Judge, per day, after calibration; Human spot checks | Target |
| T1 | No question about a destination the parent already gave. Follow-up questions only for missing decisions that matter. | No change. | Code on parse trace | Must-have |
| T2 | Attempts, model, validation failures, retries and fallback reasons are visible in the trace. Invalid output is never counted as a successful trip. | No change. Eval traces in Langfuse now carry this. | Code on trace | Must-have |
| T3 | Recovery stays within one user-facing time budget with time reserved for a different provider. The stream never contradicts or erases what it already showed. | No change. | Code with timeout and stream fault injection | Must-have |
| X1 | First useful content and the full plan arrive within the measured latency budget. Progress and fallback states are honest. | No change. | Code timing; Human review | Target |
| X2 | The plan is readable and actionable for a parent. Caveats are short, and an error says what can be retried. | No change. | Human, blinded to model (Judge once calibrated) | Target |
| G1 | Safety and legal text invents no rules and implies no checking that didn't happen. **Model-written legal text says nothing the curated, sourced card doesn't say.** Jurisdiction rules need the official source and a human review before a release change. | Ties model legal text to the curated card, after the car-seat flags. | Code (legal text matches the card) plus Human source review | Must-have |
| G2 | Eval inputs hold no real user data. Routing follows the data policy. No credentials appear in traces or reports. | No change. Eval capture masks key-shaped strings. | Code review of fixtures, capture gate and logs | Must-have |
| G3 | Spend caps and request limits are enforced in code or account settings, not left to a model. | No change. A daily spend **alert** exists; a hard cap is still to confirm. | Code configuration review | Must-have |
| G4 | **A provider billing or key failure (402, 401) is caught, alerted once, and routed to the next provider.** The parent never sees a success-shaped partial plan. | New, after the October 23 to 27 incident: an emptied prepaid balance, then a 402 and a rejected key. | Code with fault injection (402, 401) | Must-have |

## Golden set changes

- Add seasonal cases with fixed dates, so their season doesn't move with the run date: Yellowstone in late December now, then others such as a mountain pass or a beach town off season.
- Keep the Maui "a week" parse and the long-trip cases (five and six days), because they catch the repeat and length failures.
- Label the cases by line, as the runner already does with `x-eval-rubric`.

## Next steps

1. Owner hand-reads the ten traces in the review sheet against these lines and notes where a line was hard to call.
2. Rerun the Yellowstone case against the seasonal fix (paid). It should move from 7 of 7 failing to passing.
3. Fix cross-chunk repeats and the model-written legal line, each with its check as a regression test.
4. Calibrate the O5 judge against the owner's labels before using its numbers.
