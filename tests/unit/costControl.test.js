import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import { encodeCbor } from "../helpers/cbor.js";
import { assertionClientData, DEFAULT_APP_ID } from "../../src/backend/services/appAttest.js";
import { createCostControl, readCostControlConfig } from "../../src/backend/middleware/costControl.js";
import { createMemoryUsage, createUsageStore } from "../../src/backend/services/usageStore.js";

const fixture = JSON.parse(fs.readFileSync(new URL("../fixtures/appAttest/attestations.json", import.meta.url)));
const T0 = Date.parse(fixture.issuedAt) + 60_000;
const sha256 = (d) => crypto.createHash("sha256").update(d).digest();
const silent = { info() {}, warn() {}, error() {} };

// A store with the real in-memory semantics and an in-memory device table.
function fakeStore() {
  const memory = createMemoryUsage();
  const devices = new Map();
  const calls = [];
  return {
    calls,
    devices,
    // Like usage_consume: the stored device counter decides replays, then every limit is checked.
    async consume(items, device) {
      calls.push({ items, device });
      if (device) {
        const row = devices.get(device.keyId);
        if (!row || !(device.signCount > row.signCount)) return { replay: true, rows: [], degraded: false };
        row.signCount = device.signCount;
      }
      return { ...memory.consume(items, null), degraded: false };
    },
    async findDevice(keyId) {
      const d = devices.get(keyId);
      return d ? { ...d } : null;
    },
    async saveDevice({ keyId, publicKeyPem, environment }) {
      if (devices.has(keyId)) return { status: "exists", device: { ...devices.get(keyId) } };
      devices.set(keyId, { publicKeyPem, environment, signCount: 0 });
      return { status: "created" };
    },
    async purge() { return 0; },
  };
}

function setup({ env = {}, store = fakeStore(), clock = { t: T0 }, alerts } = {}) {
  const config = readCostControlConfig(env);
  const notified = [];
  const cc = createCostControl({
    store,
    config,
    now: () => clock.t,
    logger: silent,
    alerts: alerts ?? { notify: async (a) => notified.push(a) },
    challengeSecret: fixture.secret,
    ipHashSecret: "ip-hash-secret-for-tests",
    attestRootPem: fixture.rootPem,
  });
  const routes = {};
  cc.mountDeviceRoutes({ post: (path, ...handlers) => { routes[path] = handlers.at(-1); } }, { limiter: () => {} });
  return { cc, store, clock, notified, routes };
}

function mockRes() {
  return {
    headers: {},
    locals: {},
    statusCode: 200,
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    set(k, v) { this.setHeader(k, v); return this; },
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
  };
}

function mockReq({ path = "/api/v1/trip/stream", method = "POST", body = { destination: "Seattle" }, headers = {}, ip = "203.0.113.5" } = {}) {
  const rawBody = body === undefined ? undefined : Buffer.from(JSON.stringify(body));
  const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return { method, originalUrl: path, ip, body, rawBody, reqId: "req-1", get: (name) => lower[name.toLowerCase()] };
}

async function run(cc, kind, req) {
  const res = mockRes();
  let passed = false;
  await cc.meter(kind)(req, res, () => { passed = true; });
  return { passed, res, req };
}

// Signs like the iOS app: clientDataHash = SHA256(METHOD\nPATH\nTIME\nhex(SHA256(body))).
function deviceHeaders({ keyId, privateKeyPem, counter, req, time }) {
  const clientData = assertionClientData({ method: req.method, path: req.originalUrl, time: String(time), rawBody: req.rawBody });
  const counterBytes = Buffer.alloc(4);
  counterBytes.writeUInt32BE(counter);
  const authenticatorData = Buffer.concat([sha256(DEFAULT_APP_ID), Buffer.from([0x01]), counterBytes]);
  const nonce = sha256(Buffer.concat([authenticatorData, sha256(Buffer.from(clientData))]));
  const signature = crypto.sign("sha256", nonce, crypto.createPrivateKey(privateKeyPem));
  return {
    "X-SR-Device-Key": keyId,
    "X-SR-Device-Time": String(time),
    "X-SR-Device-Assertion": encodeCbor({ signature, authenticatorData }).toString("base64"),
  };
}

