# Unit costs in operations

Sign in to `/ops/traces` for estimates from the latest 100 instrumented requests and browser milestones. The authenticated `GET /api/v1/ops/traces` exposes the same figures under `unitCosts`. New production request traces use the existing private 30-day store when enabled. Only numeric counts, provider/model identifiers and random existing trace/journey identifiers are needed. The unit meter stores no captions, names, source links, account IDs or extracted text.

| Unit | Denominator |
| --- | --- |
| Trip | Successful plan, stream, bundle or verified MCP generation job, grouped once by journey; without a journey ID each successful generation request counts separately. Linked parse, packing, safety and routing calls add to observed spend. |
| Successful social extraction | A fresh REST or private MCP extraction producing at least one grounded place. Errors and empty results still contribute their observed AI spend. Cached replays and manual saves add no new extraction. |
| Grounded place | An emitted distinct place and destination with its name in a verbatim supporting excerpt. |
| Grounded fact | One named-place assertion plus each distinct tip or family excerpt occurring verbatim within that place’s supporting evidence. Within a candidate, matching trimmed, case-insensitive excerpts count once. This measures extracted assertions. Semantic accuracy requires review. |
| Created trip share link | A successful server-side trip snapshot link creation. |
| Queued social link | A newly inserted MCP inbox link saved without immediate extraction. Replayed insertions do not count. OS share-sheet opens and local-only drafts have no server measurement. |

Divide the sum of observed provider-attempt estimates, including rejected responses and fallback calls, by delivered units. The extraction, place and fact rows share their numerator. Adding them together, or adding the independent `trip_metrics` model estimate, double-counts the same work. Trial traffic without the authorized eval trace marker can still appear.

A ratio is unavailable when the denominator is zero, a contributing trace is incomplete or an attempt has unknown usage/pricing. Earlier traces remain excluded. Window boundaries may separate companion requests from generation; the trip ratio is a window-level estimate. The API reports excluded unlinked companion requests. Costs exclude Maps, weather, hosting, storage, egress, rebates, taxes and invoice adjustments. A measured zero for a simple link means zero observed model spend.

The model calculator prices disjoint uncached input, cached reads, standard short-lived cache writes and output using rates captured at execution. Gemini reasoning is included in output where reported. Configure `AI_PRICE_OVERRIDES` for an unlisted model or negotiated rates (USD per million tokens, fields `in`, `out`, and optional `read`, `write`). Unknown cache rates produce an unpriced attempt. The app requests standard model service and uses short-lived prompt caching. Validate absolute spend against the provider invoice. [OpenAI Terra pricing](https://developers.openai.com/api/docs/models/gpt-6.1-terra) · [OpenAI prompt caching](https://developers.openai.com/api/docs/guides/prompt-caching) · [Anthropic pricing](https://platform.claude.com/docs/en/about-claude/pricing)
