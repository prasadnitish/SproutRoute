import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { streamTimings, alignTimings, generationsFor, scoreConfig } from "../../scripts/score-comparison.mjs";

const line = (obj) => JSON.stringify(obj);

test("a failed itinerary ends its own request in the server log and does not shift the timings after it", () => {
  const log = [
    { msg: "stream:itinerary-fail", reqId: "a" },
    { msg: "stream:itinerary-fail", reqId: "b" },
    { msg: "trip-plan:hours-corrected", changes: [{}] },
    { msg: "stream:done", reqId: "c", timing: { firstChunk: 18624, total: 20000 } },
    { msg: "stream:done", reqId: "d", timing: { firstChunk: 24060, total: 25000 } },
  ];
  const entries = streamTimings(log);
  assert.deepEqual(entries.map((e) => e.outcome), ["fail", "fail", "done", "done"]);
  const calls = [{ failed: true }, { failed: true }, { failed: false }, { failed: false }];
  assert.deepEqual(alignTimings(calls, entries).map((t) => t?.timing?.firstChunk ?? null), [null, null, 18624, 24060]);
  assert.equal(alignTimings(calls, entries)[2].hoursCorrections, 1);
});

test("a failed request that left no terminal log line does not steal the next request's timing", () => {
  const entries = streamTimings([{ msg: "stream:done", reqId: "x", timing: { firstChunk: 500 } }]);
  const aligned = alignTimings([{ failed: true }, { failed: false }], entries);
  assert.equal(aligned[0], null);
  assert.equal(aligned[1].timing.firstChunk, 500);
});

const fakeFetch = (responses) => { let i = 0; return async () => responses[Math.min(i++, responses.length - 1)]; };
const json = (status, body) => ({ ok: status < 300, status, json: async () => body });
const opts = (fetchFn) => ({ fetchFn, retries: 3, waitMs: 0 });

test("token usage is read from Langfuse, and is unavailable (null) rather than zero when it cannot be", async () => {
  const gens = json(200, { data: [{ name: "generate.tripPlan", model: "m", usageDetails: { input: 100, output: 400 }, latency: 2 }] });
  assert.deepEqual(await generationsFor("t1", "auth", "https://lf", opts(fakeFetch([gens]))), [{ name: "generate.tripPlan", model: "m", input: 100, output: 400, latency: 2 }]);
  assert.equal(await generationsFor(null, "auth", "https://lf", opts(fakeFetch([gens]))), null, "no trace id");
  assert.equal(await generationsFor("t1", "auth", "https://lf", opts(fakeFetch([json(200, { data: [] })]))), null, "nothing ingested");
  await assert.rejects(() => generationsFor("t1", "auth", "https://lf", opts(fakeFetch([json(401, {})]))), /401/);
});

test("a call with unavailable usage is left out of cost averages and counted, not priced at zero", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "score-"));
  writeFileSync(path.join(dir, "meta.json"), JSON.stringify({ name: "test-config", provider: "gemini", model: "gemini-3.8-flash", price: { in: 1, out: 1 } }));
  writeFileSync(path.join(dir, "server.log"), "");
  const parse = (c, trace) => ({ case: c, step: "parse", status: 200, ms: 1000, trace, body: JSON.stringify({ destination: "Las Vegas, Nevada", suggestedDestinations: [], childrenAges: [6], adults: 2, startDate: "2026-12-01", endDate: "2026-12-03" }) });
  writeFileSync(path.join(dir, "calls.jsonl"), [parse("parse-vegas-explicit", "has-usage"), parse("parse-vegas-explicit", null)].map(line).join("\n"));
  const generations = async (trace) => (trace ? [{ input: 1_000_000, output: 0 }] : null);
  const result = await scoreConfig(dir, "test-config", { generations });
  assert.equal(result.parse.meanCost, 1, "only the call with usage is averaged");
  assert.equal(result.unpricedCalls, 1);
  assert.equal(result.totalCost, 1);
});

test("a request that failed outside the app (no response at all) counts against completion", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "score-"));
  writeFileSync(path.join(dir, "meta.json"), JSON.stringify({ name: "gpt-6-luna", provider: "openai", model: "gpt-6-luna", price: { in: 1, out: 1 } }));
  writeFileSync(path.join(dir, "server.log"), "");
  writeFileSync(path.join(dir, "calls.jsonl"), line({ case: "trip-seattle-toddler-rain", step: "stream", status: 0, ms: 3000, trace: null, error: "fetch failed", body: "" }));
  const result = await scoreConfig(dir, "gpt-6-luna", { generations: async () => null });
  assert.equal(result.plan.n, 1);
  assert.equal(result.plan.completeRate, 0);
});

test("the runner saves a record when a request throws, so the failure is counted", async () => {
  const server = createServer((req) => req.socket.destroy());
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const dir = mkdtempSync(path.join(tmpdir(), "runner-"));
  const code = await new Promise((resolve) => {
    const child = spawn("node", ["scripts/run-eval-traces.mjs", `--base=http://127.0.0.1:${server.address().port}`, "--client=web", "--only=trip-seattle-toddler-rain", "--steps=stream", `--save=${dir}`, "--delay-ms=0", "--confirm-spend"], { env: { ...process.env, EVAL_CAPTURE_TOKEN: "t".repeat(40) }, stdio: "ignore" });
    child.on("close", resolve);
  });
  server.close();
  assert.equal(code, 1, "the runner reports the failure");
  assert.ok(existsSync(path.join(dir, "calls.jsonl")));
  const [record] = readFileSync(path.join(dir, "calls.jsonl"), "utf8").trim().split("\n").map(JSON.parse);
  assert.equal(record.case, "trip-seattle-toddler-rain");
  assert.equal(record.step, "stream");
  assert.equal(record.status, 0);
  assert.ok(record.error);
});