async function attest(ctx, which = "production") {
  const f = fixture[which];
  const res = mockRes();
  await ctx.routes["/api/v1/device/attest"]({ body: { keyId: f.keyId, attestation: f.attestation, challenge: f.challenge }, reqId: "r" }, res);
  return res;
}

function signedRequest(ctx, counter, opts = {}) {
  const headers = deviceHeaders({ ...fixture.production, counter, req: mockReq(opts), time: ctx.clock.t });
  return mockReq({ ...opts, headers });
}

// ── Configuration ──

test("every limit and weight has the documented default and reads from env", () => {
  const d = readCostControlConfig({});
  assert.deepEqual(d.limits.device, { plan: { day: 10, month: 40 }, parse: { day: 40 }, assist: { day: 40 }, places: { day: 40 } });
  assert.deepEqual(d.limits.ip, { plan: { day: 5 }, parse: { day: 20 }, assist: { day: 20 }, places: { day: 20 } });
  assert.deepEqual(d.costCents, { plan: 5.5, parse: 0.3, packing: 0.5, tips: 0.5, places: 3.5, photo: 0.7 });
  assert.equal(d.dailyCapCents, 2500);
  assert.equal(d.unattestedCapCents, 500);
  assert.equal(d.allowDevelopment, false);

  const c = readCostControlConfig({ DAILY_SPEND_CAP_USD: "10", IP_PLAN_DAILY_LIMIT: "2", DEVICE_PLAN_DAILY_LIMIT: "abc", COST_PLAN_CENTS: "7", APP_ATTEST_ALLOW_DEVELOPMENT: "true", COST_CONTROLS_ENABLED: "false" });
  assert.equal(c.dailyCapCents, 1000);
  assert.equal(c.limits.ip.plan.day, 2);
  assert.equal(c.limits.device.plan.day, 10);
  assert.equal(c.costCents.plan, 7);
  assert.equal(c.allowDevelopment, true);
  assert.equal(c.enabled, false);
});

// ── Unattested (per IP) ──

test("an IP without device headers gets 5 plans a day, then a 429 in the standard envelope", async () => {
  const { cc } = setup();
  for (let i = 0; i < 5; i++) {
    const { passed, res } = await run(cc, "plan", mockReq({ path: i % 2 ? "/api/v1/trip/bundle" : "/api/v1/trip/stream" }));
    assert.equal(passed, true, `plan ${i + 1}`);
    assert.equal(res.headers["x-sr-device-status"], undefined);
  }
  const { passed, res } = await run(cc, "plan", mockReq());
  assert.equal(passed, false);
  assert.equal(res.statusCode, 429);
  assert.deepEqual(res.body, {
    code: "IP_DAILY_LIMIT",
    message: "This network has used today's 5 free trip plans. They reset at midnight UTC.",
    limit: 5,
    resetAt: new Date(Date.UTC(new Date(T0).getUTCFullYear(), new Date(T0).getUTCMonth(), new Date(T0).getUTCDate() + 1)).toISOString(),
    retryable: false,
    category: "quota",
    quota: "plan",
    requestId: "req-1",
  });
  assert.ok(Number(res.headers["retry-after"]) > 0);
  // Another network is unaffected, and other categories have their own budget.
  assert.equal((await run(cc, "plan", mockReq({ ip: "198.51.100.7" }))).passed, true);
  assert.equal((await run(cc, "parse", mockReq({ ip: "203.0.113.5" }))).passed, true);
});

