#!/usr/bin/env node
// Runs the golden set against local copies of the backend, one per model, so the same cases are answered by each
// model and traced in Langfuse. Every model answers all three planning jobs (parse, itinerary, travel tips) with
// no fallback, so a failure is the model's own. Run under `railway run --service SproutRoute --` so the provider,
// Supabase, Places and Langfuse settings are present; they are never printed.
//
//   railway run --service SproutRoute -- node scripts/compare-models.mjs --out=docs/benchmarks/2026-10-28-model-comparison --confirm-spend
//   options: --models=haiku-5-5,sonnet-5-5   --only=trip-seattle-toddler-rain,parse-vegas-explicit   --delay-ms=1500
//
// The local server uses the real Supabase project for attraction data and metrics, like production does, so a run
// adds a few rows to trip_metrics. Prices are per million tokens: Anthropic and OpenAI from the OpenRouter
// catalog on 2026-10-28, Gemini from the Google billing export (see src/backend/utils/aiCost.js).
import { spawn } from "node:child_process";
import { mkdirSync, createWriteStream, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const MODELS = {
  "haiku-4-5": { provider: "anthropic", model: "claude-haiku-4-5-20251001", price: { in: 1, out: 5 }, note: "current travel-tips model" },
  "haiku-5-5": { provider: "anthropic", model: "claude-haiku-5-5", effort: "low", price: { in: 0.1, out: 0.5 }, note: "newest Haiku" },
  "haiku-5-5-nothink": { provider: "anthropic", model: "claude-haiku-5-5", effort: "low", thinking: "disabled", price: { in: 0.1, out: 0.5 }, note: "newest Haiku, thinking off" },
  "sonnet-5-5": { provider: "anthropic", model: "claude-sonnet-5-5", effort: "low", price: { in: 2, out: 10 }, note: "newest Sonnet" },
  "sonnet-5-5-nothink": { provider: "anthropic", model: "claude-sonnet-5-5", effort: "low", thinking: "between_tools", price: { in: 2, out: 10 }, note: "newest Sonnet, thinking off" },
  "gpt-5-4-nano": { provider: "openai", model: "gpt-5.4-nano", price: { in: 0.2, out: 1.25 }, note: "current parse model; newest nano" },
  "gpt-6-luna": { provider: "openai", model: "gpt-6-luna", price: { in: 0.1, out: 0.5 }, note: "newest OpenAI small model" },
  "gemini-3-8-flash": { provider: "gemini", model: "gemini-3.8-flash", price: { in: 0.75, out: 3.75 }, note: "current itinerary model" },
};

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");

function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => { const { port } = server.address(); server.close(() => resolve(port)); });
    server.on("error", reject);
  });
}

async function waitForHealth(base, child) {
  for (let i = 0; i < 60; i += 1) {
    if (child.exitCode !== null) throw new Error(`server exited with ${child.exitCode}`);
    try { if ((await fetch(`${base}/api/health`)).ok) return; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("server did not become healthy in 30s");
}

function run(command, args, { env, logFile } = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { env, cwd: root, stdio: ["ignore", "pipe", "pipe"] });
    const log = logFile ? createWriteStream(logFile, { flags: "a" }) : null;
    child.stdout.on("data", (d) => { log?.write(d); });
    child.stderr.on("data", (d) => { log?.write(d); });
    child.on("close", (code) => { log?.end(); resolve(code); });
  });
}

async function runModel(name, config, { out, only, delayMs }) {
  const dir = path.join(out, name);
  mkdirSync(dir, { recursive: true });
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  const env = {
    ...process.env,
    PORT: String(port),
    ALLOW_EVAL_MODEL_OVERRIDE: "true",
    AI_EVAL_MODEL_OVERRIDE: JSON.stringify({ provider: config.provider, model: config.model, ...(config.effort && { effort: config.effort }), ...(config.thinking && { thinking: config.thinking }) }),
    AI_PRICE_OVERRIDES: JSON.stringify({ [config.model]: config.price }),
  };
  const serverLog = createWriteStream(path.join(dir, "server.log"));
  const server = spawn("node", ["server.js"], { env, cwd: path.join(root, "src/backend"), stdio: ["ignore", "pipe", "pipe"] });
  server.stdout.on("data", (d) => serverLog.write(d));
  server.stderr.on("data", (d) => serverLog.write(d));
  const startedAt = new Date().toISOString();
  try {
    await waitForHealth(base, server);
    const args = ["scripts/run-eval-traces.mjs", `--base=${base}`, "--client=web", `--run=cmp-${name}`, `--save=${dir}`,
      "--steps=parse,stream,travel-tips,pet", `--delay-ms=${delayMs}`, "--confirm-spend", ...(only ? [`--only=${only}`] : [])];
    const code = await run("node", args, { env, logFile: path.join(dir, "runner.log") });
    writeFileSync(path.join(dir, "meta.json"), JSON.stringify({ name, ...config, startedAt, finishedAt: new Date().toISOString(), runnerExit: code }, null, 2));
    return code;
  } finally {
    server.kill("SIGTERM");
    await new Promise((r) => setTimeout(r, 500));
    serverLog.end();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, ...r] = a.replace(/^--/, "").split("="); return [k, r.length ? r.join("=") : true]; }));
  if (!args["confirm-spend"] || !args.out || !process.env.EVAL_CAPTURE_TOKEN) {
    console.error("Usage: railway run --service SproutRoute -- node scripts/compare-models.mjs --out=<dir> --confirm-spend [--models=a,b] [--only=case,...]");
    process.exit(2);
  }
  const names = args.models ? String(args.models).split(",") : Object.keys(MODELS);
  for (const name of names) if (!MODELS[name]) { console.error(`Unknown model ${name}. Known: ${Object.keys(MODELS).join(", ")}`); process.exit(2); }
  for (const name of names) {
    console.log(JSON.stringify({ event: "model_start", name, ...MODELS[name], at: new Date().toISOString() }));
    const code = await runModel(name, MODELS[name], { out: args.out, only: args.only, delayMs: Number(args["delay-ms"] ?? 1500) });
    console.log(JSON.stringify({ event: "model_done", name, runnerExit: code, at: new Date().toISOString() }));
  }
}
