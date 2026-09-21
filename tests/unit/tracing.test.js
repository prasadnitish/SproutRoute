import test from "node:test";
import assert from "node:assert/strict";
import { createTracer } from "../../src/backend/services/tracing.js";

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
