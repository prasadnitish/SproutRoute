import test from "node:test";
import assert from "node:assert/strict";
import { summarizeLatency } from "../../scripts/lib/traceLatency.mjs";

const server = (journey, client, label, ms, extra = {}) => ({
  meta: { journey_id: journey, client, source: "runtime", ...extra },
  spans: [{ label, kind: "tool", start_ms: 0, end_ms: ms, detail: { http_status: 200 } }],
});
const browser = (journey, events) => ({
  meta: { journey_id: journey, client: "web", source: "browser-reported; stream milestones only" },
  spans: Object.entries(events).map(([name, ms]) => ({ label: `browser.${name}`, kind: "milestone", start_ms: 0, end_ms: ms })),
});

test("latency is grouped by client, one row per trip, with medians per step", () => {
  const traces = [
    server("a", "web", "POST /api/v1/trip/parse-input", 3000),
    server("a", "web", "POST /api/v1/trip/stream", 40000),
    browser("a", { submitted: 0, parsed: 3400, stream_destination: 4300, "stream_itinerary-chunk": 27000, stream_done: 49000 }),
    server("b", "web", "POST /api/v1/trip/parse-input", 5000),
    server("b", "web", "POST /api/v1/trip/stream", 60000),
    browser("b", { submitted: 0, parsed: 5200, ages_asked: 5201, ages_answered: 25201, stream_destination: 26000, stream_done: 91000 }),
    server("c", "ios", "POST /api/v1/trip/stream", 30000),
    server(null, "other", "GET /api/health", 2),
    server("d", "web", "POST /api/v1/trip/stream", 1000, { eval_trace_id: "f".repeat(32) }),
  ];
  const summary = summarizeLatency(traces);
  assert.deepEqual(Object.keys(summary).sort(), ["ios", "web"]);
  assert.equal(summary.web.trips, 2);
  assert.equal(summary.web.evalTripsExcluded, 1);
  assert.equal(summary.web.steps["POST /api/v1/trip/stream"].medianMs, 50000);
  assert.equal(summary.web.steps["POST /api/v1/trip/parse-input"].count, 2);
  assert.equal(summary.web.browser.toFinishedPlan.medianMs, 60000, "the 20 s spent on the ages question is taken out: 49000 and 71000");
  assert.equal(summary.web.browser.toFirstItinerary.count, 1);
  assert.equal(summary.ios.trips, 1);
  assert.equal(summary.ios.browser.toFinishedPlan.count, 0);
});

test("eval runs can be included when asked", () => {
  const traces = [server("d", "web", "POST /api/v1/trip/stream", 1000, { eval_trace_id: "f".repeat(32) })];
  assert.equal(summarizeLatency(traces, { includeEval: true }).web.trips, 1);
  const left = summarizeLatency(traces).web;
  assert.equal(left.trips, 0);
  assert.equal(left.evalTripsExcluded, 1);
  assert.deepEqual(left.steps, {});
});
