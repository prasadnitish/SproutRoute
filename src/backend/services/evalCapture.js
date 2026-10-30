// Eval trace capture: full prompts, model outputs and tool results, sent to
// Langfuse so traces can be scored against the AI eval rubric.
//
// This is the opposite of services/tracing.js on purpose. That tracer runs for
// everyone and records no payloads. This one records everything, so it only
// runs for requests that carry the eval token (synthetic golden-set runs).
// Ordinary users are never captured, and the Langfuse SDK is never loaded
// unless capture is switched on.
import { AsyncLocalStorage } from "node:async_hooks";
import { createHash, timingSafeEqual } from "node:crypto";
import { log } from "../utils/logger.js";

const TOKEN_HEADER = "x-eval-capture";
const MIN_TOKEN_LENGTH = 32;
const CLIENTS = new Set(["web", "ios", "android"]);
const LABEL = /^[A-Za-z0-9_.:-]{1,80}$/;
// The same random 32-character id the web app sends as X-Journey-Id on every call of one trip submission.
const HEX_ID = /^[a-f0-9]{32}$/;
const RUBRIC_LINES = /^[A-Z][0-9]{1,2}(,[A-Z][0-9]{1,2}){0,19}$/;
const MAX_FIELD_CHARS = 200_000;
const MAX_STREAM_EVENTS = 200;

// Last line of defence for rubric line G2 (no credentials in traces).
const SECRET_PATTERNS = [
  /\bsk-[A-Za-z0-9_-]{16,}/g,
  /\bsk-lf-[A-Za-z0-9-]{8,}/g,
  /\bpk-lf-[A-Za-z0-9-]{8,}/g,
  /\bAIza[0-9A-Za-z_-]{30,}/g,
  /\bBearer\s+[A-Za-z0-9._~+/-]{16,}=*/g,
];

export function maskSecrets(text) {
  if (typeof text !== "string") return text;
  return SECRET_PATTERNS.reduce((out, pattern) => out.replace(pattern, "[REDACTED]"), text);
}

const digest = (value) => createHash("sha256").update(String(value)).digest();

function tokenMatches(given, expected) {
  if (typeof given !== "string" || !given) return false;
  return timingSafeEqual(digest(given), digest(expected));
}

function label(value) {
  return typeof value === "string" && LABEL.test(value) ? value : undefined;
}

// JSON-safe copy with functions dropped and long strings cut, so tool
// arguments (which can include dependency objects) never break export.
export function toPayload(value, depth = 0, seen = new WeakSet()) {
  if (value === undefined || typeof value === "function" || typeof value === "symbol") return undefined;
  if (value === null || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "string") {
    return value.length > MAX_FIELD_CHARS ? `${value.slice(0, MAX_FIELD_CHARS)}…[truncated]` : value;
  }
  if (value instanceof Error) return { error: value.name, message: value.message };
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "bigint") return String(value);
  if (depth >= 8) return "[depth limit]";
  if (seen.has(value)) return "[circular]";
  seen.add(value);
  if (Array.isArray(value)) return value.slice(0, 200).map((item) => toPayload(item, depth + 1, seen) ?? null);
  const proto = Object.getPrototypeOf(value);
  // SDK clients and other class instances are injected dependencies, not data.
  if (proto !== Object.prototype && proto !== null) return `[${value.constructor?.name || "object"}]`;
  const out = {};
  for (const [key, item] of Object.entries(value).slice(0, 200)) {
    const copied = toPayload(item, depth + 1, seen);
    if (copied !== undefined) out[key] = copied;
  }
  return out;
}

// Runs `work` and calls `done(error, result)` once it settles, keeping sync
// results sync so wrapped tools behave exactly as before.
function settle(work, done) {
  let result;
  try {
    result = work();
  } catch (error) {
    done(error);
    throw error;
  }
  if (result && typeof result.then === "function") {
    return result.then(
      (value) => {
        done(null, value);
        return value;
      },
      (error) => {
        done(error);
        throw error;
      },
    );
  }
  done(null, result);
  return result;
}

