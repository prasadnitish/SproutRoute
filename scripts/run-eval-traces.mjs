#!/usr/bin/env node
// Paid, synthetic golden-set run that produces Langfuse eval traces.
// Sends made-up trips (no real users) to a deployed backend with the eval
// token, so each request is captured in full and tagged with its client.
//
//   EVAL_CAPTURE_TOKEN=... node scripts/run-eval-traces.mjs \
//     --base=https://<your-backend> --client=web --confirm-spend
//
// Set LANGFUSE_PUBLIC_KEY, LANGFUSE_SECRET_KEY and LANGFUSE_BASE_URL as well to attach a "completed" score to each trace.
// Options: --client=web|ios (default web), --only=<case-id,...>,
// --run=<label> (tags every trace of the run), --delay-ms=<n>.
// Each case runs the calls its client makes (see scripts/eval-cases.mjs) under one journey id.
// Each case calls real models (the web run also generates a packing list) and spends provider credit,
// hence --confirm-spend.
import { randomBytes } from "node:crypto";
import { CASES, stepsFor } from "./eval-cases.mjs";
import { postScores, completionScore } from "./lib/langfuseScore.mjs";

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [key, ...rest] = arg.replace(/^--/, "").split("=");
    return [key, rest.length ? rest.join("=") : true];
  }),
);

const token = process.env.EVAL_CAPTURE_TOKEN;
const base = String(args.base || "").replace(/\/$/, "");
const client = args.client || "web";
const runId = args.run || `${client}-${new Date().toISOString().slice(0, 16).replace(/[^0-9]/g, "")}`;
const delayMs = Number(args["delay-ms"] ?? 3000);

if (!token || !base || !["web", "ios"].includes(client)) {
  console.error("Usage: EVAL_CAPTURE_TOKEN=... node scripts/run-eval-traces.mjs --base=<url> --client=web|ios --confirm-spend");
  process.exit(2);
}
if (!args["confirm-spend"]) {
  console.error("This calls paid models on the target backend. Re-run with --confirm-spend.");
  process.exit(2);
}

const only = args.only ? new Set(String(args.only).split(",")) : null;
const selected = CASES.filter((c) => !only || only.has(c.id));

// One journey id per case, sent on every call of that case. Langfuse shows the calls as one session, the way
// the web app's X-Journey-Id ties parse, stream, packing and safety calls together.
const journeyId = () => randomBytes(16).toString("hex");

let failures = 0;
let warnedNoScores = false;
for (const [index, testCase] of selected.entries()) {
  const journey = journeyId();
  for (const { step, path, body } of stepsFor(testCase, client)) {
    const started = performance.now();
    try {
      const res = await fetch(`${base}${path}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-eval-capture": token,
          "x-eval-client": client,
          "x-eval-case": testCase.id,
          "x-eval-run": runId,
          "x-eval-rubric": testCase.rubric.join(","),
          "x-eval-step": step,
          "x-journey-id": journey,
        },
        body: JSON.stringify(body),
      });
      const text = await res.text();
      const streamError = /^event: error$/m.test(text);
      const failed = !res.ok || streamError;
      if (failed) failures++;
      console.log(JSON.stringify({
        case: testCase.id,
        step,
        client,
        journey,
        trace: res.headers.get("x-langfuse-trace-id"),
        status: res.status,
        stream_error: streamError,
        ms: Math.round(performance.now() - started),
      }));
      const score = completionScore({ trace: res.headers.get("x-langfuse-trace-id"), failed, status: res.status, streamError });
      if (score) {
        const posted = await postScores([score]);
        if (posted.skipped && !warnedNoScores) {
          warnedNoScores = true;
          console.error(`Scores not posted: ${posted.skipped}`);
        } else if (posted.error) console.error(`Score for ${score.traceId} not posted: ${posted.error}`);
      }
      // A client stops when the plan fails; later steps would only trace noise.
      if (failed && step === "stream") break;
    } catch (error) {
      failures++;
      console.log(JSON.stringify({ case: testCase.id, step, client, journey, error: error.message }));
      if (step === "stream") break;
    }
  }
  if (index < selected.length - 1) await new Promise((resolve) => setTimeout(resolve, delayMs));
}
const calls = selected.reduce((n, c) => n + stepsFor(c, client).length, 0);
console.log(`Run ${runId}: ${selected.length} cases, up to ${calls} calls, ${failures} failed. Open Langfuse > Sessions: one session per case, tagged run:${runId}.`);
if (failures) process.exitCode = 1;
