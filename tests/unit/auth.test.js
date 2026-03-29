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
