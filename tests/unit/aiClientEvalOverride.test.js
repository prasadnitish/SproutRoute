import test from "node:test";
import assert from "node:assert/strict";
import { callModel } from "../../src/backend/utils/aiClient.js";

// AI_EVAL_MODEL_OVERRIDE points the planning callers at one model, with no fallback, so a model comparison
// measures that model alone. It is inert unless ALLOW_EVAL_MODEL_OVERRIDE=true is set as well.
const KEYS = ["AI_EVAL_MODEL_OVERRIDE", "ALLOW_EVAL_MODEL_OVERRIDE", "AI_PROVIDER", "OPENAI_API_KEY", "ANTHROPIC_API_KEY"];
const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
test.afterEach(() => { for (const k of KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } });

const noAlerts = { recordSpend: async () => {}, recordFailure: async () => {} };
const noCapture = { startGeneration: () => null };

function clients() {
  const seen = { anthropic: [], openai: [] };
  return {
    seen,
    deps: {
      alerts: noAlerts, evalCapture: noCapture,
      anthropicClient: { messages: { create: async (p) => { seen.anthropic.push(p); return { content: [{ type: "text", text: "{}" }], stop_reason: "end_turn", usage: { input_tokens: 5, output_tokens: 2 } }; } } },
      openaiClient: { chat: { completions: { create: async (p) => { seen.openai.push(p); return { choices: [{ message: { content: "{}" }, finish_reason: "stop" }], usage: { prompt_tokens: 5, completion_tokens: 2 } }; } } } },
    },
  };
}

const enable = (override) => { process.env.ALLOW_EVAL_MODEL_OVERRIDE = "true"; process.env.AI_EVAL_MODEL_OVERRIDE = JSON.stringify(override); };
const ask = (deps, caller, extra = {}) => callModel({ system: "s", user: "u", caller, provider: "openai", model: "gpt-5.4-nano", maxTokens: 100, temperature: 0, ...extra }, deps);

test("the override sends a planning caller to the chosen provider, model and effort", async () => {
  enable({ provider: "anthropic", model: "claude-haiku-5-5", effort: "low" });
  const { seen, deps } = clients();
  const result = await ask(deps, "tripPlan");
  assert.equal(seen.openai.length, 0);
  assert.equal(seen.anthropic[0].model, "claude-haiku-5-5");
  assert.deepEqual(seen.anthropic[0].output_config, { effort: "low" });
  assert.equal(result.provider, "anthropic");
  assert.equal(result.model, "claude-haiku-5-5");
});

test("it covers parseInput, travelSafety and tripPlan but not other callers", async () => {
  enable({ provider: "anthropic", model: "claude-haiku-5-5" });
  for (const caller of ["parseInput", "travelSafety", "tripPlan", "tripPlan:repair"]) {
    const { seen, deps } = clients();
    await ask(deps, caller);
    assert.equal(seen.anthropic.length, 1, caller);
  }
  const { seen, deps } = clients();
  await ask(deps, "safetyLawResearch");
  assert.equal(seen.anthropic.length, 0);
  assert.equal(seen.openai.length, 1, "an uncovered caller keeps its own provider");
});

test("an overridden model has no fallback: a failure is thrown, not rescued by another provider", async () => {
  enable({ provider: "openai", model: "gpt-6-luna" });
  process.env.ANTHROPIC_API_KEY = "x";
  process.env.OPENAI_API_KEY = "x";
  const { seen, deps } = clients();
  deps.openaiClient = { chat: { completions: { create: async () => { throw new Error("boom"); } } } };
  await assert.rejects(() => ask(deps, "tripPlan"), /boom/);
  assert.equal(seen.anthropic.length, 0, "no silent switch to another provider");
});

test("the override is ignored unless ALLOW_EVAL_MODEL_OVERRIDE is true", async () => {
  process.env.AI_EVAL_MODEL_OVERRIDE = JSON.stringify({ provider: "anthropic", model: "claude-haiku-5-5" });
  const { seen, deps } = clients();
  await ask(deps, "tripPlan");
  assert.equal(seen.anthropic.length, 0);
  assert.equal(seen.openai[0].model, "gpt-5.4-nano");
});

test("a malformed or incomplete override is ignored", async () => {
  process.env.ALLOW_EVAL_MODEL_OVERRIDE = "true";
  for (const raw of ["not json", JSON.stringify({ model: "x" }), JSON.stringify({ provider: "unknown", model: "x" }), JSON.stringify({ provider: "openai" })]) {
    process.env.AI_EVAL_MODEL_OVERRIDE = raw;
    const { seen, deps } = clients();
    await ask(deps, "tripPlan");
    assert.equal(seen.openai[0].model, "gpt-5.4-nano", raw);
  }
});

test("the override can switch Claude's thinking off, and leaves it alone otherwise", async () => {
  enable({ provider: "anthropic", model: "claude-haiku-5-5", effort: "low", thinking: "disabled" });
  const off = clients();
  await ask(off.deps, "tripPlan");
  assert.deepEqual(off.seen.anthropic[0].thinking, { type: "disabled" });

  enable({ provider: "anthropic", model: "claude-haiku-5-5", effort: "low" });
  const on = clients();
  await ask(on.deps, "tripPlan");
  assert.equal(on.seen.anthropic[0].thinking, undefined);
});

test("thinking can be turned off the way each Claude model wants it, and other values are ignored", async () => {
  enable({ provider: "anthropic", model: "claude-sonnet-5-5", thinking: "between_tools" });
  const sonnet = clients();
  await ask(sonnet.deps, "tripPlan");
  assert.deepEqual(sonnet.seen.anthropic[0].thinking, { type: "between_tools" });

  enable({ provider: "anthropic", model: "claude-haiku-5-5", thinking: "enabled" });
  const other = clients();
  await ask(other.deps, "tripPlan");
  assert.equal(other.seen.anthropic[0].thinking, undefined);
});