test("packing and travel tips share one budget", async () => {
  const { cc } = setup({ env: { IP_ASSIST_DAILY_LIMIT: "3" } });
  assert.equal((await run(cc, "packing", mockReq())).passed, true);
  assert.equal((await run(cc, "tips", mockReq())).passed, true);
  assert.equal((await run(cc, "packing", mockReq())).passed, true);
  const { res } = await run(cc, "tips", mockReq());
  assert.equal(res.body.code, "IP_DAILY_LIMIT");
  assert.match(res.body.message, /packing and safety requests/);
});

test("per-IP buckets hold an HMAC of the address, never the address", async () => {
  const { cc, store } = setup();
  await run(cc, "places", mockReq({ ip: "203.0.113.5" }));
  await run(cc, "places", mockReq({ ip: "203.0.113.5" }));
  await run(cc, "places", mockReq({ ip: "2001:db8:1:2::9" }));
  const buckets = store.calls.map((c) => c.items.find((i) => i.role === "ip-day").bucket);
  assert.equal(buckets[0], buckets[1]);
  assert.notEqual(buckets[0], buckets[2]);
  for (const b of buckets) {
    assert.match(b, /^ip:[A-Za-z0-9_-]{22}:places$/);
    assert.ok(!b.includes("203.0.113") && !b.includes("2001:db8"));
  }
  const expected = crypto.createHmac("sha256", crypto.createHmac("sha256", "ip-hash-secret-for-tests").update("sproutroute-usage-ip-v1").digest())
    .update("203.0.113.5").digest("base64url").slice(0, 22);
  assert.equal(buckets[0], `ip:${expected}:places`);
});

test("quotas reset at the next UTC day", async () => {
  const clock = { t: T0 };
  const { cc } = setup({ clock, env: { IP_PARSE_DAILY_LIMIT: "1" } });
  assert.equal((await run(cc, "parse", mockReq())).passed, true);
  assert.equal((await run(cc, "parse", mockReq())).passed, false);
  clock.t += 86_400_000;
  assert.equal((await run(cc, "parse", mockReq())).passed, true);
});

// ── Attested devices ──

test("challenge then attest registers a device; signed requests use the device quota", async () => {
  const ctx = setup({ env: { DEVICE_PLAN_DAILY_LIMIT: "3" } });
  const challengeRes = mockRes();
  ctx.routes["/api/v1/device/challenge"]({}, challengeRes);
  assert.match(challengeRes.body.challenge, /^[A-Za-z0-9_-]{54}$/);
  assert.equal(Date.parse(challengeRes.body.expiresAt) - ctx.clock.t, 600_000);

  const attested = await attest(ctx);
  assert.deepEqual(attested.body, { status: "attested" });
  assert.equal(ctx.store.devices.get(fixture.production.keyId).environment, "production");

  for (let counter = 1; counter <= 3; counter++) {
    const { passed, req, res } = await run(ctx.cc, "plan", signedRequest(ctx, counter));
    assert.equal(passed, true);
    assert.equal(req.costControl.identity, "device");
    assert.equal(res.headers["x-sr-device-status"], undefined);
  }
  const { res } = await run(ctx.cc, "plan", signedRequest(ctx, 4));
  assert.equal(res.statusCode, 429);
  assert.equal(res.body.code, "DEVICE_DAILY_LIMIT");
  assert.equal(res.body.limit, 3);
  assert.equal(ctx.store.devices.get(fixture.production.keyId).signCount, 4);
});

test("the monthly plan limit answers DEVICE_MONTHLY_LIMIT with the first of next month", async () => {
  const ctx = setup({ env: { DEVICE_PLAN_DAILY_LIMIT: "10", DEVICE_PLAN_MONTHLY_LIMIT: "2" } });
  await attest(ctx);
  assert.equal((await run(ctx.cc, "plan", signedRequest(ctx, 1))).passed, true);
  ctx.clock.t += 86_400_000; // next day, same month unless the fixture was made on the last day
  const sameMonth = new Date(ctx.clock.t).getUTCMonth() === new Date(T0).getUTCMonth();
  assert.equal((await run(ctx.cc, "plan", signedRequest(ctx, 2))).passed, true);
  const { res } = await run(ctx.cc, "plan", signedRequest(ctx, 3));
  if (sameMonth) {
    assert.equal(res.body.code, "DEVICE_MONTHLY_LIMIT");
    const d = new Date(ctx.clock.t);
    assert.equal(res.body.resetAt, new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)).toISOString());
  }
});

