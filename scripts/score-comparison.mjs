#!/usr/bin/env node
// Scores a model comparison run (scripts/compare-models.mjs) without a person: structure and constraints from the
// saved responses, timing from the runner and server log, and tokens from Langfuse. Writes one summary JSON.
//
//   railway run --service SproutRoute -- node scripts/score-comparison.mjs --dir=<raw run dir> --out=<summary.json>
//
// Needs the Langfuse keys (read from the Railway environment, never printed) to read each call's token usage.
import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { CASES } from "./eval-cases.mjs";
import { MODELS } from "./compare-models.mjs";
import { parseSse, mergePlan, scorePlan, scoreParse, scoreTips, percentile } from "./eval-scoring.mjs";

const caseById = new Map(CASES.map((c) => [c.id, c]));
const mean = (xs) => { const v = xs.filter(Number.isFinite); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
const rate = (xs) => (xs.length ? xs.filter(Boolean).length / xs.length : null);
const sum = (xs) => xs.filter(Number.isFinite).reduce((a, b) => a + b, 0);

export function readJsonl(file) {
  return existsSync(file) ? readFileSync(file, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)) : [];
}

/** Server log lines are JSON objects; anything else (npm noise, banners) is skipped. */
export function readServerLog(file) {
  if (!existsSync(file)) return [];
  const out = [];
  for (const line of readFileSync(file, "utf8").split("\n")) {
    if (!line.startsWith("{")) continue;
    try { out.push(JSON.parse(line)); } catch { /* skip */ }
  }
  return out;
}

/**
 * One entry per finished stream request, in order. A request ends in `stream:done` or, when the itinerary fails,
 * `stream:itinerary-fail`, so failed requests are entries too and cannot shift the timings that follow them.
 * Each entry has the server's timing (null for a failure) and the stops the hours check corrected for it.
 */
export function streamTimings(log) {
  const entries = [];
  let corrections = 0;
  for (const entry of log) {
    if (entry.msg === "trip-plan:hours-corrected") corrections += entry.changes?.length || 0;
    if (entry.msg === "stream:done" || entry.msg === "stream:itinerary-fail") {
      entries.push({ outcome: entry.msg === "stream:done" ? "done" : "fail", reqId: entry.reqId ?? null, timing: entry.timing ?? null, hoursCorrections: corrections });
      corrections = 0;
    }
  }
  return entries;
}

/** The log entry for each stream call, in order. A call with no matching entry (it never reached the logging) gets null. */
export function alignTimings(calls, entries) {
  let next = 0;
  return calls.map((call) => {
    const want = call.failed ? "fail" : "done";
    for (let i = next; i < entries.length; i += 1) {
      if (entries[i].outcome === want) { next = i + 1; return entries[i]; }
    }
    return null;
  });
}

/**
 * The model calls Langfuse recorded for a trace, or null when their usage is not available (no trace id, nothing
 * ingested after the retries). Unavailable is not the same as free, so callers must not price it at zero. A rejected
 * key is an error, because every later call would silently come back empty.
 */
export async function generationsFor(traceId, auth, base, { fetchFn = fetch, retries = 6, waitMs = 5000 } = {}) {
  if (!traceId) return null;
  for (let attempt = 0; attempt < retries; attempt += 1) {
    const res = await fetchFn(`${base}/api/public/v2/observations?traceId=${traceId}&type=GENERATION&fields=core,basic,usage,model,time`, { headers: { Authorization: auth } });
    if (res.status === 401 || res.status === 403) throw new Error(`Langfuse rejected the key (HTTP ${res.status})`);
    if (res.ok) {
      const { data } = await res.json();
      if (data?.length) return data.map((o) => ({ name: o.name, model: o.model ?? o.providedModelName, input: o.usageDetails?.input ?? 0, output: o.usageDetails?.output ?? 0, latency: o.latency }));
    }
    if (waitMs) await new Promise((r) => setTimeout(r, waitMs)); // ingestion lag
  }
  return null;
}

const costOf = (price, gens) => sum(gens.map((g) => (g.input * price.in + g.output * price.out) / 1e6));

