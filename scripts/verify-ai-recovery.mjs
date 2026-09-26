#!/usr/bin/env node
// Paid, synthetic generation pilot. Supply existing provider keys in the process.
// Does not load production database, analytics, or user records.
import { writeFile } from "node:fs/promises";
import { generateTripPlan } from "../src/backend/services/tripPlanAI.js";
import { CASES, scoreOutput } from "./benchmark-luna.mjs";
import { metrics } from "../src/backend/services/metrics.js";

const output = process.argv[2];
if (!output) throw new Error("Usage: node scripts/verify-ai-recovery.mjs <output.json>");
const scenarios = [
  ...CASES.trip.map(trip => ({ trip, failure: null })),
  ...CASES.trip.map(trip => ({ trip, failure: "429" })),
  ...["503", "invalid-json", "empty", "truncated"].map(failure => ({ trip: CASES.trip[0], failure })),
];
const rows = [];
for (const { trip, failure } of scenarios) {
  const attempts = [];
  const originalRecord = metrics.recordAiCall;
  metrics.recordAiCall = data => attempts.push(data);
  const started = performance.now();
  try {
    const deps = failure ? { geminiModel: { generateContent: async () => {
      if (["429", "503"].includes(failure)) throw Object.assign(new Error(`Injected ${failure}`), { status: Number(failure) });
      return { response: { text: () => failure === "empty" ? "" : "broken",
        candidates: [{ finishReason: failure === "truncated" ? "MAX_TOKENS" : "STOP" }] } };
    } } } : {};
    const plan = await generateTripPlan(trip, { summary: "Synthetic mild-weather fixture", forecast: [] }, deps);
    const scoring = scoreOutput("trip", plan, { days: trip.days });
    rows.push({ case: trip.id, injectedFailure: failure, ms: Math.round(performance.now() - started), attempts, ...scoring, plan });
  } catch (error) {
    rows.push({ case: trip.id, injectedFailure: failure, ms: Math.round(performance.now() - started), attempts, pass: false, error: error.message });
  } finally { metrics.recordAiCall = originalRecord; }
  await writeFile(output, JSON.stringify({ synthetic: true, at: new Date().toISOString(), scope: "production generation code with synthetic weather; no geocoding, browser, or venue verification", rows }, null, 2));
  const { plan, ...summary } = rows.at(-1);
  console.log(JSON.stringify(summary));
}
if (rows.some(row => !row.pass)) process.exitCode = 1;