test("a replayed assertion is not trusted and counts against the IP, without asking to re-attest", async () => {
  const ctx = setup();
  await attest(ctx);
  const first = signedRequest(ctx, 1);
  assert.equal((await run(ctx.cc, "plan", first)).req.costControl.identity, "device");
  const replay = await run(ctx.cc, "plan", { ...first, costControl: undefined });
  assert.equal(replay.passed, true);
  assert.equal(replay.req.costControl.identity, "ip");
  assert.equal(replay.req.costControl.reason, "counter-replay");
  assert.equal(replay.res.headers["x-sr-device-status"], undefined);
});

test("a stored counter ahead of the cached one is caught by the store (stale cache)", async () => {
  const ctx = setup();
  await attest(ctx);
  await run(ctx.cc, "plan", signedRequest(ctx, 1));
  ctx.store.devices.get(fixture.production.keyId).signCount = 50; // another replica saw counter 50
  const { req } = await run(ctx.cc, "plan", signedRequest(ctx, 2));
  assert.equal(req.costControl.identity, "ip");
});

test("a bad signature, a changed body, an unknown key or malformed headers get the reattest header", async () => {
  const ctx = setup();
  await attest(ctx);

  const tampered = signedRequest(ctx, 1);
  tampered.rawBody = Buffer.from('{"destination":"Paris"}');
  const a = await run(ctx.cc, "plan", tampered);
  assert.equal(a.passed, true);
  assert.equal(a.req.costControl.identity, "ip");
  assert.equal(a.res.headers["x-sr-device-status"], "reattest");

  // The development fixture key was never attested in this setup.
  const unknownKey = mockReq({ headers: deviceHeaders({ ...fixture.development, counter: 1, req: mockReq(), time: ctx.clock.t }) });
  const b = await run(ctx.cc, "plan", unknownKey);
  assert.equal(b.req.costControl.reason, "unknown-key");
  assert.equal(b.res.headers["x-sr-device-status"], "reattest");

  const c = await run(ctx.cc, "plan", mockReq({ headers: { "X-SR-Device-Key": "nope" } }));
  assert.equal(c.res.headers["x-sr-device-status"], "reattest");
});

test("a device clock more than 5 minutes off is treated as unattested without reattest", async () => {
  const ctx = setup();
  await attest(ctx);
  const req = mockReq();
  const late = mockReq({ headers: deviceHeaders({ ...fixture.production, counter: 1, req, time: ctx.clock.t - 6 * 60_000 }) });
  const { passed, res, req: seen } = await run(ctx.cc, "plan", late);
  assert.equal(passed, true);
  assert.equal(seen.costControl.reason, "time-out-of-window");
  assert.equal(res.headers["x-sr-device-status"], undefined);
});

test("development keys are refused unless APP_ATTEST_ALLOW_DEVELOPMENT=true", async () => {
  const refused = setup();
  const res = await attest(refused, "development");
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.code, "ATTESTATION_INVALID");
  assert.equal(res.body.retryable, false);

  const allowed = setup({ env: { APP_ATTEST_ALLOW_DEVELOPMENT: "true" } });
  assert.deepEqual((await attest(allowed, "development")).body, { status: "attested" });
});

test("attest rejects a bad or expired challenge with ATTESTATION_INVALID", async () => {
  const ctx = setup();
  const f = fixture.production;
  const res = mockRes();
  await ctx.routes["/api/v1/device/attest"]({ body: { keyId: f.keyId, attestation: f.attestation, challenge: "x".repeat(54) }, reqId: "r" }, res);
  assert.equal(res.statusCode, 400);
  ctx.clock.t += 11 * 60_000;
  assert.equal((await attest(ctx)).statusCode, 400);
});

