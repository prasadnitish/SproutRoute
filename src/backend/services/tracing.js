import { createTraceArchive } from "./traceArchive.js";
import { AsyncLocalStorage } from "node:async_hooks";
import { randomBytes } from "node:crypto";
import { performance } from "node:perf_hooks";

const id = (bytes) => randomBytes(bytes).toString("hex");
const SAFE = new Set([
  "provider",
  "model_id",
  "input_tokens",
  "output_tokens",
  "usage_source",
  "error_code",
  "http_status",
  "cache_hit",
]);
function safeDetail(value) {
  return Object.fromEntries(
    Object.entries(value || {}).filter(
      ([key, v]) =>
        SAFE.has(key) &&
        ((typeof v === "number" && Number.isFinite(v) && v >= 0) ||
          typeof v === "boolean" ||
          (typeof v === "string" && /^[a-zA-Z0-9_.:/-]{1,120}$/.test(v))),
    ),
  );
}

/** Bounded, process-local traces. No payloads, headers or exception messages are recorded. */
export function createTracer({
  limit = 100,
  maxSpans = 200,
  service = "sproutroute",
  onComplete = () => {},
  initialTraces = [],
} = {}) {
  const context = new AsyncLocalStorage();
  const history = initialTraces.slice(-limit);
  function snapshot() {
    return structuredClone(history);
  }
  function span(label, detail, operation) {
    const parent = context.getStore();
    if (!parent) return operation();
    const { trace, origin } = parent;
    if (trace.spans.length >= maxSpans) {
      trace.meta.dropped_spans++;
      trace.meta.complete = false;
      return operation();
    }
    const s = {
      span_id: id(8),
      parent_span_id: parent.spanId || null,
      label,
      kind: label.startsWith("ai.") ? "llm" : "tool",
      start_ms: performance.now() - origin,
      end_ms: null,
      status: "running",
      cost_usd: null,
      detail: safeDetail(detail),
    };
    trace.spans.push(s);
    trace.meta.pending_spans++;
    let finished = false;
    const finish = (error, result) => {
      if (finished) return;
      finished = true;
      s.end_ms = performance.now() - origin;
      s.status =
        error || s.detail.error_code || s.detail.http_status >= 400
          ? "error"
          : "ok";
      if (error)
        s.detail.error_code =
          error.name === "AbortError" ? "ABORTED" : "OPERATION_FAILED";
      if (Number.isInteger(result?.status)) {
        s.detail.http_status = result.status;
        if (result.status >= 400) s.status = "error";
      }
      if (result?.usage) Object.assign(s.detail, safeDetail(result.usage));
      trace.meta.pending_spans--;
      trace.meta.complete =
        trace.meta.pending_spans === 0 && trace.meta.dropped_spans === 0;
      trace.meta.duration_ms = Math.max(trace.meta.duration_ms, s.end_ms);
      if (trace.meta.pending_spans === 0) {
        try {
          onComplete(structuredClone(trace));
        } catch {
          /* Telemetry never fails the operation. */
        }
      }
    };
    return context.run({ ...parent, spanId: s.span_id }, () => {
      try {
        const result = operation();
        if (result && typeof result.then === "function")
          return result.then(
            (v) => {
              finish(null, v);
              return v;
            },
            (e) => {
              finish(e);
              throw e;
            },
          );
        finish(null, result);
        return result;
      } catch (e) {
        finish(e);
        throw e;
      }
    });
  }
  function run(label, metadata, operation) {
    const runId = id(16);
    const journey = /^[a-f0-9]{32}$/.test(metadata?.journey_id || "")
      ? metadata.journey_id
      : null;
    const trace = {
      meta: {
        schema_version: 1,
        run_id: runId,
        journey_id: journey,
        tenant_id: "local",
        service,
        environment:
          process.env.TRACE_ENVIRONMENT ||
          process.env.NODE_ENV ||
          "development",
        build:
          process.env.TRACE_BUILD ||
          process.env.RAILWAY_GIT_COMMIT_SHA ||
          "unversioned",
        started_at: new Date().toISOString(),
        duration_ms: 0,
        complete: false,
        pending_spans: 0,
        dropped_spans: 0,
        retention: "process-local; latest " + limit + " requests",
        source: "runtime",
      },
      spans: [],
    };
    history.push(trace);
    if (history.length > limit) history.shift();
    return context.run({ trace, origin: performance.now(), spanId: null }, () =>
      span(label, {}, () => operation(runId)),
    );
  }
  function middleware(req, res, next) {
    if (
      !req.path.startsWith("/api/") ||
      req.path.startsWith("/api/v1/ops/") ||
      req.path === "/api/v1/telemetry/journey"
    )
      return next();
    // Route templates only. Dynamic URLs can include profile/invite identifiers.
    run(
      `${req.method} API`,
      { journey_id: req.get("x-journey-id") },
      (runId) =>
        new Promise((resolve) => {
          res.setHeader("X-Trace-Id", runId);
          const root = context.getStore().trace.spans[0];
          res.traceError = () => {
            root.detail.error_code = "RESPONSE_FAILED";
          };
          let done = false;
          const finish = () => {
            if (done) return;
            done = true;
            root.detail.http_status = res.statusCode;
            root.label = `${req.method} ${typeof req.route?.path === "string" ? req.route.path : "unmatched"}`;
            resolve();
          };
          res.once("finish", finish);
          res.once("close", () => {
            if (!res.writableFinished)
              root.detail.error_code = "CLIENT_DISCONNECTED";
            finish();
          });
          next();
        }),
    ).catch(() => {});
  }
  function recordClient(body) {
    const allowed = new Set([
      "submitted",
      "parsed",
      "stream_destination",
      "stream_weather",
      "stream_itinerary-chunk",
      "stream_done",
      "stream_error",
    ]);
    if (
      !/^[a-f0-9]{32}$/.test(body?.journey_id || "") ||
      !Array.isArray(body?.events) ||
      body.events.length < 1 ||
      body.events.length > 16 ||
      new Set(body.events.map((e) => e.name)).size !== body.events.length ||
      body.events.some(
        (e) =>
          !allowed.has(e.name) ||
          !Number.isFinite(e.ms) ||
          e.ms < 0 ||
          e.ms > 1800000,
      )
    )
      throw Error("INVALID_CLIENT_TRACE");
    const runId = id(16);
    const spans = body.events.map((e) => ({
      span_id: id(8),
      parent_span_id: null,
      label: "browser." + e.name,
      kind: "milestone",
      start_ms: 0,
      end_ms: e.ms,
      status: e.name === "stream_error" ? "error" : "ok",
      cost_usd: null,
      detail: {},
    }));
    history.push({
      meta: {
        schema_version: 1,
        run_id: runId,
        journey_id: body.journey_id,
        tenant_id: "local",
        service: "sproutroute-browser",
        environment: process.env.TRACE_ENVIRONMENT || process.env.NODE_ENV || "development",
        build: process.env.TRACE_BUILD || process.env.RAILWAY_GIT_COMMIT_SHA || "unversioned",
        started_at: new Date().toISOString(),
        timestamp_semantics:
          "server receipt; span offsets are client monotonic",
        duration_ms: Math.max(...spans.map((s) => s.end_ms)),
        complete: false,
        pending_spans: 0,
        dropped_spans: 0,
        source: "browser-reported; stream milestones only",
        retention: "process-local",
      },
      spans,
    });
    if (history.length > limit) history.shift();
    try {
      onComplete(structuredClone(history.at(-1)));
    } catch {}
  }
  return {
    span,
    run,
    snapshot,
    middleware,
    recordClient,
    wrap:
      (name, fn) =>
      (...args) =>
        span(name, {}, () => fn(...args)),
  };
}
export const traceArchive = createTraceArchive(process.env.TRACE_ARCHIVE_PATH);
export const tracing = createTracer({
  initialTraces: traceArchive.load(),
  onComplete: traceArchive.append,
});

export const tracedFetch = (...args) =>
  tracing.span("http.dependency", {}, () => fetch(...args));
