import test from "node:test";
import assert from "node:assert/strict";
import { callModel } from "../../src/backend/utils/aiClient.js";

test("routes through the opt-in gateway and maps caller to task type", async () => {
  let request;
  const result = await callModel({ system: "system", user: "user", caller: "tripPlan", maxTokens: 64 }, {
    gatewayConfig: { url: "https://gateway.example", apiKey: "gateway-secret", tenantId: "sproutroute", serviceId: "backend", environment: "test" },
    gatewayFetch: async (url, init) => { request = { url, init }; return { ok: true, json: async () => ({ choices: [{ message: { content: "through gateway" }, finish_reason: "stop" }] }) }; },
  });
  assert.deepEqual(result, { responseText: "through gateway", stopReason: "stop" });
  assert.equal(request.url, "https://gateway.example/v1/chat/completions");
  assert.equal(request.init.headers["x-task-type"], "tripPlan");
  assert.equal(request.init.headers.authorization, "Bearer gateway-secret");
  assert.equal(JSON.parse(request.init.body).messages[0].content, "system");
});

test("does not use the gateway unless both URL and credential are configured", async () => {
  const anthropicClient = { messages: { create: async () => ({ content: [{ type: "text", text: "direct" }], stop_reason: "end_turn" }) } };
  const result = await callModel({ system: "s", user: "u", caller: "tripPlan", provider: "anthropic" }, { gatewayConfig: { url: "https://gateway.example", apiKey: "" }, anthropicClient });
  assert.equal(result.responseText, "direct");
});

test("rejects insecure non-local gateway URLs", async () => {
  await assert.rejects(() => callModel({ system: "s", user: "u" }, { gatewayConfig: { url: "http://gateway.example", apiKey: "x" } }), /HTTPS/);
});