test("attesting the same key twice keeps its counter", async () => {
  const ctx = setup();
  await attest(ctx);
  await run(ctx.cc, "plan", signedRequest(ctx, 7));
  assert.deepEqual((await attest(ctx)).body, { status: "attested" });
  assert.equal(ctx.store.devices.get(fixture.production.keyId).signCount, 7);
});

// ── Spend cap ──

test("the global daily cap answers 503 DAILY_CAPACITY_REACHED and alerts once at 80% and 100%", async () => {
  const ctx = setup({ env: { DAILY_SPEND_CAP_USD: "0.11", UNATTESTED_DAILY_CAP_USD: "5" } });
  await attest(ctx);
  // 5.5 cents per plan: two fit under 11 cents, the third does not.
  assert.equal((await run(ctx.cc, "plan", signedRequest(ctx, 1))).passed, true);
  assert.equal((await run(ctx.cc, "plan", signedRequest(ctx, 2))).passed, true);
  const { res } = await run(ctx.cc, "plan", signedRequest(ctx, 3));
  assert.equal(res.statusCode, 503);
  assert.equal(res.body.code, "DAILY_CAPACITY_REACHED");
  assert.equal(res.body.message, "SproutRoute has reached today's planning capacity. Please try again tomorrow.");
  assert.equal(res.body.category, "capacity");
  assert.equal(res.body.retryable, false);
  assert.equal(res.locals.costControlRejected, true);
  await run(ctx.cc, "plan", signedRequest(ctx, 4));
  assert.deepEqual(ctx.notified.map((n) => n.kind), ["spend_cap_100"]); // 11 of 11 cents hit 100% directly
});

test("80% of the cap alerts once, before the cap is reached", async () => {
  const ctx = setup({ env: { DAILY_SPEND_CAP_USD: "0.20", IP_PLACES_DAILY_LIMIT: "100" } });
  for (let i = 0; i < 6; i++) await run(ctx.cc, "places", mockReq()); // 3.5 cents each: 17.5 at the 5th
  assert.deepEqual(ctx.notified.map((n) => n.kind), ["spend_cap_80", "spend_cap_100"]);
  assert.match(ctx.notified[0].text, /over 80% of the \$0\.20 daily cap/);
});

test("unattested traffic is held to its own smaller cap while attested devices continue", async () => {
  const ctx = setup({ env: { UNATTESTED_DAILY_CAP_USD: "0.07", IP_PLACES_DAILY_LIMIT: "100" } });
  await attest(ctx);
  assert.equal((await run(ctx.cc, "places", mockReq())).passed, true);
  assert.equal((await run(ctx.cc, "places", mockReq())).passed, true);
  assert.equal((await run(ctx.cc, "places", mockReq({ ip: "198.51.100.9" }))).res.body.code, "DAILY_CAPACITY_REACHED");
  assert.equal((await run(ctx.cc, "places", signedRequest(ctx, 1, { path: "/api/v1/places/enrich" }))).passed, true);
});

test("the photo route counts toward the cap without device headers", async () => {
  const ctx = setup({ env: { DAILY_SPEND_CAP_USD: "0.014" } });
  const photo = () => mockReq({ method: "GET", path: "/api/v1/places/photo?ref=places/a/photos/b", body: undefined });
  assert.equal((await run(ctx.cc, "photo", photo())).passed, true);
  assert.equal((await run(ctx.cc, "photo", photo())).passed, true);
  assert.equal((await run(ctx.cc, "photo", photo())).res.statusCode, 503);
  assert.deepEqual(ctx.store.calls[0].items.map((i) => i.bucket), ["global:all"]);
});

// ── Fail open ──

