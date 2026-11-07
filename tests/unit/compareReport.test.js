import test from "node:test";
import assert from "node:assert/strict";
import { judgeMeans, tables } from "../../scripts/report-comparison.mjs";
import { streamTimings, readServerLog } from "../../scripts/score-comparison.mjs";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const config = (over = {}) => ({
  parse: { n: 10, passRate: 0.9, p50Ms: 4000, meanCost: 0.001 },
  plan: { n: 7, completeRate: 1, p50Ms: 30000, p95Ms: 44000, meanCost: 0.0166, meanOutputTokens: 3500, groundedRatio: 0.97, durationInRange: 0.95, hoursCorrectionsPer10Stops: 0.8, thinDaysPerPlan: 0, repeatedStopsLongTrips: 2.5 },
  tips: { n: 7, validRate: 1, p50Ms: 4500, meanCost: 0.0005 },
  ...over,
});

test("judge scores are averaged per model, and judge errors are left out", () => {
  const means = judgeMeans({ judgments: [
    { config: "a", kind: "plan", x2: 2, o3: 3, issues: ["x", "y"] },
    { config: "a", kind: "plan", x2: 4, o3: 3, issues: [] },
    { config: "a", kind: "plan", error: "judge unavailable" },
    { config: "a", kind: "tips", legalClaims: ["1", "2", "3"], g1Concern: "high" },
  ] });
  assert.deepEqual(means.a.x2, [2, 4]);
  assert.equal(means.a.issues, 2);
  assert.equal(means.a.plans, 2);
  assert.equal(means.a.claims, 3);
  assert.equal(means.a.g1.high, 1);
});

test("the report tables show counts, medians, per-trip cost and the repeat run side by side", () => {
  const summary = { configs: { model: config() } };
  const repeat = { configs: { model: config({ plan: { ...config().plan, p50Ms: 28000, completeRate: 6 / 7 } }) } };
  const text = tables(summary, { judgments: [{ config: "model", kind: "plan", x2: 3, o3: 2, issues: ["a"] }] }, repeat);
  assert.match(text, /\| model \| 9\/10 \| 4\.0s \| 7\/7 \| 30\.0s \| 44\.0s \| 7\/7 \| 4\.5s \| 1\.81¢ \|/);
  assert.match(text, /\| model \| 3500 \| 97% \| 95% \| 0\.8 \| 0\.0 \| 2\.5 \| 3\.0 \| 2\.0 \| 1\.0 \|/);
  assert.match(text, /7\/7 \/ 6\/7 \| 30\.0s \/ 28\.0s/);
});

test("server log timing is matched to each stream request, with the hours corrections made before it", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "cmp-"));
  const file = path.join(dir, "server.log");
  writeFileSync(file, [
    "npm warn something", "Server listening on port 1",
    JSON.stringify({ msg: "trip-plan:hours-corrected", changes: [{}, {}] }),
    JSON.stringify({ msg: "stream:done", timing: { firstChunk: 100, total: 200 } }),
    JSON.stringify({ msg: "stream:done", timing: { firstChunk: 300, total: 400 } }),
  ].join("\n"));
  const log = readServerLog(file);
  assert.equal(log.length, 3, "non-JSON lines are skipped");
  assert.deepEqual(streamTimings(log).map((t) => [t.timing.firstChunk, t.hoursCorrections]), [[100, 2], [300, 0]]);
});
