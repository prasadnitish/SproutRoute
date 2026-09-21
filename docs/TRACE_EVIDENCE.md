# Runtime tracing pilot

The branch adds bounded per-process spans to the deployed f6b41b4 code. `GET /ops/traces` and `GET /api/v1/ops/traces` use the existing operations guard and no-store responses. Sign in at `/ops` so the secret stays out of the URL. Disable collection with `TRACING_ENABLED=false`. The public milestone ingestion endpoint is rate-limited, accepts only fixed event names, finite durations and a 32-character random journey ID, and cannot query traces.

Each browser submission receives a new ephemeral journey ID. Requests that share its AbortSignal carry that ID through parse, packing, streaming and safety calls. Browser milestones are explicitly client-reported and incomplete: they measure event receipt, not screen paint or all third-party map traffic. Abort/error flows must not be counted as complete journeys.

The backend uses AsyncLocalStorage for nested request context and a monotonic clock for duration. Wrappers preserve synchronous or asynchronous service semantics. Outbound HTTP spans end when fetch resolves; parent tool spans include parsing and service work. Provider attempt spans include responses and usage, with failures kept separate from fallbacks. SSE error events mark the trace failed even when HTTP status is 200.

Retention: latest 100 requests, up to 200 spans per request, process-local only. Restart clears history. Export before restart. Set TRACE_ARCHIVE_PATH to enable a private JSONL archive. It retains two segments of at most 10 MB each and reloads the latest segment on restart. A production durable volume remains a deployment configuration prerequisite. Exporter health reports dropped writes; application calls continue during archive failures. The export records no prompts, answers, URL queries, precise coordinates, credentials or child identifiers. Raw exception messages are replaced with fixed codes. Cost is unknown until a versioned provider rate table and complete usage fields are supplied.

Captured evidence is from a synthetic Seattle request to the local app with live provider calls. Production database credentials were omitted. It does not establish production P95, availability, venue accuracy or safety correctness.

## Verification

Run `npm test` and `npm run build --prefix src/frontend`. The integration test checks protected exports, validation failures over SSE and payload-free traces. The unit tests cover concurrent context isolation, bounded retention, span closure, privacy filtering and client input validation. The one-day-trip regression fixes the validation boundary discovered in the initial live audit.

## Before production

1. Review the isolated branch against f6b41b4; reconcile any newer main changes.
2. Configure a durable, access-controlled collector/exporter with a retention limit and verify restart recovery.
3. Validate production CORS and propagation on apex/www/mobile clients; verify privacy with synthetic inputs.
4. Deploy only the reviewed build, run a synthetic journey, verify trace freshness and compare user-perceived latency.
5. Disable with `TRACING_ENABLED=false` or roll back if tracing degrades the user flow.
