#!/usr/bin/env node
// Paid, synthetic run of free-text inputs through the iOS flow: parse, pick a destination if asked, stream,
// then the background calls. Each input is one journey, captured and tagged like scripts/run-eval-traces.mjs.
//
//   EVAL_CAPTURE_TOKEN=... node scripts/run-eval-inputs.mjs --base=https://<backend> \
//     --inputs=<path>/inputs.jsonl --confirm-spend [--run=<label>] [--only=C01,C02] [--delay-ms=3000] [--dry-run]
//
// inputs.jsonl has one {id, prompt, setup, origin} per line (SproutRoute iOS repo, evals/dataset/inputs.jsonl).
// Rows that need a special setup are skipped: faults (C18), consent (C19), limits (C20), and any prompt with a TODO.
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { iosPayload, followUpBody, tripFromStream, parseSse } from "./lib/evalIos.mjs";

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const [key, ...rest] = a.replace(/^--/, "").split("=");
  return [key, rest.length ? rest.join("=") : true];
}));
const token = process.env.EVAL_CAPTURE_TOKEN;
const base = String(args.base || "").replace(/\/$/, "");
const runId = args.run || `ios-inputs-${new Date().toISOString().slice(0, 16).replace(/[^0-9]/g, "")}`;
const delayMs = Number(args["delay-ms"] ?? 3000);
const dryRun = Boolean(args["dry-run"]);
const today = new Date().toISOString().slice(0, 10);

if (!args.inputs || (!dryRun && (!token || !base))) {
  console.error("Usage: EVAL_CAPTURE_TOKEN=... node scripts/run-eval-inputs.mjs --base=<url> --inputs=<inputs.jsonl> --confirm-spend [--dry-run]");
  process.exit(2);
}
if (!dryRun && !args["confirm-spend"]) {
  console.error("This calls paid models on the target backend. Re-run with --confirm-spend, or use --dry-run.");
  process.exit(2);
}

const SKIP = new Set(["C18", "C19", "C20"]);
const only = args.only ? new Set(String(args.only).split(",")) : null;
const rows = readFileSync(args.inputs, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l))
  .filter((r) => !only || only.has(r.id));

const log = (o) => console.log(JSON.stringify(o));
let failures = 0;

async function call(row, journey, step, path, body) {
  const started = performance.now();
  if (dryRun) { log({ dry_run: true, case: row.id, step, path, body }); return { ok: true, text: "{}" }; }
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json", "x-eval-capture": token, "x-eval-client": "ios", "x-eval-case": row.id,
      "x-eval-run": runId, "x-eval-step": step, "x-journey-id": journey,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  const streamError = step === "stream" && /^event: error$/m.test(text);
  if (!res.ok || streamError) failures++;
  log({ case: row.id, step, journey, trace: res.headers.get("x-langfuse-trace-id"), status: res.status, stream_error: streamError, ms: Math.round(performance.now() - started) });
  return { ok: res.ok && !streamError, text };
}

for (const [index, row] of rows.entries()) {
  if (SKIP.has(row.id) || /TODO\(user\)/.test(row.prompt)) { log({ case: row.id, skipped: "needs a special setup or a decision" }); continue; }
  const journey = randomBytes(16).toString("hex");
  try {
    const parseRes = await call(row, journey, "parse", "/api/v1/trip/parse-input", { text: row.prompt, clientDate: today });
    if (!parseRes.ok) continue;
    const parsed = dryRun ? { destination: "Dry Run", startDate: "2027-01-01", endDate: "2027-01-02", childrenAges: [] } : JSON.parse(parseRes.text);
    parsed.rawInput = row.prompt;
    if (parsed.startDate && parsed.startDate < today) { log({ case: row.id, app: "refuses a start date that has passed", startDate: parsed.startDate }); continue; }
    // The app asks the parent to choose when there is no destination. The runner takes the first suggestion.
    if (!parsed.destination && (parsed.suggestedDestinations ?? []).length) {
      parsed.destination = parsed.suggestedDestinations[0].name;
      parsed.suggestedDestinations = [];
    }
    if (!parsed.destination || !parsed.startDate || !parsed.endDate) { log({ case: row.id, app: "cannot find a destination and dates" }); continue; }
    const payload = iosPayload(parsed);
    const stream = await call(row, journey, "stream", "/api/v1/trip/stream", payload);
    if (!stream.ok) continue;
    const trip = dryRun ? { destination: payload.destination, countryCode: "US", startDate: payload.startDate } : tripFromStream(stream.text);
    const steps = [["packing", "/api/v1/trip/packing"], ["travel-tips", "/api/safety/travel-tips"]];
    if (payload.children.length) steps.push(["car-seat", "/api/safety/car-seat-check"]);
    if (payload.pets.length) steps.push(["pet", "/api/v1/safety/pet-travel-check"]);
    for (const [step, path] of steps) await call(row, journey, step, path, followUpBody(step, payload, trip));
  } catch (error) {
    failures++;
    log({ case: row.id, journey, error: error.message });
  }
  if (index < rows.length - 1 && !dryRun) await new Promise((r) => setTimeout(r, delayMs));
}
console.log(`Run ${runId}: ${rows.length} inputs, ${failures} failed calls. Traces are tagged run:${runId}, case:<id>, step:<name>.`);
if (failures) process.exitCode = 1;
