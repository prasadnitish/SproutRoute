import test from "node:test";
import assert from "node:assert/strict";
import { createAiAlerts } from "../../src/backend/services/aiAlerts.js";

const silent = { error() {}, warn() {}, info() {} };

function setup(overrides = {}) {
  const posts = [];
  let now = Date.parse("2026-10-23T10:00:00Z");
  const alerts = createAiAlerts({
    webhookUrl: "https://hooks.example/alert",
    dailyLimitUsd: 5,
    fetchFn: async (url, init) => { posts.push({ url, body: JSON.parse(init.body) }); return { ok: true }; },
    now: () => now,
    logger: silent,
    ...overrides,
  });
  return { alerts, posts, advance: (ms) => { now += ms; } };
}

test("spend under the daily limit sends nothing", async () => {
  const { alerts, posts } = setup();
  await alerts.recordSpend(1.2);
  await alerts.recordSpend(2.3);
  assert.equal(posts.length, 0);
  assert.equal(alerts.snapshot().spendTodayUsd, 3.5);
});

test("crossing the daily limit sends exactly one alert for that day", async () => {
  const { alerts, posts } = setup();
  await alerts.recordSpend(4);
  await alerts.recordSpend(2);
  await alerts.recordSpend(3);
  assert.equal(posts.length, 1);
  assert.match(posts[0].body.text, /\$6\.00/);
  assert.match(posts[0].body.text, /\$5\.00/);
  assert.equal(posts[0].body.kind, "daily_spend");
});

test("the daily total and the alert reset at the next UTC day", async () => {
  const { alerts, posts, advance } = setup();
  await alerts.recordSpend(6);
  advance(24 * 3600 * 1000);
  assert.equal(alerts.snapshot().spendTodayUsd, 0);
  await alerts.recordSpend(6);
  assert.equal(posts.length, 2);
});

test("a call with no known cost does not move the total", async () => {
  const { alerts } = setup();
  await alerts.recordSpend(null);
  await alerts.recordSpend(undefined);
  assert.equal(alerts.snapshot().spendTodayUsd, 0);
  assert.equal(alerts.snapshot().unpricedCallsToday, 2);
});

test("a provider failure alerts once per provider and kind within six hours", async () => {
  const { alerts, posts, advance } = setup();
  await alerts.recordFailure({ provider: "gemini", kind: "credits", message: "402 credits depleted" });
  await alerts.recordFailure({ provider: "gemini", kind: "credits", message: "402 credits depleted" });
  await alerts.recordFailure({ provider: "openai", kind: "auth", message: "401 bad key" });
  assert.equal(posts.length, 2);
  assert.match(posts[0].body.text, /gemini/i);
  assert.match(posts[0].body.text, /credits/i);
  advance(6 * 3600 * 1000 + 1);
  await alerts.recordFailure({ provider: "gemini", kind: "credits", message: "402 credits depleted" });
  assert.equal(posts.length, 3);
});

test("the alert text never contains the provider's raw error message", async () => {
  const { alerts, posts } = setup();
  await alerts.recordFailure({ provider: "openai", kind: "auth", message: "401 Incorrect API key provided: sk-proj-SECRET" });
  assert.ok(!JSON.stringify(posts[0].body).includes("SECRET"));
});

test("a failing webhook never throws into the request path", async () => {
  const { alerts } = setup({ fetchFn: async () => { throw new Error("network down"); } });
  await alerts.recordSpend(10);
  await alerts.recordFailure({ provider: "gemini", kind: "credits" });
});

test("without a webhook the alert is still logged and kept in the snapshot", async () => {
  const logged = [];
  const { alerts } = setup({ webhookUrl: "", logger: { ...silent, error: (msg, fields) => logged.push({ msg, fields }) } });
  await alerts.recordFailure({ provider: "gemini", kind: "credits" });
  assert.equal(logged.length, 1);
  assert.equal(logged[0].msg, "ai:alert");
  assert.equal(alerts.snapshot().recentAlerts.length, 1);
});

const within = (ms, promise) => Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error(`still waiting after ${ms}ms`)), ms))]);

test("a webhook that never answers does not hold up the AI request", async () => {
  const { alerts } = setup({ fetchFn: () => new Promise(() => {}) });
  await within(200, alerts.recordSpend(10));
  await within(200, alerts.recordFailure({ provider: "gemini", kind: "credits" }));
});

test("webhook delivery carries a timeout signal", async () => {
  let signal;
  const { alerts } = setup({ fetchFn: async (_url, init) => { signal = init.signal; return { ok: true }; } });
  await alerts.recordFailure({ provider: "gemini", kind: "credits" });
  assert.ok(signal instanceof AbortSignal);
});

