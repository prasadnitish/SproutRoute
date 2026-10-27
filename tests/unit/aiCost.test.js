import test from "node:test";
import assert from "node:assert/strict";
import { estimateCostUsd, normalizeModelId, classifyProviderFailure } from "../../src/backend/utils/aiCost.js";

test("estimateCostUsd reproduces the Google bill lines for gemini-3.8-flash", () => {
  // 2026-10-23 billing export: 1,319,168 input tokens = $0.989355, 1,030,124 output tokens = $3.862942
  const cost = estimateCostUsd("gemini-3.8-flash", { inputTokens: 1_319_168, outputTokens: 1_030_124 });
  assert.ok(Math.abs(cost - 4.852297) < 0.001, `got ${cost}`);
});

test("estimateCostUsd returns null instead of guessing for an unpriced model", () => {
  assert.equal(estimateCostUsd("some-new-model", { inputTokens: 1000, outputTokens: 1000 }), null);
});

test("estimateCostUsd returns null when the provider sent no token counts", () => {
  assert.equal(estimateCostUsd("gemini-3.8-flash", {}), null);
  assert.equal(estimateCostUsd("gemini-3.8-flash", { inputTokens: undefined, outputTokens: 12 }), null);
});

test("normalizeModelId drops vendor prefixes and date suffixes", () => {
  assert.equal(normalizeModelId("google/gemini-3.8-flash"), "gemini-3.8-flash");
  assert.equal(normalizeModelId("claude-haiku-4-5-20251001"), "claude-haiku-4-5");
  assert.equal(normalizeModelId("GPT-6-Luna"), "gpt-6-luna");
});

test("AI_PRICE_OVERRIDES prices a model the table does not know", () => {
  const env = { AI_PRICE_OVERRIDES: JSON.stringify({ "gpt-5.4-nano": { in: 0.2, out: 1.25 } }) };
  const cost = estimateCostUsd("gpt-5.4-nano", { inputTokens: 1_000_000, outputTokens: 1_000_000 }, env);
  assert.equal(cost, 1.45);
});

test("a malformed AI_PRICE_OVERRIDES value is ignored", () => {
  const cost = estimateCostUsd("gemini-3.8-flash", { inputTokens: 1_000_000, outputTokens: 0 }, { AI_PRICE_OVERRIDES: "{nope" });
  assert.equal(cost, 0.75);
});

test("classifyProviderFailure recognises the failures seen in production on 2026-10-27", () => {
  const gemini = new Error("[GoogleGenerativeAI Error]: Error fetching from https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent: [402 ] Your prepayment credits are depleted.");
  const openai = new Error("401 Incorrect API key provided: sk-proj-****6FoA.");
  assert.equal(classifyProviderFailure(gemini), "credits");
  assert.equal(classifyProviderFailure(openai), "auth");
});

test("classifyProviderFailure covers other providers' billing and key errors", () => {
  assert.equal(classifyProviderFailure(new Error("Your credit balance is too low to access the Anthropic API.")), "credits");
  assert.equal(classifyProviderFailure(Object.assign(new Error("You exceeded your current quota"), { status: 429, code: "insufficient_quota" })), "credits");
  assert.equal(classifyProviderFailure(Object.assign(new Error("invalid x-api-key"), { status: 401 })), "auth");
});

test("classifyProviderFailure ignores ordinary failures", () => {
  assert.equal(classifyProviderFailure(new Error("AI provider deadline exceeded")), null);
  assert.equal(classifyProviderFailure(new Error("Trip plan returned invalid JSON or schema")), null);
  assert.equal(classifyProviderFailure(new Error("Request failed after 4021 retries")), null);
  assert.equal(classifyProviderFailure(null), null);
});
