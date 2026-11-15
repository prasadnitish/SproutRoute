import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { createTracer } from "../../src/backend/services/tracing.js";

test("browser and server traces use the same deployed environment and build", async (t) => {
  const keys = ["TRACE_ENVIRONMENT", "TRACE_BUILD", "NODE_ENV", "RAILWAY_GIT_COMMIT_SHA"];
  const saved = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  t.after(() => {
    for (const key of keys) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });
  delete process.env.TRACE_ENVIRONMENT;
  delete process.env.TRACE_BUILD;
  process.env.NODE_ENV = "production";
  process.env.RAILWAY_GIT_COMMIT_SHA = "deployed-sha";
  const tracer = createTracer();
  await tracer.run("request", {}, () => {});
  tracer.recordClient({ journey_id: "a".repeat(32), events: [{ name: "parsed", ms: 1 }] });
  for (const trace of tracer.snapshot()) {
    assert.equal(trace.meta.environment, "production");
    assert.equal(trace.meta.build, "deployed-sha");
  }
});

test("isolates concurrent contexts, preserves nesting, strips unsafe metadata", async () => {
  const tracer = createTracer({ limit: 5 });
  const run = () =>
    tracer.run("api.trip", {}, async () => {
      await tracer.span(
        "tool.weather",
        { provider: "weather", prompt: "SECRET", location: "HOME" },
        async () => {},
      );
      await assert.rejects(
        tracer.span("tool.failed", {}, async () => {
          throw Error("SECRET");
        }),
      );
    });
  await Promise.all([run(), run()]);
  const traces = tracer.snapshot();
  assert.equal(traces.length, 2);
  for (const t of traces) {
    assert.equal(t.spans.length, 3);
    assert.equal(t.spans[1].parent_span_id, t.spans[0].span_id);
    assert.equal(t.spans[2].status, "error");
    assert.ok(t.spans.every((s) => s.end_ms >= s.start_ms));
    assert.equal(t.meta.complete, true);
  }
  assert.ok(!JSON.stringify(traces).includes("SECRET"));
  assert.ok(!JSON.stringify(traces).includes("HOME"));
});
test("preserves sync values, limits history and marks dropped spans", async () => {
  const t = createTracer({ limit: 1, maxSpans: 2 });
  await t.run("run", {}, () => {
    assert.equal(
      t.span("sync", {}, () => 42),
      42,
    );
    t.span("excess", {}, () => 0);
  });
  assert.equal(t.snapshot()[0].meta.dropped_spans, 1);
  assert.equal(t.snapshot()[0].meta.complete, false);
  await t.run("second", {}, () => {});
  assert.equal(t.snapshot().length, 1);
});
test("null usage stays unknown and untrusted journey identifiers are rejected", async () => {
  const t = createTracer();
  await t.run("run", { journey_id: "private@example.com" }, () => {});
  const trace = t.snapshot()[0];
  assert.equal(trace.meta.journey_id, null);
  assert.equal(trace.spans[0].cost_usd, null);
});
test("browser evidence rejects private names and invalid durations", () => {
  const t = createTracer();
  for (const events of [
    [{ name: "alice@example.com", ms: 1 }],
    [{ name: "parsed", ms: -1 }],
    [{ name: "parsed", ms: Infinity }],
  ])
    assert.throws(() => t.recordClient({ journey_id: "a".repeat(32), events }));
  t.recordClient({
    journey_id: "a".repeat(32),
    events: [{ name: "parsed", ms: 1 }],
  });
  assert.equal(
    t.snapshot()[0].meta.source,
    "browser-reported; stream milestones only",
  );
});

function fakeResponse() {
  const headers = {};
  return Object.assign(new EventEmitter(), {
    statusCode: 200, writableFinished: true,
    setHeader: (k, v) => { headers[k.toLowerCase()] = v; },
    getHeader: (k) => headers[k.toLowerCase()],
  });
}

async function traceOneRequest(evalTraceId) {
  const t = createTracer();
  const res = fakeResponse();
  const req = { path: "/api/v1/trip/stream", method: "POST", route: { path: "/api/v1/trip/stream" }, get: () => "c".repeat(32) };
  t.middleware(req, res, () => {
    if (evalTraceId !== undefined) res.setHeader("X-Langfuse-Trace-Id", evalTraceId);
    setImmediate(() => res.emit("finish"));
  });
  await new Promise((resolve) => setTimeout(resolve, 20));
  return t.snapshot().at(-1);
}

test("a runtime trace records the eval trace id of the same request, next to the journey id", async () => {
  const trace = await traceOneRequest("ab".repeat(16));
  assert.equal(trace.meta.eval_trace_id, "ab".repeat(16));
  assert.equal(trace.meta.journey_id, "c".repeat(32));
});

test("an eval trace id that is not a 32 character hex id is not recorded", async () => {
  assert.equal((await traceOneRequest("user@example.com")).meta.eval_trace_id, undefined);
  assert.equal((await traceOneRequest(undefined)).meta.eval_trace_id, undefined);
});

test("each request trace says which client made it, from an explicit header or the user agent", async () => {
  const { clientOf } = await import("../../src/backend/services/tracing.js");
  const req = (headers) => ({ get: (name) => headers[name.toLowerCase()] });
  assert.equal(clientOf(req({ "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 27_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1" })), "web");
  assert.equal(clientOf(req({ "user-agent": "SproutRoute/18 CFNetwork/3826.500.111 Darwin/27.2.0" })), "ios");
  assert.equal(clientOf(req({ "user-agent": "node" })), "other");
  assert.equal(clientOf(req({})), "other");
  assert.equal(clientOf(req({ "user-agent": "node", "x-eval-client": "web" })), "web");
  assert.equal(clientOf(req({ "user-agent": "Mozilla/5.0", "x-sprout-client": "android" })), "android");
  assert.equal(clientOf(req({ "user-agent": "Mozilla/5.0", "x-sprout-client": "<script>" })), "web", "an unknown label is ignored");

  const tracer = createTracer();
  await tracer.run("request", { journey_id: "d".repeat(32), client: "ios" }, () => {});
  await tracer.run("request", { client: "someone@example.com" }, () => {});
  const [labelled, unlabelled] = tracer.snapshot();
  assert.equal(labelled.meta.client, "ios");
  assert.equal(unlabelled.meta.client, "other");
});

test("browser milestones are labelled web and can include the wait on the ages question", () => {
  const tracer = createTracer();
  tracer.recordClient({
    journey_id: "e".repeat(32),
    events: [{ name: "submitted", ms: 0 }, { name: "parsed", ms: 3000 }, { name: "ages_asked", ms: 3001 }, { name: "ages_answered", ms: 20000 }, { name: "stream_done", ms: 60000 }],
  });
  const [trace] = tracer.snapshot();
  assert.equal(trace.meta.client, "web");
  assert.deepEqual(trace.spans.map((s) => s.label), ["browser.submitted", "browser.parsed", "browser.ages_asked", "browser.ages_answered", "browser.stream_done"]);
});
