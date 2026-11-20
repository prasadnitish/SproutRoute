import test from "node:test";
import assert from "node:assert/strict";

// Auth middleware depends on Supabase env vars. When SUPABASE_URL and
// SUPABASE_ANON_KEY are not set, resolveUser always returns null, which
// lets us test the requireAuth → 401 and optionalAuth → null paths
// without needing a real Supabase instance.

// Save and clear env to ensure clean state
const savedUrl = process.env.SUPABASE_URL;
const savedKey = process.env.SUPABASE_ANON_KEY;

test.beforeEach(() => {
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_ANON_KEY;
});

test.afterEach(() => {
  if (savedUrl) process.env.SUPABASE_URL = savedUrl;
  else delete process.env.SUPABASE_URL;
  if (savedKey) process.env.SUPABASE_ANON_KEY = savedKey;
  else delete process.env.SUPABASE_ANON_KEY;
});

// Dynamic import so module-level env reads pick up cleared vars
async function loadAuth() {
  // Use cache-busting query to get fresh module evaluation each time
  const mod = await import(
    `../../src/backend/middleware/auth.js?bust=${Date.now()}-${Math.random()}`
  );
  return mod;
}

function createMockRes() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

// ── requireAuth tests ─────────────────────────────────────────────────────────

test("requireAuth with no Authorization header returns 401", async () => {
  const { requireAuth } = await loadAuth();
  const req = { headers: {} };
  const res = createMockRes();
  let nextCalled = false;

  await new Promise((resolve) => {
    requireAuth(req, res, () => {
      nextCalled = true;
      resolve();
    });
    // requireAuth is async (promise-based), give it a tick
    setTimeout(resolve, 50);
  });

  assert.equal(res.statusCode, 401);
  assert.equal(nextCalled, false, "next() should not be called without auth");
  assert.ok(res.body.error, "should return an error message");
});

test("requireAuth with invalid token returns 401", async () => {
  const { requireAuth } = await loadAuth();
  const req = { headers: { authorization: "Bearer invalid-token-xyz" } };
  const res = createMockRes();
  let nextCalled = false;

  await new Promise((resolve) => {
    requireAuth(req, res, () => {
      nextCalled = true;
      resolve();
    });
    setTimeout(resolve, 50);
  });

  // Without SUPABASE_URL set, resolveUser returns null → 401
  assert.equal(res.statusCode, 401);
  assert.equal(nextCalled, false, "next() should not be called with invalid token");
});

// ── optionalAuth tests ────────────────────────────────────────────────────────

test("optionalAuth with no header sets req.user to null and calls next", async () => {
  const { optionalAuth } = await loadAuth();
  const req = { headers: {} };
  const res = createMockRes();
  let nextCalled = false;

  await new Promise((resolve) => {
    optionalAuth(req, res, () => {
      nextCalled = true;
      resolve();
    });
    setTimeout(resolve, 50);
  });

  assert.equal(nextCalled, true, "next() must be called for optionalAuth");
  assert.equal(req.user, null, "req.user should be null when no auth header");
});

// ── Export verification ───────────────────────────────────────────────────────

test("auth middleware functions can be imported", async () => {
  const mod = await loadAuth();
  assert.equal(typeof mod.requireAuth, "function", "requireAuth should be a function");
  assert.equal(typeof mod.optionalAuth, "function", "optionalAuth should be a function");
});

test("native session verification accepts the first-party audience and excludes delegated library credentials", async t => {
  const { createServer } = await import("node:http");
  const { token, owner } = await import("../helpers/libraryOAuth.js");
  let verifications = 0;
  const provider = createServer((_req, res) => {
    verifications++;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ id: owner, is_anonymous: false }));
  }).listen(0, "127.0.0.1");
  await new Promise(resolve => provider.once("listening", resolve));
  t.after(() => { provider.closeAllConnections(); provider.close(); });
  process.env.SUPABASE_URL = "http://127.0.0.1:" + provider.address().port;
  process.env.SUPABASE_ANON_KEY = "test-public-key";
  const { requireAuth } = await loadAuth();
  async function verify(claims) {
    const req = { headers: { authorization: "Bearer " + token(claims) } };
    return new Promise(resolve => {
      requireAuth(req, { status() { return this; }, json() { resolve(null); } }, () => resolve(req.user));
    });
  }
  assert.equal((await verify({ client_id: undefined, aud: "authenticated", role: "authenticated" })).id, owner);
  assert.equal(await verify({}), null);
  assert.equal(await verify({ aud: "authenticated" }), null);
  assert.equal(verifications, 1);
});
