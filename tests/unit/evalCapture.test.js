import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

import { createEvalCapture, evalCaptureConfig, maskSecrets, toPayload } from "../../src/backend/services/evalCapture.js";
import { callModel } from "../../src/backend/utils/aiClient.js";

// Backend dependencies live in src/backend/node_modules.
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

async function startApp(capture, routes) {
  const { default: express } = await load("express");
  const app = express();
  app.use(express.json());
  app.use(capture.middleware);
  routes(app);
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  return { base, close: () => new Promise((resolve) => server.close(resolve)) };
}

const attrs = (span) => span.attributes;
const parsed = (value) => (typeof value === "string" ? JSON.parse(value) : value);

test("config stays off unless every requirement is met", () => {
  assert.equal(evalCaptureConfig({}).enabled, false);
  assert.equal(evalCaptureConfig({ ...ENV, EVAL_CAPTURE_ENABLED: "false" }).enabled, false);
  assert.equal(evalCaptureConfig({ ...ENV, EVAL_CAPTURE_TOKEN: "short" }).enabled, false);
  assert.equal(evalCaptureConfig({ ...ENV, LANGFUSE_SECRET_KEY: "" }).enabled, false);
  const { LANGFUSE_HOST, ...noHost } = ENV;
  assert.equal(evalCaptureConfig(noHost).enabled, false);
  // Either base URL name works.
  assert.equal(evalCaptureConfig({ ...noHost, LANGFUSE_BASE_URL: "https://x.invalid" }).baseUrl, "https://x.invalid");
  if (nodeMajor >= 22) assert.equal(evalCaptureConfig(ENV).enabled, true);
});

test("payload copy drops functions, class instances and cycles; secrets are masked", () => {
  class Client {}
  const loop = { name: "loop" };
  loop.self = loop;
  const out = toPayload({ fn() {}, client: new Client(), loop, when: new Date(0), list: [1, undefined] });
  assert.deepEqual(out, {
    client: "[Client]",
    loop: { name: "loop", self: "[circular]" },
    when: "1970-01-01T00:00:00.000Z",
    list: [1, null],
  });
  const masked = maskSecrets("key sk-abcdefghijklmnopqrstuv and Bearer abcdefghijklmnopqrstuvwx and AIza" + "x".repeat(35));
  assert.ok(!/sk-abc|Bearer abc|AIzax/.test(masked), masked);
});

test("requests without the right token are never captured or sent", async () => {
  let sdkLoads = 0;
  const capture = createEvalCapture({ env: ENV, loadSdk: async () => { sdkLoads++; throw Error("must not load"); } });
  const seen = [];
  const app = await startApp(capture, (a) =>
    a.post("/api/v1/trip/plan", (req, res) => {
      seen.push(capture.active());
      res.json({ ok: true });
    }),
  );
  try {
    for (const headers of [{}, { "x-eval-capture": "wrong-token" }]) {
      const res = await fetch(`${app.base}/api/v1/trip/plan`, {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
        body: JSON.stringify({ destination: "Seattle" }),
      });
      assert.equal(res.status, 200);
    }
  } finally {
    await app.close();
  }
  assert.deepEqual(seen, [false, false]);
  assert.equal(sdkLoads, 0);
  assert.equal(capture.startGeneration({ caller: "x" }), null);
});

