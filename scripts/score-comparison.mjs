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

/** Per stream request, in order: the server's own timing and how many stops the hours check had to correct. */
export function streamTimings(log) {
  const result = [];
  let corrections = 0;
  for (const entry of log) {
    if (entry.msg === "trip-plan:hours-corrected") corrections += entry.changes?.length || 0;
    if (entry.msg === "stream:done") { result.push({ timing: entry.timing, hoursCorrections: corrections }); corrections = 0; }
  }
  return result;
}

async function generationsFor(traceId, auth, base) {
  if (!traceId) return [];
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const res = await fetch(`${base}/api/public/v2/observations?traceId=${traceId}&type=GENERATION&fields=core,basic,usage,model,time`, { headers: { Authorization: auth } });
    if (res.ok) {
      const { data } = await res.json();
      if (data?.length) return data.map((o) => ({ name: o.name, model: o.model ?? o.providedModelName, input: o.usageDetails?.input ?? 0, output: o.usageDetails?.output ?? 0, latency: o.latency }));
    }
    await new Promise((r) => setTimeout(r, 5000)); // ingestion lag
  }
  return [];
}

const costOf = (price, gens) => sum(gens.map((g) => (g.input * price.in + g.output * price.out) / 1e6));

export async function scoreConfig(dir, name, { auth, base }) {
  const meta = JSON.parse(readFileSync(path.join(dir, "meta.json"), "utf8"));
  const price = MODELS[name]?.price || meta.price;
  const calls = readJsonl(path.join(dir, "calls.jsonl"));
  const timings = streamTimings(readServerLog(path.join(dir, "server.log")));
  const rows = { parse: [], plan: [], tips: [] };
  let streamIndex = 0;

  for (const call of calls) {
    const testCase = caseById.get(call.case);
    if (!testCase) continue;
    const gens = await generationsFor(call.trace, auth, base);
    const tokens = { input: sum(gens.map((g) => g.input)), output: sum(gens.map((g) => g.output)) };
    const cost = costOf(price, gens);
    if (call.step === "parse") {
      let result = null;
      try { result = JSON.parse(call.body); } catch { /* scored as a failure below */ }
      const score = result ? scoreParse(testCase.expect, result) : { pass: false, failed: ["unparseable"], checks: {} };
      rows.parse.push({ case: call.case, status: call.status, ms: call.ms, pass: call.status === 200 && score.pass, failed: score.failed, tokens, cost });
    } else if (call.step === "stream") {
      const merged = mergePlan(parseSse(call.body));
      const score = scorePlan(testCase.body, merged);
      const server = timings[streamIndex++] || {};
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
      meanCost: mean(rows.parse.map((r) => r.cost)), meanOutputTokens: mean(rows.parse.map((r) => r.tokens.output)),
    },
    plan: {
      n: rows.plan.length, completeRate: rate(rows.plan.map((r) => r.complete)), problems: rows.plan.filter((r) => !r.complete).map((r) => ({ case: r.case, problems: r.problems })),
      p50Ms: percentile(rows.plan.map((r) => r.ms), 50), p95Ms: percentile(rows.plan.map((r) => r.ms), 95), maxMs: Math.max(...rows.plan.map((r) => r.ms), 0),
      meanCost: mean(rows.plan.map((r) => r.cost)), meanOutputTokens: mean(rows.plan.map((r) => r.tokens.output)),
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
      p50Ms: percentile(rows.tips.map((r) => r.ms), 50), meanCost: mean(rows.tips.map((r) => r.cost)), meanOutputTokens: mean(rows.tips.map((r) => r.tokens.output)),
    },
    totalCost: sum([...rows.parse, ...rows.plan, ...rows.tips].map((r) => r.cost)),
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
