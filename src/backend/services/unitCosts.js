// Use only the receipt for each provider attempt. Parent spans and the separate
// trip_metrics estimate describe the same spend and must never be added here.
const primary = new Set([
  "POST /api/v1/trip/stream", "POST /api/v1/trip/bundle", "POST /api/v1/trip/plan",
  "POST /api/trip-plan", "mcp.plan_trip",
]);
const associated = new Set([
  "POST /api/v1/trip/parse-input", "POST /api/v1/trip/packing", "POST /api/generate",
  "POST /api/safety/travel-tips", "POST /api/safety/car-seat-check",
  "POST /api/v1/safety/car-seat-check", "POST /api/v1/safety/pet-travel-check",
  "POST /api/v1/trip/resolve", "POST /api/resolve-destination", "POST /api/v1/trip/route-attractions",
]);
const blank = () => ({ units: 0, estimatedAiUsd: 0, usdPerUnit: null, attempts: 0, unpricedAttempts: 0, incompleteTraces: 0 });
const rounded = n => Math.round(n * 1e9) / 1e9;

function addAttempts(row, trace) {
  if (!trace.meta.complete) row.incompleteTraces++;
  for (const span of trace.spans) {
    if (span.label !== "ai.attempt") continue;
    row.attempts++;
    if (Number.isFinite(span.cost_usd) && span.cost_usd >= 0) row.estimatedAiUsd += span.cost_usd;
    else row.unpricedAttempts++;
  }
}

// Window-level cost per delivered output, including unsuccessful work in the
// numerator. A linked stream + fallback bundle represents one trip submission.
export function summarizeUnitCosts(traces) {
  const trip = blank(), extraction = blank(), share = blank(), queuedLink = blank();
  const completedJourneys = new Set();
  const coverage = { measuredTraces: 0, legacyTraces: 0, excludedUnlinkedTripRequests: 0 };
  let candidates = 0, facts = 0;
  const runs = new Map(traces.filter(t => t?.meta?.run_id).map(t => [t.meta.run_id, t]));
  for (const trace of runs.values()) {
    const { meta, spans } = trace;
    if (meta.source !== "runtime" || meta.eval_trace_id || !spans?.length) continue;
    if (meta.cost_attribution_version !== 1) { coverage.legacyTraces++; continue; }
    coverage.measuredTraces++;
    const root = spans[0];
    const delivered = root.status === "ok" && (root.detail.http_status ?? 200) < 300;
    const work = spans.find(s => s.label === "social.extract");
    if (work) {
      addAttempts(extraction, trace);
      if (work.status === "ok" && work.detail.candidate_count > 0) {
        extraction.units++;
        candidates += work.detail.candidate_count;
        facts += work.detail.fact_count;
      }
    } else if (spans.some(s => s.label === "social.linkQueued")) {
      addAttempts(queuedLink, trace);
      queuedLink.units++;
    } else if (root.label === "POST /api/v1/trip/shares") {
      addAttempts(share, trace);
      if (delivered) share.units++;
    } else if (primary.has(root.label) || associated.has(root.label)) {
      if (!primary.has(root.label) && !meta.journey_id) {
        coverage.excludedUnlinkedTripRequests++;
        continue;
      }
      addAttempts(trip, trace);
      if (primary.has(root.label) && delivered) completedJourneys.add(meta.journey_id || meta.run_id);
    }
  }
  trip.units = completedJourneys.size;
  const candidate = { ...extraction, units: candidates };
  const fact = { ...extraction, units: facts };
  for (const row of [trip, extraction, candidate, fact, share, queuedLink]) {
    row.estimatedAiUsd = rounded(row.estimatedAiUsd);
    if (row.units && !row.unpricedAttempts && !row.incompleteTraces)
      row.usdPerUnit = rounded(row.estimatedAiUsd / row.units);
  }
  return { trip, extraction, candidate, fact, share, queuedLink, coverage };
}
