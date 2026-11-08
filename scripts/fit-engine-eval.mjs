#!/usr/bin/env node
// Family fit from three engines on the same places: the Haiku text call used today, TypeSafe Jev and OpenAI's
// Decisions API (gpt-6-luna). Needs ANTHROPIC_API_KEY, TYPESAFE_API_KEY, OPENAI_API_KEY, GOOGLE_PLACES_API_KEY
// and Supabase keys, so run it with `railway run`.
//
//   node scripts/fit-engine-eval.mjs collect --out=places.json   # Google text searches with known labels + family rows
//   node scripts/fit-engine-eval.mjs run --places=places.json --out=results.json
//   node scripts/fit-engine-eval.mjs score --results=results.json
//
// Labels come from the search that found each place ("nightclub" means adults only); nobody has checked them.
import { readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { SEARCH_MASK } from "../src/backend/services/placesGrounding.js";
import { assessFamilyFit, FAMILY_FIT_MODEL } from "../src/backend/services/attractionFit.js";
import { decideFamilyFit } from "../src/backend/services/familyFitDecision.js";

const args = Object.fromEntries(process.argv.slice(3).map((a) => a.replace(/^--/, "").split("=")));
const cmd = process.argv[2];

const CITIES = ["Las Vegas, NV", "London, UK", "Lisbon, Portugal"];
const QUERIES = [
  { q: "nightclub", adultsOnly: true, fineDining: false },
  { q: "casino", adultsOnly: true, fineDining: false },
  { q: "cocktail bar", adultsOnly: true, fineDining: false },
  { q: "tasting menu restaurant", adultsOnly: false, fineDining: true },
  { q: "family restaurant", adultsOnly: false, fineDining: false },
  { q: "children's museum", adultsOnly: false, fineDining: false },
  { q: "playground", adultsOnly: false, fineDining: false },
  { q: "aquarium", adultsOnly: false, fineDining: false },
];

async function collect() {
  const places = [];
  const seen = new Set();
  for (const city of CITIES) {
    for (const { q, adultsOnly, fineDining } of QUERIES) {
      const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Goog-Api-Key": process.env.GOOGLE_PLACES_API_KEY, "X-Goog-FieldMask": SEARCH_MASK },
        body: JSON.stringify({ textQuery: `${q} in ${city}`, pageSize: 12 }),
      });
      const body = await res.json();
      for (const p of body.places ?? []) {
        if (seen.has(p.id)) continue;
        seen.add(p.id);
        places.push({
          source: `search:${q}`, city, name: p.displayName?.text, primaryType: p.primaryType, types: p.types,
          priceLevel: ["PRICE_LEVEL_FREE", "PRICE_LEVEL_INEXPENSIVE", "PRICE_LEVEL_MODERATE", "PRICE_LEVEL_EXPENSIVE", "PRICE_LEVEL_VERY_EXPENSIVE"].indexOf(p.priceLevel),
          label: { adultsOnly, fineDining },
        });
      }
      process.stderr.write(`${city} / ${q}: ${places.length}\n`);
    }
  }
  // Family attractions already in the database: neither flag applies.
  const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  const { data, error } = await admin
    .from("city_attractions")
    .select("canonical_name, place_types, price_level, cities(display_name, city_name)")
    .eq("status", "active").not("place_types", "is", null).limit(400);
  if (error) throw error;
  for (const row of data.filter((r) => Array.isArray(r.place_types) && r.place_types.length).sort(() => Math.random() - 0.5).slice(0, 80)) {
    const city = Array.isArray(row.cities) ? row.cities[0] : row.cities;
    places.push({
      source: "db:family", city: city?.display_name || city?.city_name, name: row.canonical_name, primaryType: row.place_types[0], types: row.place_types,
      priceLevel: Number.isFinite(row.price_level) ? row.price_level : -1, label: { adultsOnly: false, fineDining: false },
    });
  }
  for (const p of places) if (p.priceLevel < 0) delete p.priceLevel;
  writeFileSync(args.out, JSON.stringify(places, null, 2));
  console.log({ places: places.length, adultsOnly: places.filter((p) => p.label.adultsOnly).length, fineDining: places.filter((p) => p.label.fineDining).length });
}