test("settings are read when an alert fires, so a .env loaded after import still applies", async () => {
  const saved = { url: process.env.AI_ALERT_WEBHOOK_URL, limit: process.env.AI_DAILY_SPEND_ALERT_USD };
  const posts = [];
  const alerts = createAiAlerts({ fetchFn: async (url) => { posts.push(url); return { ok: true }; }, logger: silent });
  try {
    process.env.AI_ALERT_WEBHOOK_URL = "https://hooks.example/late";
    process.env.AI_DAILY_SPEND_ALERT_USD = "3";
    await alerts.recordSpend(4);
    assert.deepEqual(posts, ["https://hooks.example/late"]);
    assert.equal(alerts.snapshot().dailyLimitUsd, 3);
  } finally {
    for (const [name, value] of [["AI_ALERT_WEBHOOK_URL", saved.url], ["AI_DAILY_SPEND_ALERT_USD", saved.limit]]) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});

const MIN = 60_000;
const fail = (alerts, path = "/api/v1/trip/plan") => alerts.recordResponse({ status: 500, path });

test("fewer than five server errors in five minutes sends nothing", async () => {
  const { alerts, posts } = setup();
  for (let i = 0; i < 4; i++) await fail(alerts);
  assert.equal(posts.length, 0);
});

test("five server errors within five minutes send one alert naming the count and the latest path", async () => {
  const { alerts, posts, advance } = setup();
  for (let i = 0; i < 4; i++) { await fail(alerts); advance(30_000); }
  await fail(alerts, "/api/v1/trip/stream");
  await fail(alerts);
  assert.equal(posts.length, 1);
  assert.equal(posts[0].body.kind, "http_5xx");
  assert.match(posts[0].body.text, /5 server errors in the last 5 minutes/);
  assert.match(posts[0].body.text, /\/api\/v1\/trip\/stream/);
});

test("server errors spread out beyond the window never alert", async () => {
  const { alerts, posts, advance } = setup();
  for (let i = 0; i < 8; i++) { await fail(alerts); advance(2 * MIN); }
  assert.equal(posts.length, 0);
});

test("responses below 500 are ignored", async () => {
  const { alerts, posts } = setup();
  for (let i = 0; i < 20; i++) await alerts.recordResponse({ status: i % 2 ? 404 : 429, path: "/api/x" });
  assert.equal(posts.length, 0);
});

test("a continuing outage alerts once per cooldown, then again after it", async () => {
  const { alerts, posts, advance } = setup();
  for (let i = 0; i < 12; i++) await fail(alerts);
  assert.equal(posts.length, 1);
  advance(31 * MIN);
  for (let i = 0; i < 5; i++) await fail(alerts);
  assert.equal(posts.length, 2);
});

function emailSetup(overrides = {}) {
  const calls = [];
  const warnings = [];
  const alerts = createAiAlerts({
    webhookUrl: "",
    dailyLimitUsd: 5,
    resendApiKey: "re_test_key",
    emailTo: "owner@example.com",
    fetchFn: async (url, init) => { calls.push({ url, headers: init.headers, body: JSON.parse(init.body) }); return { ok: true }; },
    now: () => Date.parse("2026-10-23T10:00:00Z"),
    logger: { ...silent, warn: (msg, meta) => warnings.push({ msg, meta }) },
    ...overrides,
  });
  return { alerts, calls, warnings };
}

test("an alert is emailed through Resend when a key and recipient are configured", async () => {
  const { alerts, calls } = emailSetup();
  await alerts.recordSpend(6);
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://api.resend.com/emails");
  assert.equal(calls[0].headers.authorization, "Bearer re_test_key");
  assert.deepEqual(calls[0].body.to, ["owner@example.com"]);
  assert.match(calls[0].body.from, /onboarding@resend\.dev/);
  assert.match(calls[0].body.subject, /SproutRoute alert/);
  assert.match(calls[0].body.text, /\$6\.00/);
});

test("no email is sent unless both the key and the recipient are set", async () => {
  const noKey = emailSetup({ resendApiKey: "" });
  await noKey.alerts.recordSpend(6);
  const noRecipient = emailSetup({ emailTo: "" });
  await noRecipient.alerts.recordSpend(6);
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(noKey.calls.length, 0);
  assert.equal(noRecipient.calls.length, 0);
  assert.equal(noKey.alerts.snapshot().emailConfigured, false);
});

test("the webhook and the email both fire for one alert", async () => {
  const { alerts, calls } = emailSetup({ webhookUrl: "https://hooks.example/alert" });
  await alerts.recordSpend(6);
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(calls.map((c) => c.url).sort(), ["https://api.resend.com/emails", "https://hooks.example/alert"]);
});

test("a failed email is logged and never throws into the request", async () => {
  const { alerts, warnings } = emailSetup({ fetchFn: async () => { throw new Error("network down"); } });
  await alerts.recordSpend(6);
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(warnings[0].msg, "ai:alert-email-failed");
  assert.equal(warnings[0].meta.error, "network down");
});

test("a Resend rejection is logged with its status so a bad key is visible", async () => {
  const { alerts, warnings } = emailSetup({ fetchFn: async () => ({ ok: false, status: 403 }) });
  await alerts.recordSpend(6);
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(warnings[0].msg, "ai:alert-email-failed");
  assert.equal(warnings[0].meta.status, 403);
});

test("sendTest emails a test message and reports that it was delivered", async () => {
  const { alerts, calls } = emailSetup();
  const result = await alerts.sendTest();

  assert.deepEqual(result, { sent: true });
  assert.equal(calls.length, 1);
  assert.match(calls[0].body.text, /test alert/i);
});

test("sendTest says why nothing was sent when email is not configured", async () => {
  const { alerts, calls } = emailSetup({ resendApiKey: "" });
  const result = await alerts.sendTest();

  assert.equal(result.sent, false);
  assert.match(result.reason, /RESEND_API_KEY/);
  assert.equal(calls.length, 0);
});

test("sendTest reports Resend's status when the send is rejected, without echoing the key", async () => {
  const { alerts } = emailSetup({ fetchFn: async () => ({ ok: false, status: 403 }) });
  const result = await alerts.sendTest();

  assert.equal(result.sent, false);
  assert.match(result.reason, /403/);
  assert.doesNotMatch(JSON.stringify(result), /re_test_key/);
});
