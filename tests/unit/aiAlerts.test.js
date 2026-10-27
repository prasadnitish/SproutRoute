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
