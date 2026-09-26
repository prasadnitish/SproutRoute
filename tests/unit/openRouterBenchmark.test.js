import test from "node:test";
import assert from "node:assert/strict";
import { buildOpenRouterRequest, maximumRequestCost, canStartRequest, keyRunCap, billedCost, selectEndpoint } from "../../scripts/benchmark-openrouter.mjs";

test("OpenRouter request pins the model and requires JSON-capable endpoints", () => {
  const body = buildOpenRouterRequest("openai/gpt-6-luna", { system: "Return JSON", user: "Plan Las Vegas", maxTokens: 4200 });
  assert.equal(body.model, "openai/gpt-6-luna");
  assert.equal(body.response_format.type, "json_object");
  assert.equal(body.provider.require_parameters, true);
  assert.equal(body.provider.allow_fallbacks, false);
  assert.equal(body.reasoning_effort, "low");
  assert.equal(body.max_tokens, 4200);
  assert.equal(buildOpenRouterRequest("qwen/qwen3.8-max-0902", { user: "Return JSON", maxTokens: 1200 }, null, "alibaba", "low").reasoning_effort, "low");
});

test("spend guard reserves the worst-case token charge before a request", () => {
  const pricing = { prompt: "0.000002", completion: "0.00001" };
  const charge = maximumRequestCost({ system: "é", user: "x", maxTokens: 1000 }, pricing);
  assert.ok(charge >= 0.01);
  assert.equal(canStartRequest(19.98, charge, 20), true);
  assert.equal(canStartRequest(19.995, charge, 20), false);
  assert.throws(() => maximumRequestCost({ system: "a", user: "b", maxTokens: 100 }, { prompt: "-1", completion: "0" }));
});

test("paid run refuses an unbounded or mismatched key and missing charge data", () => {
  assert.equal(keyRunCap({ limit: 20, limit_remaining: 20 }, 25.03), 20);
  assert.throws(() => keyRunCap({ limit: 50, limit_remaining: 50 }, 25.03));
  assert.throws(() => keyRunCap({ limit: null, limit_remaining: null }, 25.03));
  assert.throws(() => keyRunCap({ limit: 20, limit_remaining: 20 }, 5));
  assert.equal(billedCost({ cost: 0.002 }), 0.002);
  assert.throws(() => billedCost({ cost: null }));
  assert.throws(() => billedCost(undefined));
});

test("model screen pins an available JSON-capable serving endpoint and its actual price", () => {
  const endpoints = [
    { tag: "relace", status: 0, supported_parameters: ["max_tokens"], pricing: { prompt: "0.00000004", completion: "0.0000005" } },
    { tag: "z-ai/fp8", provider_name: "Z.AI", status: 0, supported_parameters: ["max_tokens", "response_format"], pricing: { prompt: "0.00000015", completion: "0.0000005" } },
  ];
  const selected = selectEndpoint("z-ai/glm-5.3-flash", endpoints);
  assert.equal(selected.tag, "z-ai/fp8");
  assert.equal(selected.pricing.prompt, "0.00000015");
  assert.throws(() => selectEndpoint("z-ai/glm-5.3-flash", [endpoints[0]]));
  assert.equal(selectEndpoint("anthropic/claude-opus-5.5", [{
    tag: "anthropic", status: 0, supported_parameters: ["max_tokens", "response_format"],
  }]).tag, "anthropic");
});