export async function scoreConfig(dir, name, { auth, base, generations = (trace) => generationsFor(trace, auth, base) }) {
  const meta = JSON.parse(readFileSync(path.join(dir, "meta.json"), "utf8"));
  const price = MODELS[name]?.price || meta.price;
  const calls = readJsonl(path.join(dir, "calls.jsonl"));
  const timings = streamTimings(readServerLog(path.join(dir, "server.log")));
  const rows = { parse: [], plan: [], tips: [] };
  const failedStream = (c) => c.status !== 200 || Boolean(c.error) || /^event: error$/m.test(c.body || "");
  const streamCalls = calls.filter((c) => c.step === "stream" && caseById.has(c.case));
  const aligned = alignTimings(streamCalls.map((c) => ({ failed: failedStream(c) })), timings);
  let streamIndex = 0;

  for (const call of calls) {
    const testCase = caseById.get(call.case);
    if (!testCase) continue;
    const gens = await generations(call.trace);
    const tokens = gens ? { input: sum(gens.map((g) => g.input)), output: sum(gens.map((g) => g.output)) } : null;
    const cost = gens ? costOf(price, gens) : null;
    if (call.step === "parse") {
      let result = null;
      try { result = JSON.parse(call.body); } catch { /* scored as a failure below */ }
      const score = result ? scoreParse(testCase.expect, result) : { pass: false, failed: ["unparseable"], checks: {} };
      rows.parse.push({ case: call.case, status: call.status, ms: call.ms, pass: call.status === 200 && score.pass, failed: score.failed, tokens, cost });
    } else if (call.step === "stream") {
      const merged = mergePlan(parseSse(call.body));
      const score = scorePlan(testCase.body, merged);
      const server = aligned[streamIndex++] || {};
      rows.plan.push({
        case: call.case, status: call.status, ms: call.ms, firstChunkMs: server.timing?.firstChunk ?? null,
        hoursCorrections: server.hoursCorrections ?? null, ...score, tokens, cost,
      });
    } else if (call.step === "travel-tips") {
      let tips = null;
      try { tips = JSON.parse(call.body); } catch { /* invalid */ }
      const score = call.status === 200 ? scoreTips(testCase.countryCode, tips, { hasChildren: (testCase.body.children || []).length > 0 }) : { valid: false, problems: [`status ${call.status}`] };
      rows.tips.push({ case: call.case, status: call.status, ms: call.ms, valid: score.valid, problems: score.problems, tokens, cost });
    }
  }

  const stopsTotal = sum(rows.plan.map((r) => r.stops));
  return {
    meta: { name, provider: meta.provider, model: meta.model, effort: meta.effort ?? null, thinking: meta.thinking ?? null, price, note: MODELS[name]?.note },
    parse: {
      n: rows.parse.length, passRate: rate(rows.parse.map((r) => r.pass)), failures: rows.parse.filter((r) => !r.pass).map((r) => ({ case: r.case, failed: r.failed })),
      p50Ms: percentile(rows.parse.map((r) => r.ms), 50), p95Ms: percentile(rows.parse.map((r) => r.ms), 95),
      meanCost: mean(rows.parse.map((r) => r.cost)), meanOutputTokens: mean(rows.parse.map((r) => r.tokens?.output)),
    },
    plan: {
      n: rows.plan.length, completeRate: rate(rows.plan.map((r) => r.complete)), problems: rows.plan.filter((r) => !r.complete).map((r) => ({ case: r.case, problems: r.problems })),
      p50Ms: percentile(rows.plan.map((r) => r.ms), 50), p95Ms: percentile(rows.plan.map((r) => r.ms), 95), maxMs: Math.max(...rows.plan.map((r) => r.ms), 0),
      meanCost: mean(rows.plan.map((r) => r.cost)), meanOutputTokens: mean(rows.plan.map((r) => r.tokens?.output)),
      durationInRange: mean(rows.plan.map((r) => r.durationInRange)), kidFriendlyShare: mean(rows.plan.map((r) => r.kidFriendlyShare)),
      petFriendlyShare: mean(rows.plan.map((r) => r.petFriendlyShare)), groundedRatio: mean(rows.plan.map((r) => r.groundedRatio)),
      destinationKeptRate: rate(rows.plan.map((r) => r.destinationKept)),
      thinDaysPerPlan: mean(rows.plan.filter((r) => r.complete).map((r) => r.thinDays)),
      repeatedStopsPerPlan: mean(rows.plan.filter((r) => r.complete).map((r) => r.repeatedStops)),
      repeatedStopsLongTrips: mean(rows.plan.filter((r) => r.complete && r.expectedDays > 3).map((r) => r.repeatedStops)),
      hoursCorrectionsPer10Stops: stopsTotal ? (sum(rows.plan.map((r) => r.hoursCorrections)) / stopsTotal) * 10 : null,
      stops: stopsTotal,
    },
    tips: {
      n: rows.tips.length, validRate: rate(rows.tips.map((r) => r.valid)), failures: rows.tips.filter((r) => !r.valid).map((r) => ({ case: r.case, problems: r.problems })),
      p50Ms: percentile(rows.tips.map((r) => r.ms), 50), meanCost: mean(rows.tips.map((r) => r.cost)), meanOutputTokens: mean(rows.tips.map((r) => r.tokens?.output)),
    },
    totalCost: sum([...rows.parse, ...rows.plan, ...rows.tips].map((r) => r.cost)),
    // Calls whose token usage could not be read. They are left out of every cost figure, which is therefore a floor.
    unpricedCalls: [...rows.parse, ...rows.plan, ...rows.tips].filter((r) => r.cost === null).length,
    rows,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, ...r] = a.replace(/^--/, "").split("="); return [k, r.length ? r.join("=") : true]; }));
  if (!args.dir || !args.out) { console.error("Usage: node scripts/score-comparison.mjs --dir=<raw run dir> --out=<summary.json>"); process.exit(2); }
  const auth = `Basic ${Buffer.from(`${process.env.LANGFUSE_PUBLIC_KEY}:${process.env.LANGFUSE_SECRET_KEY}`).toString("base64")}`;
  const base = String(process.env.LANGFUSE_BASE_URL || "").replace(/\/$/, "");
  const summary = { scoredAt: new Date().toISOString(), configs: {} };
  for (const name of readdirSync(args.dir).filter((d) => existsSync(path.join(args.dir, d, "meta.json"))).sort()) {
    summary.configs[name] = await scoreConfig(path.join(args.dir, name), name, { auth, base });
    const c = summary.configs[name];
    console.log(JSON.stringify({ name, parsePass: c.parse.passRate, planComplete: c.plan.completeRate, planP50: c.plan.p50Ms, tipsValid: c.tips.validRate, totalCost: Number(c.totalCost.toFixed(4)) }));
  }
  writeFileSync(args.out, JSON.stringify(summary, null, 2));
}