test("an eval request becomes one Langfuse trace with tool and generation children", needsSdk, async () => {
  const { InMemorySpanExporter } = await load("@opentelemetry/sdk-trace-node");
  const exporter = new InMemorySpanExporter();
  const capture = createEvalCapture({ env: ENV, exporter });
  const anthropicClient = {
    messages: {
      create: async () => ({
        content: [{ type: "text", text: '{"days":[]}' }],
        stop_reason: "end_turn",
        usage: { input_tokens: 120, output_tokens: 30 },
      }),
    },
  };
  const app = await startApp(capture, (a) =>
    a.post("/api/v1/trip/stream", async (req, res) => {
      res.setHeader("Content-Type", "text/event-stream");
      const weather = await capture.observe("tool.getWeatherForecast", { input: ["Seattle", () => {}] }, async () => ({ summary: "Mild" }));
      const plan = await callModel(
        { system: "Plan for parents.", user: `Trip to ${req.body.destination}. Key sk-abcdefghijklmnopqrstuv`, caller: "tripPlan", provider: "anthropic" },
        { anthropicClient, alerts: noAlerts, evalCapture: capture },
      );
      res.write(`event: weather\ndata: ${JSON.stringify(weather)}\n\n`);
      res.write(": keepalive\n\n");
      res.write(`event: done\ndata: ${plan.responseText}\n\n`);
      res.end();
    }),
  );
  try {
    const res = await fetch(`${app.base}/api/v1/trip/stream`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-eval-capture": TOKEN,
        "x-eval-client": "ios",
        "x-eval-case": "seattle-toddler",
        "x-eval-run": "run-2026-10-28",
        "x-eval-rubric": "O1,X2",
      },
      body: JSON.stringify({ destination: "Seattle" }),
    });
    await res.text();
  } finally {
    await app.close();
  }
  await capture.flush();

  const spans = exporter.getFinishedSpans();
  const byName = Object.fromEntries(spans.map((s) => [s.name, s]));
  assert.deepEqual(Object.keys(byName).sort(), ["generate.tripPlan", "tool.getWeatherForecast", "trip-stream"]);
  const root = byName["trip-stream"];
  const tool = byName["tool.getWeatherForecast"];
  const gen = byName["generate.tripPlan"];
  const traceId = root.spanContext().traceId;
  assert.ok(spans.every((s) => s.spanContext().traceId === traceId), "one trace per request");
  const parentOf = (s) => s.parentSpanContext?.spanId ?? s.parentSpanId;
  assert.equal(parentOf(tool), root.spanContext().spanId);
  assert.equal(parentOf(gen), root.spanContext().spanId);

  assert.equal(attrs(root)["langfuse.observation.type"], "chain");
  assert.equal(attrs(root)["langfuse.trace.name"], "trip-stream");
  assert.equal(attrs(root)["session.id"], "run-2026-10-28");
  assert.deepEqual([...attrs(root)["langfuse.trace.tags"]].sort(), ["case:seattle-toddler", "client:ios", "eval"]);
  assert.deepEqual(parsed(attrs(root)["langfuse.observation.input"]), { destination: "Seattle" });
  assert.deepEqual(parsed(attrs(root)["langfuse.observation.output"]), { weather: { summary: "Mild" }, done: { days: [] } });
  assert.deepEqual(parsed(attrs(root)["langfuse.trace.metadata.rubric_lines"]), ["O1", "X2"]);

  assert.equal(attrs(tool)["langfuse.observation.type"], "tool");
  assert.deepEqual(parsed(attrs(tool)["langfuse.observation.input"]), ["Seattle", null]);

  assert.equal(attrs(gen)["langfuse.observation.type"], "generation");
  assert.equal(attrs(gen)["langfuse.observation.model.name"], "claude-haiku-4-5-20251001");
  assert.deepEqual(parsed(attrs(gen)["langfuse.observation.usage_details"]), { input: 120, output: 30 });
  assert.equal(parsed(attrs(gen)["langfuse.observation.metadata.validation"]), "passed");
  assert.equal(parsed(attrs(gen)["langfuse.observation.metadata.attempt"]), "primary");
  const genInput = attrs(gen)["langfuse.observation.input"];
  assert.match(genInput, /Trip to Seattle/);
  assert.doesNotMatch(genInput, /sk-abcdefghijklmnopqrstuv/, "secrets are masked before export");
});

test("a rejected answer and the fallback that rescued it are both recorded", needsSdk, async (t) => {
  const saved = process.env.ANTHROPIC_API_KEY;
  process.env.ANTHROPIC_API_KEY = "test-key";
  t.after(() => (saved === undefined ? delete process.env.ANTHROPIC_API_KEY : (process.env.ANTHROPIC_API_KEY = saved)));

  const { InMemorySpanExporter } = await load("@opentelemetry/sdk-trace-node");
  const exporter = new InMemorySpanExporter();
  const capture = createEvalCapture({ env: ENV, exporter });
  const openaiClient = {
    chat: { completions: { create: async () => ({ choices: [{ message: { content: "not json" }, finish_reason: "stop" }] }) } },
  };
  const anthropicClient = {
    messages: { create: async () => ({ content: [{ type: "text", text: "{}" }], stop_reason: "end_turn" }) },
  };
  const app = await startApp(capture, (a) =>
    a.post("/api/v1/trip/plan", async (req, res) => {
      const out = await callModel(
        {
          system: "s",
          user: "u",
          caller: "tripPlan",
          provider: "openai",
          validateResponse: (text) => JSON.parse(text),
        },
        { openaiClient, anthropicClient, alerts: noAlerts, evalCapture: capture },
      );
      res.json({ provider: out.provider });
    }),
  );
  try {
    const res = await fetch(`${app.base}/api/v1/trip/plan`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-eval-capture": TOKEN, "x-eval-client": "web" },
      body: "{}",
    });
    assert.deepEqual(await res.json(), { provider: "anthropic" });
  } finally {
    await app.close();
  }
  await capture.flush();

  const gens = exporter.getFinishedSpans().filter((s) => s.name === "generate.tripPlan");
  const summary = gens
    .map((s) => ({
      attempt: parsed(attrs(s)["langfuse.observation.metadata.attempt"]),
      provider: parsed(attrs(s)["langfuse.observation.metadata.provider"]),
      validation: parsed(attrs(s)["langfuse.observation.metadata.validation"]),
      level: attrs(s)["langfuse.observation.level"] ?? "DEFAULT",
    }))
    .sort((a, b) => a.attempt.localeCompare(b.attempt));
  assert.deepEqual(summary, [
    { attempt: "fallback-1", provider: "anthropic", validation: "passed", level: "DEFAULT" },
    { attempt: "primary", provider: "openai", validation: "rejected", level: "ERROR" },
  ]);
});
