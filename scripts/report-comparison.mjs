#!/usr/bin/env node
// Turns the scored summary (and, when present, the judge's scores and a repeat run) into the markdown tables of the
// model comparison report, so no number is copied by hand.
//
//   node scripts/report-comparison.mjs --summary=summary.json [--judgments=judgments.json] [--repeat=summary-repeat.json]
import { readFileSync, existsSync } from "node:fs";

const num = (v, d = 1) => (Number.isFinite(v) ? v.toFixed(d) : "n/a");
const pct = (v) => (Number.isFinite(v) ? `${Math.round(v * 100)}%` : "n/a");
const sec = (ms) => (Number.isFinite(ms) ? `${(ms / 1000).toFixed(1)}s` : "n/a");
const cents = (usd) => (Number.isFinite(usd) ? `${(usd * 100).toFixed(2)}¢` : "n/a");
const mean = (xs) => { const v = xs.filter(Number.isFinite); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };

export function judgeMeans(judgments) {
  const byConfig = {};
  for (const j of judgments?.judgments || []) {
    if (j.error) continue;
    byConfig[j.config] ||= { x2: [], o3: [], issues: 0, plans: 0, g1: { none: 0, low: 0, high: 0 }, claims: 0, tips: 0 };
    const c = byConfig[j.config];
    if (j.kind === "plan") { c.x2.push(j.x2); c.o3.push(j.o3); c.issues += (j.issues || []).length; c.plans += 1; }
    if (j.kind === "tips") { c.tips += 1; c.claims += (j.legalClaims || []).length; if (j.g1Concern in c.g1) c.g1[j.g1Concern] += 1; }
  }
  return byConfig;
}

export function tables(summary, judgments, repeat) {
  const names = Object.keys(summary.configs);
  const judge = judgeMeans(judgments);
  const out = [];

  out.push("### Cost, latency and completion\n");
  out.push("| Model | Parse pass | Parse p50 | Itinerary complete | Itinerary p50 | Itinerary p95 | Tips valid | Tips p50 | Cost per trip (parse + itinerary + tips) |");
  out.push("| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |");
  for (const name of names) {
    const c = summary.configs[name];
    const perTrip = (c.parse.meanCost || 0) + (c.plan.meanCost || 0) + (c.tips.meanCost || 0);
    out.push(`| ${name} | ${c.parse.passRate * c.parse.n}/${c.parse.n} | ${sec(c.parse.p50Ms)} | ${Math.round(c.plan.completeRate * c.plan.n)}/${c.plan.n} | ${sec(c.plan.p50Ms)} | ${sec(c.plan.p95Ms)} | ${Math.round(c.tips.validRate * c.tips.n)}/${c.tips.n} | ${sec(c.tips.p50Ms)} | ${cents(perTrip)} |`);
  }

  out.push("\n### Itinerary quality signals\n");
  out.push("| Model | Mean output tokens | Stops in the database | Durations 45-180 min | Hours corrections per 10 stops | Thin days per plan | Repeated stops, trips over 3 days | Judge: readable (X2) | Judge: plausible (O3) | Judge issues per plan |");
  out.push("| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |");
  for (const name of names) {
    const p = summary.configs[name].plan;
    const j = judge[name];
    out.push(`| ${name} | ${Math.round(p.meanOutputTokens || 0)} | ${pct(p.groundedRatio)} | ${pct(p.durationInRange)} | ${num(p.hoursCorrectionsPer10Stops)} | ${num(p.thinDaysPerPlan)} | ${num(p.repeatedStopsLongTrips)} | ${j ? num(mean(j.x2)) : "n/a"} | ${j ? num(mean(j.o3)) : "n/a"} | ${j ? num(j.issues / Math.max(j.plans, 1)) : "n/a"} |`);
  }

  out.push("\n### Travel-safety answers\n");
  out.push("| Model | Valid answers | Legal claims listed for review (per answer) | Judge concern: none / low / high |");
  out.push("| --- | ---: | ---: | ---: |");
  for (const name of names) {
    const t = summary.configs[name].tips;
    const j = judge[name];
    out.push(`| ${name} | ${Math.round(t.validRate * t.n)}/${t.n} | ${j && j.tips ? num(j.claims / j.tips) : "n/a"} | ${j ? `${j.g1.none} / ${j.g1.low} / ${j.g1.high}` : "n/a"} |`);
  }

  if (repeat) {
    out.push("\n### Run to run variation (second pass of the same cases)\n");
    out.push("| Model | Itinerary complete (run 1 / run 2) | Itinerary p50 (run 1 / run 2) | Itinerary p95 (run 1 / run 2) | Cost per trip (run 1 / run 2) |");
    out.push("| --- | ---: | ---: | ---: | ---: |");
    for (const name of Object.keys(repeat.configs)) {
      const a = summary.configs[name]; const b = repeat.configs[name];
      if (!a) continue;
      const trip = (c) => (c.parse.meanCost || 0) + (c.plan.meanCost || 0) + (c.tips.meanCost || 0);
      out.push(`| ${name} | ${Math.round(a.plan.completeRate * a.plan.n)}/${a.plan.n} / ${Math.round(b.plan.completeRate * b.plan.n)}/${b.plan.n} | ${sec(a.plan.p50Ms)} / ${sec(b.plan.p50Ms)} | ${sec(a.plan.p95Ms)} / ${sec(b.plan.p95Ms)} | ${cents(trip(a))} / ${cents(trip(b))} |`);
    }
  }
  return out.join("\n");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, ...r] = a.replace(/^--/, "").split("="); return [k, r.length ? r.join("=") : true]; }));
  if (!args.summary) { console.error("Usage: node scripts/report-comparison.mjs --summary=<file> [--judgments=<file>] [--repeat=<file>]"); process.exit(2); }
  const read = (f) => (f && existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : null);
  console.log(tables(read(args.summary), read(args.judgments), read(args.repeat)));
}
