#!/usr/bin/env node
// Prints trip latency by client from the production trace buffer.
//
//   OPS_SECRET=... node scripts/trace-latency.mjs --base=https://<backend> [--include-eval]
//
// The buffer holds recent requests only (see TRACE_ARCHIVE_PATH for a longer record).
import { summarizeLatency } from "./lib/traceLatency.mjs";

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const [key, ...rest] = a.replace(/^--/, "").split("=");
  return [key, rest.length ? rest.join("=") : true];
}));
const base = String(args.base || "").replace(/\/$/, "");
if (!base || !process.env.OPS_SECRET) {
  console.error("Usage: OPS_SECRET=... node scripts/trace-latency.mjs --base=<url> [--include-eval]");
  process.exit(2);
}
const res = await fetch(`${base}/api/v1/ops/traces`, { headers: { "x-ops-secret": process.env.OPS_SECRET } });
if (!res.ok) { console.error(`Trace request failed: ${res.status}`); process.exit(1); }
const { traces = [], archive } = await res.json();
console.log(`${traces.length} traces in the buffer. Archive ${archive?.enabled ? "on" : "off"}.`);
const seconds = (ms) => (ms == null ? "n/a" : `${(ms / 1000).toFixed(1)} s`);
for (const [client, group] of Object.entries(summarizeLatency(traces, { includeEval: Boolean(args["include-eval"]) }))) {
  console.log(`\n${client}: ${group.trips} trips${group.evalTripsExcluded ? ` (${group.evalTripsExcluded} eval trips left out)` : ""}`);
  for (const [name, s] of Object.entries(group.browser)) if (s.count) console.log(`  ${name.padEnd(42)} median ${seconds(s.medianMs)}  (${s.count})`);
  for (const [label, s] of Object.entries(group.steps)) console.log(`  ${label.padEnd(42)} median ${seconds(s.medianMs)}  (${s.count})`);
}
