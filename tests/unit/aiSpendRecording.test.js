import test from "node:test";
import assert from "node:assert/strict";
import { callModel } from "../../src/backend/utils/aiClient.js";
import { metrics } from "../../src/backend/services/metrics.js";

const KEYS = ["OPENAI_API_KEY", "ANTHROPIC_API_KEY", "DEEPSEEK_API_KEY", "AI_PROVIDER"];

function withCleanEnv(fn) {
  return async () => {
    const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
    const originalRecord = metrics.recordAiCall;
    for (const k of KEYS) delete process.env[k];
    const recorded = [];
    metrics.recordAiCall = (data) => { recorded.push(data); };
    try {
      await fn(recorded);
    } finally {
      metrics.recordAiCall = originalRecord;
      for (const [k, v] of Object.entries(saved)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
  };
}

function fakeAlerts() {
  const calls = { spend: [], failures: [] };
  return {
    calls,
    async recordSpend(cost) { calls.spend.push(cost); },
    async recordFailure(failure) { calls.failures.push(failure); },
  };
}

const geminiOk = (usageMetadata) => ({
  generateContent: async () => ({
    response: { text: () => "{}", candidates: [{ finishReason: "STOP" }], usageMetadata },
  }),
});

test("a Gemini call records tokens (thinking counted as output) and an estimated cost", withCleanEnv(async (recorded) => {
  const alerts = fakeAlerts();
  await callModel(
    { system: "s", user: "u", provider: "gemini", model: "gemini-3.8-flash", caller: "tripPlan" },
    { geminiModel: geminiOk({ promptTokenCount: 1000, candidatesTokenCount: 2000, thoughtsTokenCount: 500 }), alerts },
  );
  assert.equal(recorded.length, 1);
  assert.equal(recorded[0].inputTokens, 1000);
  assert.equal(recorded[0].outputTokens, 2500);
  assert.ok(Math.abs(recorded[0].costUsd - 0.010125) < 1e-9, `got ${recorded[0].costUsd}`);
  assert.deepEqual(alerts.calls.spend, [recorded[0].costUsd]);
}));

test("a call from a model with no price still records its tokens and a null cost", withCleanEnv(async (recorded) => {
  const alerts = fakeAlerts();
  await callModel(
    { system: "s", user: "u", provider: "gemini", model: "gemini-9-unpriced", caller: "tripPlan" },
    { geminiModel: geminiOk({ promptTokenCount: 10, candidatesTokenCount: 20 }), alerts },
  );
  assert.equal(recorded[0].outputTokens, 20);
  assert.equal(recorded[0].costUsd, null);
}));

test("a billing failure from the provider raises a credits alert", withCleanEnv(async () => {
  const alerts = fakeAlerts();
  const geminiDown = { generateContent: async () => { throw new Error("[GoogleGenerativeAI Error]: [402 ] Your prepayment credits are depleted."); } };
  await assert.rejects(() => callModel({ system: "s", user: "u", provider: "gemini", model: "gemini-3.8-flash", caller: "tripPlan" }, { geminiModel: geminiDown, alerts }));
  assert.equal(alerts.calls.failures.length, 1);
  assert.equal(alerts.calls.failures[0].provider, "gemini");
  assert.equal(alerts.calls.failures[0].kind, "credits");
}));

test("an ordinary failure raises no alert", withCleanEnv(async () => {
  const alerts = fakeAlerts();
  const geminiSlow = { generateContent: async () => { throw new Error("socket hang up"); } };
  await assert.rejects(() => callModel({ system: "s", user: "u", provider: "gemini", model: "gemini-3.8-flash", caller: "tripPlan" }, { geminiModel: geminiSlow, alerts }));
  assert.equal(alerts.calls.failures.length, 0);
}));

test("tokens from an answer that fails validation are still counted as spend", withCleanEnv(async (recorded) => {
  const alerts = fakeAlerts();
  await assert.rejects(() => callModel(
    {
      system: "s", user: "u", provider: "gemini", model: "gemini-3.8-flash", caller: "tripPlan",
      validateResponse: async () => { throw new Error("Trip plan repeats activities across days"); },
    },
    { geminiModel: geminiOk({ promptTokenCount: 1000, candidatesTokenCount: 2000 }), alerts },
  ));
  assert.equal(recorded[0].success, false);
  assert.equal(recorded[0].inputTokens, 1000);
  assert.equal(recorded[0].outputTokens, 2000);
  assert.ok(recorded[0].costUsd > 0);
  assert.equal(alerts.calls.spend.length, 1);
}));

test("getSpend totals recorded cost per day and per model and counts unpriced calls", async () => {
  const rows = [
    { created_at: "2026-10-23T10:00:00Z", provider: "gemini", model: "gemini-3.8-flash", timing_json: { inputTokens: 1000, outputTokens: 2000, costUsd: 0.5 } },
    { created_at: "2026-10-23T11:00:00Z", provider: "gemini", model: "gemini-3.8-flash", timing_json: { inputTokens: 10, outputTokens: 20, costUsd: 0.25 } },
    { created_at: "2026-10-22T09:00:00Z", provider: "openai", model: "gpt-5.4-nano", timing_json: { inputTokens: 5, outputTokens: 5, costUsd: null } },
    { created_at: "2026-10-22T09:30:00Z", provider: "openai", model: "gpt-5.4-nano", timing_json: null },
  ];
  const query = { select() { return this; }, eq() { return this; }, gte() { return this; }, order() { return this; }, limit() { return Promise.resolve({ data: rows, error: null }); } };
  const spend = await metrics.getSpend({ getAdmin: () => ({ from: () => query }), now: () => Date.parse("2026-10-23T12:00:00Z") });
  assert.equal(spend.today.usd, 0.75);
  assert.equal(spend.last7Days.usd, 0.75);
  assert.equal(spend.today.calls, 2);
  assert.equal(spend.byDay["2026-10-23"], 0.75);
  assert.equal(spend.byModel["gemini/gemini-3.8-flash"].usd, 0.75);
  assert.equal(spend.byModel["gemini/gemini-3.8-flash"].outputTokens, 2020);
  assert.equal(spend.byModel["openai/gpt-5.4-nano"].unpricedCalls, 2);
});

test("getSpend says so when the metrics store is unavailable", async () => {
  const query = { select() { return this; }, eq() { return this; }, gte() { return this; }, order() { return this; }, limit() { return Promise.resolve({ data: null, error: { message: "down" } }); } };
  const spend = await metrics.getSpend({ getAdmin: () => ({ from: () => query }) });
  assert.equal(spend.available, false);
});
