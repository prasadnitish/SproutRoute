import test from "node:test";
import assert from "node:assert/strict";
import { callModel } from "../../src/backend/utils/aiClient.js";

const openai = (create) => ({ chat: { completions: { create } } });
const answer = (text = '{"ok":true}', finish = "stop") => ({ choices: [{ message: { content: text }, finish_reason: finish }] });

test("Luna sends low reasoning and omits unsupported temperature", async () => {
  let body;
  await callModel({ provider: "openai", model: "gpt-6-luna", system: "JSON", user: "test" }, {
    openaiClient: openai(async (value) => { body = value; return answer(); }),
  });
  assert.equal(body.reasoning_effort, "low");
  assert.equal(body.temperature, undefined);
});

for (const failure of ["429", "503", "timeout", "empty", "truncated", "invalid-json"]) {
  test(`provider recovery returns validated output after ${failure}`, async () => {
    const original = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = "test-only";
    let backupCalls = 0;
    let primarySignal;
    try {
      const result = await callModel({ provider: "gemini", system: "JSON", user: "test", timeoutMs: 120,
        validateResponse: (text) => { assert.equal(JSON.parse(text).ok, true); },
      }, {
        geminiModel: { generateContent: async (_body, options) => {
          primarySignal = options.signal;
          if (failure === "timeout") return new Promise(() => {});
          if (["429", "503"].includes(failure)) throw Object.assign(new Error(failure), { status: Number(failure) });
          return { response: { text: () => failure === "empty" ? "" : failure === "invalid-json" ? "broken" : '{"ok":true}',
            candidates: [{ finishReason: failure === "truncated" ? "MAX_TOKENS" : "STOP" }] } };
        } },
        openaiClient: openai(async () => { backupCalls++; return answer(); }),
      });
      assert.equal(result.responseText, '{"ok":true}');
      assert.equal(result.provider, "openai");
      assert.equal(backupCalls, 1);
      if (failure === "timeout") assert.equal(primarySignal.aborted, true);
    } finally {
      if (original === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = original;
    }
  });
}

test("cancellation stops the provider chain", async () => {
  const original = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "test-only";
  const controller = new AbortController();
  let backupCalls = 0;
  try {
    await assert.rejects(callModel({ provider: "gemini", system: "JSON", user: "test", signal: controller.signal }, {
      geminiModel: { generateContent: async () => { controller.abort(new Error("user cancelled")); throw new Error("cancelled"); } },
      openaiClient: openai(async () => { backupCalls++; return answer(); }),
    }), /cancelled/);
    assert.equal(backupCalls, 0);
  } finally {
    if (original === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = original;
  }
});
