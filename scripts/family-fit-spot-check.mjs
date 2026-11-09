#!/usr/bin/env node
// Writes a sheet for a person to check Jev's backlog labels: every adults-only flag, every place Jev escalated to
// Haiku, and a random sample of the rest. railway run --service SproutRoute -- node scripts/family-fit-spot-check.mjs out.csv
import { writeFileSync } from "node:fs";
import { getSupabaseAdmin } from "../src/backend/utils/supabaseClient.js";

const admin = getSupabaseAdmin();
const rows = [];
for (let from = 0; ; from += 1000) {
  const { data, error } = await admin.from("city_attractions")
    .select("id, canonical_name, kid_appeal_score, age_bands_json, family_fit_json, cities(city_name)")
    .eq("status", "active").not("family_fit_json", "is", null).order("id").range(from, from + 999);
  if (error) throw error;
  rows.push(...data);
  if (data.length < 1000) break;
}
const fresh = rows.filter((r) => ["jev", "haiku"].includes(r.family_fit_json?.engine));
const pick = [
  ...fresh.filter((r) => r.family_fit_json.adultsOnly).map((r) => ["every adults-only flag", r]),
  ...fresh.filter((r) => r.family_fit_json.engine === "haiku").map((r) => ["Jev unsure, Haiku decided", r]),
];
const taken = new Set(pick.map(([, r]) => r.id));
const rest = fresh.filter((r) => !taken.has(r.id));
for (let i = rest.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [rest[i], rest[j]] = [rest[j], rest[i]]; }
pick.push(...rest.slice(0, 60).map((r) => ["random sample", r]));

const q = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
const header = ["why_in_sheet", "name", "city", "engine", "kid_appeal_1to10", "ages", "category", "adults_only", "google_maps", "correct_Y_or_N", "what_is_wrong"];
const lines = [header.join(",")].concat(pick.map(([why, r]) => {
  const city = (Array.isArray(r.cities) ? r.cities[0] : r.cities)?.city_name;
  const f = r.family_fit_json;
  return [why, r.canonical_name, city, f.engine, r.kid_appeal_score, (r.age_bands_json || []).join(" "), f.category, f.adultsOnly ? "Y" : "N",
    `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${r.canonical_name} ${city}`)}`, "", ""].map(q).join(",");
}));
writeFileSync(process.argv[2], lines.join("\n") + "\n");
console.log(`${pick.length} rows (${fresh.length} judged on Nov 9)`);
