#!/usr/bin/env node
// Blind LLM judging of the subjective rubric lines for a model comparison run. The judge sees one plan at a time,
// with no model name, and scores X2 (readable and actionable for a parent) and a plausibility reading of O3.
// It also lists the specific legal claims in each travel-safety answer so a person can check them (G1).
//
// A judge model is a triage tool, not the source of truth: venue and legal facts need independent evidence, and the
// judge has not been calibrated against human scores. Treat its numbers as a second opinion on the deterministic
// checks, and read the notes.
//
//   railway run --service SproutRoute -- node scripts/judge-comparison.mjs --dir=<raw run dir> --out=<judgments.json>
import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { CASES } from "./eval-cases.mjs";
import { parseSse, mergePlan } from "./eval-scoring.mjs";
import { readJsonl } from "./score-comparison.mjs";

export const JUDGE_MODEL = "claude-opus-5-5";
const caseById = new Map(CASES.map((c) => [c.id, c]));

const PLAN_SYSTEM = `You review family trip itineraries for a parent who will follow the plan.
Score each plan strictly and independently. Most reasonable plans should score 3 or 4; 5 is rare and 1 means unusable.
You cannot look anything up, so judge plausibility from what you know. Reply with one JSON object and nothing else.`;

const PLAN_RUBRIC = `Score two things from 1 to 5:
x2 = readable and actionable for a parent: a clear daily flow, pacing that suits the children's ages, concrete descriptions, concise caveats, nothing contradictory or confusing.
o3 = plausibility of the places and logistics: stops are real, well-known places in the requested area; each day's stops are geographically coherent; stops suit the ages given; nothing is stated as open, bookable or pet-friendly without a basis; timing tips agree with durations and with each other.
Reply as {"x2": n, "o3": n, "issues": ["short, specific problems"], "verdict": "one sentence"}.`;

const TIPS_SYSTEM = `You review the travel-safety text of a family trip app. Reply with one JSON object and nothing else.`;
const TIPS_RUBRIC = `List every specific legal or regulatory claim in the answer (ages, heights, weights, penalties, required equipment, visa or entry rules) exactly as stated, so a person can check each one against an official source.
Also say whether the answer implies any claim was verified against an official source, and whether any claim looks wrong or invented to you.
Reply as {"legalClaims": ["..."], "impliesVerification": boolean, "suspectClaims": ["claim and why"], "g1Concern": "none" | "low" | "high"}.`;

export function renderPlan(request, merged) {
  const byId = new Map(merged.activities.map((a) => [a.id, a]));
  const lines = [
    `Request: ${request.destination}, ${request.startDate} to ${request.endDate}.`,
    `Children's ages: ${(request.children || []).map((c) => c.age).join(", ") || "none"}. Pets: ${(request.pets || []).map((p) => p.type).join(", ") || "none"}.`,
    `Interests: ${(request.activities || []).join(", ") || "none given"}.`, "",
  ];
  merged.days.forEach((day, i) => {
    lines.push(`${day.day || `Day ${i + 1}`}`);
    for (const id of day.activities || []) {
      const a = byId.get(id);
      if (!a) { lines.push(`  - (missing activity ${id})`); continue; }
      lines.push(`  - ${a.name} [${a.duration || "no duration"}] ${a.timingTip || ""} ${a.description || a.whatItIs || ""} ${a.whyRecommended || ""}`.replace(/\s+/g, " ").trimEnd());
    }
    if (day.meals) lines.push(`  Meals: ${JSON.stringify(day.meals)}`);
    if (day.notes) lines.push(`  Notes: ${day.notes}`);
  });
  return lines.join("\n");
}

function extractJson(text) {
  const t = String(text || "").trim();
  try { return JSON.parse(t); } catch { /* try the bracketed span */ }
  const a = t.indexOf("{"); const b = t.lastIndexOf("}");
  if (a === -1 || b <= a) throw new Error("no JSON in judge reply");
  return JSON.parse(t.slice(a, b + 1));
}

async function ask(system, user) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: JUDGE_MODEL, max_tokens: 3000, system, output_config: { effort: "low" }, messages: [{ role: "user", content: user }] }),
    });
    const body = await res.json();
    if (res.ok) {
      const text = (body.content || []).filter((c) => c.type === "text").map((c) => c.text).join("");
      return { json: extractJson(text), usage: body.usage };
    }
    if (res.status !== 429 && res.status < 500) throw new Error(`judge HTTP ${res.status}: ${JSON.stringify(body).slice(0, 200)}`);
    await new Promise((r) => setTimeout(r, 4000 * (attempt + 1)));
  }
  throw new Error("judge unavailable");
}

async function pool(items, size, work) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: size }, async () => {
    while (next < items.length) { const i = next++; out[i] = await work(items[i], i); }
  }));
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, ...r] = a.replace(/^--/, "").split("="); return [k, r.length ? r.join("=") : true]; }));
  if (!args.dir || !args.out) { console.error("Usage: node scripts/judge-comparison.mjs --dir=<raw run dir> --out=<judgments.json>"); process.exit(2); }
  const jobs = [];
  for (const name of readdirSync(args.dir).filter((d) => existsSync(path.join(args.dir, d, "calls.jsonl"))).sort()) {
    for (const call of readJsonl(path.join(args.dir, name, "calls.jsonl"))) {
      const testCase = caseById.get(call.case);
      if (!testCase || call.status !== 200) continue;
      if (call.step === "stream") {
        const merged = mergePlan(parseSse(call.body));
        if (merged.days.length) jobs.push({ config: name, case: call.case, kind: "plan", system: PLAN_SYSTEM, user: `${PLAN_RUBRIC}\n\n${renderPlan(testCase.body, merged)}` });
      } else if (call.step === "travel-tips") {
        jobs.push({ config: name, case: call.case, kind: "tips", system: TIPS_SYSTEM, user: `${TIPS_RUBRIC}\n\nTrip: ${testCase.body.destination}, children ${(testCase.body.children || []).map((c) => c.age).join(", ")}.\n\nAnswer:\n${call.body.slice(0, 6000)}` });
      }
    }
  }
  // A stable shuffle so the judge's request order carries no model order.
  jobs.sort((a, b) => (a.case + a.config.length * 7 + a.kind).localeCompare(b.case + b.config.length * 7 + b.kind) || a.config.localeCompare(b.config));
  let spent = { input: 0, output: 0 };
  const judged = await pool(jobs, 3, async (job) => {
    try {
      const { json, usage } = await ask(job.system, job.user);
      spent.input += usage?.input_tokens || 0; spent.output += usage?.output_tokens || 0;
      return { config: job.config, case: job.case, kind: job.kind, ...json };
    } catch (error) {
      return { config: job.config, case: job.case, kind: job.kind, error: error.message };
    }
  });
  writeFileSync(args.out, JSON.stringify({ judge: JUDGE_MODEL, judgedAt: new Date().toISOString(), tokens: spent, judgments: judged }, null, 2));
  console.log(JSON.stringify({ judged: judged.length, errors: judged.filter((j) => j.error).length, tokens: spent }));
}