function traceNameFor(path) {
  return (
    String(path || "")
      .replace(/^\/api\/(v1\/)?/, "")
      .replace(/[^A-Za-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "api"
  );
}

// What the client ended up with, keyed by event name; repeated events
// (itinerary chunks, errors) become lists in arrival order.
function streamResult(events) {
  const grouped = {};
  for (const { event, data } of events) (grouped[event] ??= []).push(data);
  return Object.fromEntries(Object.entries(grouped).map(([event, list]) => [event, list.length === 1 ? list[0] : list]));
}

// SSE responses are captured as the list of events the client received.
function parseSse(chunk) {
  const events = [];
  for (const block of String(chunk).split("\n\n")) {
    const eventLine = block.match(/^event: (.+)$/m);
    const dataLine = block.match(/^data: (.+)$/m);
    if (!eventLine) continue;
    let data = dataLine?.[1];
    try {
      data = JSON.parse(data);
    } catch {
      /* keep the raw text */
    }
    events.push({ event: eventLine[1], data });
  }
  return events;
}

async function defaultLoadSdk() {
  const [{ NodeTracerProvider }, { AsyncLocalStorageContextManager }, otelApi, langfuseOtel, langfuseTracing] =
    await Promise.all([
      import("@opentelemetry/sdk-trace-node"),
      import("@opentelemetry/context-async-hooks"),
      import("@opentelemetry/api"),
      import("@langfuse/otel"),
      import("@langfuse/tracing"),
    ]);
  return { NodeTracerProvider, AsyncLocalStorageContextManager, otelApi, langfuseOtel, langfuseTracing };
}

export function evalCaptureConfig(env = process.env) {
  const nodeMajor = Number(process.versions.node.split(".")[0]);
  const config = {
    requested: env.EVAL_CAPTURE_ENABLED === "true",
    token: env.EVAL_CAPTURE_TOKEN || "",
    publicKey: env.LANGFUSE_PUBLIC_KEY || "",
    secretKey: env.LANGFUSE_SECRET_KEY || "",
    // The v6 SDK reads LANGFUSE_BASE_URL; LANGFUSE_HOST is the older name.
    baseUrl: env.LANGFUSE_BASE_URL || env.LANGFUSE_HOST || "",
    environment: env.LANGFUSE_TRACING_ENVIRONMENT || "eval",
    release: env.RAILWAY_GIT_COMMIT_SHA || env.TRACE_BUILD || undefined,
  };
  const problems = [];
  if (config.token.length < MIN_TOKEN_LENGTH) problems.push(`EVAL_CAPTURE_TOKEN must be at least ${MIN_TOKEN_LENGTH} characters`);
  if (!config.publicKey || !config.secretKey) problems.push("LANGFUSE_PUBLIC_KEY and LANGFUSE_SECRET_KEY are required");
  if (!config.baseUrl) problems.push("LANGFUSE_BASE_URL is required");
  if (nodeMajor < 22) problems.push("the Langfuse SDK needs Node 22 or newer");
  return { ...config, problems, enabled: config.requested && problems.length === 0 };
}

/**
 * @param {object} [options]
 * @param {object} [options.env]        - Environment (defaults to process.env)
 * @param {object} [options.exporter]   - Span exporter override (tests)
 * @param {Function} [options.loadSdk]  - SDK loader override (tests)
 */
export function createEvalCapture({ env = process.env, exporter, loadSdk = defaultLoadSdk } = {}) {
  const store = new AsyncLocalStorage();
  let sdkPromise = null;
  let cached = null;
  // Read lazily: this module is imported before server.js loads .env.
  const settings = () => {
    if (cached) return cached;
    cached = evalCaptureConfig(env);
    if (cached.requested && !cached.enabled) log.warn("eval-capture:disabled", { reasons: cached.problems });
    return cached;
  };

  function sdk() {
    sdkPromise ??= (async () => {
      const config = settings();
      const lib = await loadSdk();
      const { NodeTracerProvider, AsyncLocalStorageContextManager, otelApi, langfuseOtel, langfuseTracing } = lib;
      // Context propagation is needed for trace-level attributes. Nothing else
      // in the app uses OpenTelemetry, so registering the manager is harmless,
      // and the provider itself stays isolated (not global).
      otelApi.context.setGlobalContextManager(new AsyncLocalStorageContextManager().enable());
      const processor = new langfuseOtel.LangfuseSpanProcessor({
        publicKey: config.publicKey,
        secretKey: config.secretKey,
        baseUrl: config.baseUrl,
        environment: config.environment,
        release: config.release,
        exporter,
        mask: ({ data }) => maskSecrets(data),
      });
      const provider = new NodeTracerProvider({ spanProcessors: [processor] });
      langfuseTracing.setLangfuseTracerProvider(provider);
      return { ...lib, processor, provider };
    })();
    return sdkPromise;
  }

  const active = () => Boolean(store.getStore());

  /** Express middleware. Must run after the JSON body parser. */
  function middleware(req, res, next) {
    const config = settings();
    if (!config.enabled || !req.path?.startsWith("/api/")) return next();
    const given = req.get?.(TOKEN_HEADER);
    if (!given) return next();
    if (!tokenMatches(given, config.token)) {
      // Same response as no header: a wrong token gets ordinary, uncaptured handling.
      return next();
    }
    const client = CLIENTS.has(req.get("x-eval-client")) ? req.get("x-eval-client") : "unknown";
    const caseId = label(req.get("x-eval-case"));
    const runId = label(req.get("x-eval-run"));
    const rubric = RUBRIC_LINES.test(req.get("x-eval-rubric") || "") ? req.get("x-eval-rubric").split(",") : undefined;
    const step = label(req.get("x-eval-step"));
    // Calls of one trip share a journey id. It becomes the Langfuse session, so parse, stream, packing and
    // safety calls read together; the run label stays a tag. Without one, the run label is the session.
    const journeyHeader = req.get("x-journey-id") || "";
    const journeyId = HEX_ID.test(journeyHeader) ? journeyHeader : undefined;
    const runtimeHeader = String(res.getHeader?.("X-Trace-Id") || "");
    const runtimeTraceId = HEX_ID.test(runtimeHeader) ? runtimeHeader : undefined;

    sdk()
      .then(({ langfuseTracing }) => {
        const tags = ["eval", `client:${client}`];
        if (caseId) tags.push(`case:${caseId}`);
        if (runId) tags.push(`run:${runId}`);
        if (step) tags.push(`step:${step}`);
        langfuseTracing.propagateAttributes(
          {
            traceName: traceNameFor(req.path),
            sessionId: journeyId || runId,
            tags,
            metadata: {
              client,
              ...(caseId && { case_id: caseId }),
              ...(runId && { run_id: runId }),
              ...(journeyId && { journey_id: journeyId }),
              ...(step && { step }),
              ...(runtimeTraceId && { runtime_trace_id: runtimeTraceId }),
              ...(rubric && { rubric_lines: rubric }),
            },
          },
          () =>
            langfuseTracing.startActiveObservation(
              traceNameFor(req.path),
              (root) => {
                // The trip request is what a reviewer reads first; routing goes in metadata.
                root.update({
                  input: toPayload(req.body),
                  metadata: { method: req.method, path: req.path, query: toPayload(req.query) },
                });
                // Lets a caller open this trace, and lets the runtime tracer record which eval trace it matches.
                if (HEX_ID.test(String(root.traceId || "")) && !res.headersSent) res.setHeader("X-Langfuse-Trace-Id", root.traceId);
                captureResponse(res, root);
                store.run({ parent: root }, next);
              },
              { asType: "chain", endOnExit: false },
            ),
        );
      })
      .catch((error) => {
        log.warn("eval-capture:setup-failed", { error: error.message });
        next();
      });
  }

  function captureResponse(res, root) {
    const events = [];
    let jsonBody;
    const originalJson = res.json?.bind(res);
    const originalWrite = res.write?.bind(res);
    if (originalJson) {
      res.json = (body) => {
        jsonBody = body;
        return originalJson(body);
      };
    }
    if (originalWrite) {
      res.write = (chunk, ...rest) => {
        if (events.length < MAX_STREAM_EVENTS) events.push(...parseSse(chunk).slice(0, MAX_STREAM_EVENTS - events.length));
        return originalWrite(chunk, ...rest);
      };
    }
    let ended = false;
    const end = () => {
      if (ended) return;
      ended = true;
      const failed = res.statusCode >= 400 || events.some((e) => e.event === "error");
      root.update({
        output: toPayload(jsonBody !== undefined ? jsonBody : streamResult(events)),
        metadata: {
          http_status: res.statusCode,
          route: res.req?.route?.path,
          client_disconnected: !res.writableFinished,
          ...(events.length && { stream_events: events.map((e) => e.event) }),
        },
        ...(failed && { level: "ERROR", statusMessage: `HTTP ${res.statusCode}` }),
      });
      root.end();
      // Eval traffic is light; export now so a runner can read the trace back.
      sdkPromise?.then(({ processor }) => processor.forceFlush()).catch(() => {});
    };
    res.once?.("finish", end);
    res.once?.("close", end);
  }

  /**
   * Run `operation` as a child observation of the current eval trace.
   * A no-op outside eval requests.
   */
  function observe(name, { asType = "tool", input } = {}, operation) {
    const current = store.getStore();
    if (!current) return operation();
    const observation = current.parent.startObservation(name, input === undefined ? {} : { input: toPayload(input) }, { asType });
    return store.run({ parent: observation }, () =>
      settle(operation, (error, result) => {
        observation.update(
          error
            ? { level: "ERROR", statusMessage: error.message, output: toPayload({ error }) }
            : { output: toPayload(result) },
        );
        observation.end();
      }),
    );
  }

  /**
   * Record one model attempt. Returns a handle with `end(outcome)`, or null
   * outside eval requests so callers can skip all work.
   */
  function startGeneration({ caller, provider, model, system, user, temperature, maxTokens, effort, attempt }) {
    const current = store.getStore();
    if (!current) return null;
    const generation = current.parent.startObservation(
      `generate.${caller || "unknown"}`,
      {
        model,
        modelParameters: toPayload({ temperature, max_tokens: maxTokens, effort }),
        input: [
          { role: "system", content: toPayload(system) },
          { role: "user", content: toPayload(user) },
        ],
        metadata: { caller, provider, attempt },
      },
      { asType: "generation" },
    );
    let ended = false;
    return {
      end({ output, stopReason, usage, error, validation }) {
        if (ended) return;
        ended = true;
        const usageDetails = {};
        if (Number.isFinite(usage?.inputTokens)) usageDetails.input = usage.inputTokens;
        // Providers bill reasoning as output, so the billed total contains it; Langfuse wants the buckets exclusive.
        const reasoning = Number.isFinite(usage?.reasoningTokens) ? usage.reasoningTokens : 0;
        if (Number.isFinite(usage?.outputTokens)) usageDetails.output = Math.max(0, usage.outputTokens - reasoning);
        if (reasoning > 0) usageDetails.output_reasoning_tokens = reasoning;
        generation.update({
          ...(output !== undefined && { output: toPayload(output) }),
          ...(Object.keys(usageDetails).length && { usageDetails }),
          ...(Number.isFinite(usage?.costUsd) && { costDetails: { total: usage.costUsd } }),
          metadata: { caller, provider, attempt, stop_reason: stopReason ?? null, validation },
          ...(error && { level: "ERROR", statusMessage: error.message }),
        });
        generation.end();
      },
    };
  }

  async function flush() {
    if (!sdkPromise) return;
    const { processor } = await sdkPromise;
    await processor.forceFlush();
  }

  async function shutdown() {
    if (!sdkPromise) return;
    const { provider } = await sdkPromise;
    await provider.shutdown();
  }

  return { settings, active, middleware, observe, startGeneration, flush, shutdown };
}

export const evalCapture = createEvalCapture();
