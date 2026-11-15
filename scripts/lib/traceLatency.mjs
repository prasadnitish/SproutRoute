// Summarises the payload-free traces from GET /api/v1/ops/traces: per client, per trip.
// Eval runs are left out unless asked for, so synthetic traffic does not skew real latency.

const median = (values) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return Math.round(sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2);
};
const stat = (values) => ({ count: values.length, medianMs: median(values) });

export function summarizeLatency(traces, { includeEval = false } = {}) {
  const trips = new Map(); // journey id -> { client, isEval, steps: {label: ms}, browser: {name: ms} }
  for (const trace of traces || []) {
    const journey = trace?.meta?.journey_id;
    if (!journey) continue;
    const trip = trips.get(journey) || { client: null, isEval: false, steps: {}, browser: {} };
    trips.set(journey, trip);
    if (trace.meta.eval_trace_id) trip.isEval = true;
    if (String(trace.meta.source || "").startsWith("browser")) {
      for (const span of trace.spans || []) trip.browser[span.label.replace(/^browser\./, "")] = span.end_ms;
      trip.client ||= "web";
    } else {
      const root = trace.spans?.[0];
      if (root && Number.isFinite(root.end_ms)) trip.steps[root.label] = root.end_ms - root.start_ms;
      if (trace.meta.client && trace.meta.client !== "other") trip.client = trace.meta.client;
    }
  }

  const out = {};
  for (const trip of trips.values()) {
    const client = trip.client || "other";
    const group = (out[client] ||= { trips: 0, evalTripsExcluded: 0, _steps: {}, _browser: { toDestination: [], toFirstItinerary: [], toFinishedPlan: [] } });
    if (trip.isEval && !includeEval) { group.evalTripsExcluded += 1; continue; }
    group.trips += 1;
    for (const [label, ms] of Object.entries(trip.steps)) (group._steps[label] ||= []).push(ms);
    // Time the traveler spent on the ages question is theirs, not the planner's.
    const b = trip.browser;
    const waited = Number.isFinite(b.ages_asked) && Number.isFinite(b.ages_answered) ? Math.max(0, b.ages_answered - b.ages_asked) : 0;
    if (Number.isFinite(b.stream_destination)) group._browser.toDestination.push(b.stream_destination - waited);
    if (Number.isFinite(b["stream_itinerary-chunk"])) group._browser.toFirstItinerary.push(b["stream_itinerary-chunk"] - waited);
    if (Number.isFinite(b.stream_done)) group._browser.toFinishedPlan.push(b.stream_done - waited);
  }
  for (const [client, group] of Object.entries(out)) {
    out[client] = {
      trips: group.trips,
      evalTripsExcluded: group.evalTripsExcluded,
      steps: Object.fromEntries(Object.entries(group._steps).map(([label, values]) => [label, stat(values)])),
      browser: Object.fromEntries(Object.entries(group._browser).map(([name, values]) => [name, stat(values)])),
    };
  }
  return out;
}