test("with Supabase unreachable, requests are served and limits are kept in memory", async () => {
  const store = createUsageStore({ getClient: () => { throw new Error("connect ECONNREFUSED"); }, logger: silent });
  const { cc } = setup({ store, env: { IP_PLAN_DAILY_LIMIT: "2" } });
  const first = await run(cc, "plan", mockReq());
  assert.equal(first.passed, true);
  assert.equal(first.req.costControl.degraded, true);
  assert.equal((await run(cc, "plan", mockReq())).passed, true);
  assert.equal((await run(cc, "plan", mockReq())).res.body.code, "IP_DAILY_LIMIT");
});

test("a store that hangs falls back after the timeout", async () => {
  const hang = { rpc: () => new Promise(() => {}), from: () => ({ select: () => ({ eq: () => ({ maybeSingle: () => new Promise(() => {}) }) }) }) };
  const store = createUsageStore({ getClient: () => hang, timeoutMs: 20, logger: silent });
  const { cc } = setup({ store });
  const started = Date.now();
  const { passed, req } = await run(cc, "parse", mockReq());
  assert.equal(passed, true);
  assert.equal(req.costControl.degraded, true);
  assert.ok(Date.now() - started < 500);
  // A signed request whose device cannot be looked up is unattested, and not told to re-attest.
  const signed = mockReq({ headers: deviceHeaders({ ...fixture.production, counter: 1, req: mockReq(), time: T0 }) });
  const r = await run(cc, "plan", signed);
  assert.equal(r.passed, true);
  assert.equal(r.req.costControl.reason, "store-unavailable");
  assert.equal(r.res.headers["x-sr-device-status"], undefined);
});

test("a broken store never blocks the request", async () => {
  const store = { consume: async () => { throw new Error("boom"); }, findDevice: async () => null, purge: async () => 0 };
  const { cc } = setup({ store });
  assert.equal((await run(cc, "plan", mockReq())).passed, true);
});

test("COST_CONTROLS_ENABLED=false skips metering", async () => {
  const { cc, store } = setup({ env: { COST_CONTROLS_ENABLED: "false" } });
  assert.equal((await run(cc, "plan", mockReq())).passed, true);
  assert.equal(store.calls.length, 0);
});

// ── Store adapter ──

test("the Supabase adapter sends one RPC per call and maps its rows", async () => {
  const sent = [];
  const client = {
    rpc: async (name, args) => {
      sent.push({ name, args });
      return { data: args.p_items.map((i) => ({ r_bucket: i.bucket, r_period: i.period, r_count: 3, r_cost_cents: "16.5000", r_denied: false, r_replay: false })), error: null };
    },
  };
  const store = createUsageStore({ getClient: () => client, logger: silent });
  const items = [{ bucket: "global:all", period: "2026-11-07", periodStart: "2026-11-07", incCount: 1, incCost: 5.5, limitCount: null, limitCost: 2500 }];
  const result = await store.consume(items, { keyId: "k", signCount: 9 });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].name, "usage_consume");
  assert.deepEqual(sent[0].args.p_items[0], { bucket: "global:all", period: "2026-11-07", period_start: "2026-11-07", inc_count: 1, inc_cost: 5.5, limit_count: null, limit_cost: 2500 });
  assert.equal(sent[0].args.p_device_sign_count, 9);
  assert.deepEqual(result, { replay: false, degraded: false, rows: [{ bucket: "global:all", period: "2026-11-07", count: 3, cost: 16.5, denied: false }] });

  const replayClient = { rpc: async () => ({ data: [{ r_bucket: null, r_replay: true }], error: null }) };
  assert.equal((await createUsageStore({ getClient: () => replayClient, logger: silent }).consume(items, { keyId: "k", signCount: 1 })).replay, true);
});

test("memory counters purge rows older than the cutoff", () => {
  const memory = createMemoryUsage();
  const item = (period) => ({ bucket: "global:all", period, periodStart: period, incCount: 1, incCost: 1, limitCount: null, limitCost: null });
  memory.consume([item("2026-09-01")]);
  memory.consume([item("2026-11-01")]);
  memory.purge("2026-09-28");
  assert.equal(memory.size, 1);
});
