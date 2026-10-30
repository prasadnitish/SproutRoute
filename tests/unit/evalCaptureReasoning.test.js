import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

import { createEvalCapture } from "../../src/backend/services/evalCapture.js";
import { callModel } from "../../src/backend/utils/aiClient.js";

const backendRequire = createRequire(new URL("../../src/backend/package.json", import.meta.url));
const load = (name) => import(pathToFileURL(backendRequire.resolve(name)).href);
const nodeMajor = Number(process.versions.node.split(".")[0]);
const needsSdk = { skip: nodeMajor < 22 ? "Langfuse SDK needs Node 22+" : false };

const TOKEN = "t".repeat(40);
const ENV = {
  EVAL_CAPTURE_ENABLED: "true",
  EVAL_CAPTURE_TOKEN: TOKEN,
  LANGFUSE_PUBLIC_KEY: "pk-lf-test",
  LANGFUSE_SECRET_KEY: "sk-lf-test",
  LANGFUSE_HOST: "https://langfuse.invalid",
};
const noAlerts = { recordSpend: async () => {}, recordFailure: async () => {} };

// Runs one model call inside a captured eval request and returns the exported generation span.
async function generationSpanFor(provider, deps) {
  const { InMemorySpanExporter } = await load("@opentelemetry/sdk-trace-node");
  const { default: express } = await load("express");
  const exporter = new InMemorySpanExporter();
  const capture = createEvalCapture({ env: ENV, exporter });
  const app = express();
  app.use(express.json());
  app.use(capture.middleware);
  app.post("/api/v1/trip/plan", async (req, res) => {
    await callModel({ system: "s", user: "u", caller: "tripPlan", provider }, { alerts: noAlerts, evalCapture: capture, ...deps });
    res.json({ ok: true });
  });
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  try {
    const res = await fetch(`http://127.0.0.1:${server.address().port}/api/v1/trip/plan`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-eval-capture": TOKEN },
      body: "{}",
    });
    await res.text();
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
  await capture.flush();
  return exporter.getFinishedSpans().find((s) => s.name === "generate.tripPlan");
}

const usageDetails = (span) => JSON.parse(span.attributes["langfuse.observation.usage_details"]);

test("Gemini thinking tokens are exported as their own bucket, separate from the visible answer", needsSdk, async () => {
  const geminiModel = {
    generateContent: async () => ({
      response: {
        text: () => '{"days":[]}',
        candidates: [{ finishReason: "STOP" }],
        usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 40, thoughtsTokenCount: 260 },
      },
    }),
  };
  const span = await generationSpanFor("gemini", { geminiModel });
  assert.deepEqual(usageDetails(span), { input: 100, output: 40, output_reasoning_tokens: 260 });
});

test("OpenAI reasoning tokens are split out of completion tokens, so they are not counted twice", needsSdk, async () => {
  const openaiClient = {
    chat: {
      completions: {
        create: async () => ({
          choices: [{ message: { content: '{"days":[]}' }, finish_reason: "stop" }],
          usage: { prompt_tokens: 90, completion_tokens: 500, completion_tokens_details: { reasoning_tokens: 420 } },
        }),
      },
    },
  };
  const span = await generationSpanFor("openai", { openaiClient });
  assert.deepEqual(usageDetails(span), { input: 90, output: 80, output_reasoning_tokens: 420 });
});

test("a model that reports no reasoning tokens exports no reasoning bucket", needsSdk, async () => {
  const openaiClient = {
    chat: {
      completions: {
        create: async () => ({
          choices: [{ message: { content: '{"days":[]}' }, finish_reason: "stop" }],
          usage: { prompt_tokens: 90, completion_tokens: 30 },
        }),
      },
    },
  };
  const span = await generationSpanFor("openai", { openaiClient });
  assert.deepEqual(usageDetails(span), { input: 90, output: 30 });
});

test("the billed output total handed to cost and metrics still includes thinking tokens", needsSdk, async () => {
  const geminiModel = {
    generateContent: async () => ({
      response: {
        text: () => '{"days":[]}',
        candidates: [{ finishReason: "STOP" }],
        usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 40, thoughtsTokenCount: 260 },
      },
    }),
  };
  const result = await callModel({ system: "s", user: "u", caller: "tripPlan", provider: "gemini" }, { geminiModel, alerts: noAlerts });
  assert.equal(result.aiUsage.outputTokens, 300);
  assert.equal(result.aiUsage.reasoningTokens, 260);
});
