import test from "node:test";
import assert from "node:assert/strict";
import { postScores, completionScore } from "../../scripts/lib/langfuseScore.mjs";

const ENV = { LANGFUSE_PUBLIC_KEY: "pk-lf-a", LANGFUSE_SECRET_KEY: "sk-lf-b", LANGFUSE_BASE_URL: "https://lf.invalid/" };

test("scores are posted to the public scores endpoint as an array with Basic auth", async () => {
  const calls = [];
  const fetchFn = async (url, init) => { calls.push({ url, init }); return { ok: true, status: 200 }; };
  const score = { traceId: "t1", name: "completed", value: 1, dataType: "BOOLEAN" };

  const out = await postScores([score], { env: ENV, fetchFn });

  assert.deepEqual(out, { posted: 1 });
  assert.equal(calls[0].url, "https://lf.invalid/api/public/scores");
  assert.equal(calls[0].init.method, "POST");
  assert.equal(calls[0].init.headers.authorization, `Basic ${Buffer.from("pk-lf-a:sk-lf-b").toString("base64")}`);
  assert.deepEqual(JSON.parse(calls[0].init.body), [score]);
});

test("without Langfuse credentials nothing is sent and the caller is told why", async () => {
  let called = false;
  const out = await postScores([{ traceId: "t1", name: "x", value: 1 }], { env: {}, fetchFn: async () => { called = true; } });
  assert.equal(called, false);
  assert.equal(out.skipped, "LANGFUSE_PUBLIC_KEY, LANGFUSE_SECRET_KEY and LANGFUSE_BASE_URL are required");
});

test("a rejected post is reported with its status, not thrown, so a score problem cannot fail an eval run", async () => {
  const out = await postScores([{ traceId: "t1", name: "x", value: 1 }], { env: ENV, fetchFn: async () => ({ ok: false, status: 400, text: async () => "bad score" }) });
  assert.equal(out.error, "HTTP 400: bad score");
  const thrown = await postScores([{ traceId: "t1", name: "x", value: 1 }], { env: ENV, fetchFn: async () => { throw new TypeError("offline"); } });
  assert.equal(thrown.error, "offline");
});

test("the completion score is boolean, keyed by trace so a re-run overwrites it, and says why it failed", () => {
  assert.deepEqual(completionScore({ trace: "t9", failed: false }), {
    traceId: "t9", id: "t9-completed", name: "completed", value: 1, dataType: "BOOLEAN",
  });
  assert.deepEqual(completionScore({ trace: "t9", failed: true, status: 503, streamError: false }), {
    traceId: "t9", id: "t9-completed", name: "completed", value: 0, dataType: "BOOLEAN", comment: "HTTP 503",
  });
  assert.equal(completionScore({ trace: "t9", failed: true, status: 200, streamError: true }).comment, "HTTP 200, stream error event");
  assert.equal(completionScore({ trace: null, failed: false }), null, "no trace id means nothing to attach to");
});