async function pool(items, size, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: size }, async () => { while (i < items.length) { const k = i++; await fn(items[k], k); } }));
}

async function run() {
  const places = JSON.parse(readFileSync(args.places, "utf8"));
  const rows = [];
  await pool(places, Number(args.concurrency || 4), async (place, k) => {
    const row = { place, results: {} };
    for (const engine of ["jev", "openai", "haiku"]) {
      const started = performance.now();
      if (engine === "haiku") {
        const r = await assessFamilyFit(place, { engine: "haiku" });
        row.results.haiku = r.ok
          ? { ok: true, fit: r.fit, ms: Math.round(performance.now() - started), inputTokens: r.usage?.inputTokens, outputTokens: r.usage?.outputTokens, costUsd: r.usage?.costUsd, model: FAMILY_FIT_MODEL }
          : { ok: false, error: r.error, ms: Math.round(performance.now() - started) };
      } else {
        const r = await decideFamilyFit(place, { engine });
        row.results[engine] = r.ok
          ? { ok: true, fit: r.fit, flags: { adultsOnly: r.answers.adults_only.noul, fineDining: r.answers.fine_dining.noul }, escalate: r.escalate, ms: r.ms, inputTokens: r.inputTokens, costUsd: r.costUsd, model: r.model }
          : { ok: false, error: r.error, ms: r.ms };
      }
    }
    rows.push(row);
    if (k % 20 === 0) process.stderr.write(`${k + 1}/${places.length}\n`);
  });
  writeFileSync(args.out, JSON.stringify({ ranAt: new Date().toISOString(), from: "laptop via railway run", rows }, null, 2));
  console.log(`wrote ${rows.length} rows to ${args.out}`);
}

const pct = (n, d) => (d ? `${((100 * n) / d).toFixed(1)}%` : "n/a");
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : null; };
const p95 = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * 0.95))] : null; };

function score() {
  const { rows } = JSON.parse(readFileSync(args.results, "utf8"));
  const table = [];
  for (const engine of ["haiku", "jev", "openai"]) {
    const ok = rows.filter((r) => r.results[engine]?.ok);
    const line = { engine, model: ok[0]?.results[engine].model, answered: `${ok.length}/${rows.length}` };
    for (const flag of ["adultsOnly", "fineDining"]) {
      const right = ok.filter((r) => r.results[engine].fit[flag] === r.place.label[flag]).length;
      const pos = ok.filter((r) => r.place.label[flag]);
      line[`${flag} accuracy`] = pct(right, ok.length);
      line[`${flag} caught`] = `${pos.filter((r) => r.results[engine].fit[flag]).length}/${pos.length}`;
      line[`${flag} false alarms`] = ok.filter((r) => !r.place.label[flag] && r.results[engine].fit[flag]).length;
    }
    if (engine !== "haiku") {
      const sure = ok.filter((r) => !r.results[engine].escalate);
      line["sure (no Haiku fallback)"] = pct(sure.length, ok.length);
      line["wrong when sure"] = sure.filter((r) => ["adultsOnly", "fineDining"].some((f) => r.results[engine].fit[f] !== r.place.label[f])).length;
      const both = ok.filter((r) => r.results.haiku?.ok);
      line["same category as Haiku"] = pct(both.filter((r) => r.results.haiku.fit.category === r.results[engine].fit.category).length, both.length);
    }
    const ms = ok.map((r) => r.results[engine].ms);
    const cost = ok.map((r) => r.results[engine].costUsd).filter(Number.isFinite);
    line["median ms"] = median(ms);
    line["p95 ms"] = p95(ms);
    line["mean input tokens"] = Math.round(ok.reduce((s, r) => s + (r.results[engine].inputTokens || 0), 0) / Math.max(ok.length, 1));
    line["USD per 1,000 places"] = cost.length ? ((1000 * cost.reduce((a, b) => a + b, 0)) / cost.length).toFixed(4) : "n/a";
    const errors = rows.filter((r) => r.results[engine] && !r.results[engine].ok).map((r) => r.results[engine].error);
    if (errors.length) line.errors = [...new Set(errors)].slice(0, 3);
    table.push(line);
  }
  console.log(JSON.stringify(table, null, 2));
}

await ({ collect, run, score }[cmd] ?? (() => { throw new Error("collect | run | score"); }))();
