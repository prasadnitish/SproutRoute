#!/usr/bin/env node
// Fills in the family-fit judgment for active attractions that have none, without looking anything up on Google.
// Uses the engine in ATTRACTION_FIT_ENGINE (production: jev, with Claude Haiku for unsure answers), and only our own
// data as input: the attraction's name, its city, our category and our summary.
//
//   railway run --service SproutRoute -- node scripts/label-family-fit.mjs --limit=20            # dry run, prints
//   railway run --service SproutRoute -- node scripts/label-family-fit.mjs --apply --out=summary.json
import { writeFileSync } from "node:fs";
import { getSupabaseAdmin } from "../src/backend/utils/supabaseClient.js";
import { assessFamilyFit, fitToRowUpdate, FAMILY_FIT_ENGINE } from "../src/backend/services/attractionFit.js";

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, "").split("="); return [k, v ?? true]; }));
const apply = args.apply === true;
const limit = Number(args.limit || Infinity);
const concurrency = Number(args.concurrency || 8);
const admin = getSupabaseAdmin();

async function backlog() {
  const rows = [];
  for (let from = 0; rows.length < limit; from += 1000) {
    const { data, error } = await admin
      .from("city_attractions")
      .select("id, canonical_name, category, short_summary, why_recommended, cities(display_name, city_name)")
      .eq("status", "active").is("family_fit_json", null)
      .order("id").range(from, from + 999);
    if (error) throw error;
    rows.push(...data);
    if (data.length < 1000) break;
  }
  return rows.slice(0, limit);
}

const one = (v) => (Array.isArray(v) ? v[0] : v) || {};
const rows = await backlog();
console.error(`${rows.length} places without a family-fit judgment; engine ${FAMILY_FIT_ENGINE}; ${apply ? "APPLYING" : "dry run"}`);

const stats = { engine: FAMILY_FIT_ENGINE, places: rows.length, judged: 0, byEngine: {}, escalated: 0, failed: 0, written: 0, writeErrors: 0,
  adultsOnly: 0, fineDining: 0, decisionMs: [], totalMs: [], decisionUsd: 0, haikuUsd: 0, startedAt: new Date().toISOString() };
const failures = [];
let next = 0;
async function worker() {
  while (next < rows.length) {
    const row = rows[next++];
    const city = one(row.cities);
    const place = { name: row.canonical_name, city: city.display_name || city.city_name, primaryType: row.category || undefined, description: row.short_summary || row.why_recommended || undefined };
    const t = performance.now();
    const r = await assessFamilyFit(place);
    stats.totalMs.push(Math.round(performance.now() - t));
    if (r.decision?.ms) stats.decisionMs.push(r.decision.ms);
    if (Number.isFinite(r.decision?.costUsd)) stats.decisionUsd += r.decision.costUsd;
    if (Number.isFinite(r.usage?.costUsd)) stats.haikuUsd += r.usage.costUsd;
    if (!r.ok) { stats.failed += 1; failures.push({ id: row.id, name: row.canonical_name, error: r.error }); continue; }
    stats.judged += 1;
    stats.byEngine[r.engine] = (stats.byEngine[r.engine] || 0) + 1;
    if (r.escalatedFrom) stats.escalated += 1;
    if (r.fit.adultsOnly) stats.adultsOnly += 1;
    if (r.fit.fineDining) stats.fineDining += 1;
    if (!apply) { if (stats.judged <= 20) console.log(JSON.stringify({ name: row.canonical_name, city: place.city, engine: r.engine, kid: r.fit.kidAppeal, ages: r.fit.ageBands, adultsOnly: r.fit.adultsOnly, category: r.fit.category })); continue; }
    const { error } = await admin.from("city_attractions").update(fitToRowUpdate(r.fit, { model: r.model, engine: r.engine })).eq("id", row.id);
    if (error) { stats.writeErrors += 1; failures.push({ id: row.id, name: row.canonical_name, error: error.message }); } else stats.written += 1;
    if ((stats.judged + stats.failed) % 500 === 0) console.error(`${stats.judged + stats.failed}/${rows.length}`);
  }
}
const started = performance.now();
await Promise.all(Array.from({ length: Math.min(concurrency, rows.length) }, worker));

const pct = (xs, q) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * q))] : null; };
const summary = {
  ...stats, decisionMs: undefined, totalMs: undefined,
  wallClockSeconds: Math.round((performance.now() - started) / 1000), concurrency,
  decisionMedianMs: pct(stats.decisionMs, 0.5), decisionP95Ms: pct(stats.decisionMs, 0.95),
  perPlaceMedianMs: pct(stats.totalMs, 0.5), perPlaceP95Ms: pct(stats.totalMs, 0.95),
  decisionUsd: Number(stats.decisionUsd.toFixed(4)), haikuUsd: Number(stats.haikuUsd.toFixed(4)),
  failures: failures.slice(0, 20), finishedAt: new Date().toISOString(),
};
console.log(JSON.stringify(summary, null, 2));
if (args.out) writeFileSync(args.out, JSON.stringify(summary, null, 2));
