/**
 * fetchWithRetry tests — Phase 2, Feature 1
 *
 * Written BEFORE implementation (TDD Red).
 * Guards against the two CRITICAL bugs from the UX audit:
 *   #2: response.json() on non-JSON 502 body → SyntaxError crash
 *   #3: no retry on transient failures (429, 502, 503)
 *
 * This module tests the refactored api.js fetch layer.
 * Since api.js runs in the browser, we test the exported utility
 * functions via a Node-compatible re-export from api.node.js.
 *
 * Pattern: inline mock of global.fetch (same as geocoding.test.js).
 */

import test from "node:test";
import assert from "node:assert/strict";

// We'll import the utility functions once api.node.js exists.
// For now, inline the functions under test to drive the API contract.
import {
  parseSafeResponse,
  fetchWithRetry,
  HTTP_STATUS_MESSAGES,
} from "../../src/backend/utils/fetchUtils.js";

// ── parseSafeResponse ─────────────────────────────────────────────────────

test("parseSafeResponse returns parsed JSON on ok=true", async () => {
  const mockResponse = {
    ok: true,
    status: 200,
    headers: { get: () => "application/json" },
    json: async () => ({ result: "ok" }),
    text: async () => '{"result":"ok"}',
  };

  const result = await parseSafeResponse(mockResponse);
  assert.deepStrictEqual(result, { result: "ok" });
});

test("parseSafeResponse handles 502 HTML body without crashing", async () => {
  const mockResponse = {
    ok: false,
    status: 502,
    headers: { get: () => "text/html" },
    json: async () => {
      throw new SyntaxError("Unexpected token < in JSON at position 0");
    },
    text: async () => "<html><body>Bad Gateway</body></html>",
  };

  // Should throw an Error with human message, NOT a SyntaxError
  await assert.rejects(
    () => parseSafeResponse(mockResponse),
    (err) => {
      assert.ok(
        !(err instanceof SyntaxError),
        "Must not propagate SyntaxError — UI would crash",
      );
      assert.ok(
        err.message.includes("temporarily unavailable") ||
          err.message.includes("Server") ||
          err.message.includes("unavailable"),
        `Error message must be user-friendly — got: "${err.message}"`,
      );
      assert.strictEqual(err.status, 502);
      assert.strictEqual(err.retryable, true);
      return true;
    },
  );
});

test("parseSafeResponse handles 429 with retryable=true", async () => {
  const mockResponse = {
    ok: false,
    status: 429,
    headers: {
      get: (name) => (name === "RateLimit-Reset" ? "1748000000" : null),
    },
    json: async () => ({ error: "Too many requests" }),
    text: async () => '{"error":"Too many requests"}',
  };

  await assert.rejects(
    () => parseSafeResponse(mockResponse),
    (err) => {
      assert.strictEqual(err.retryable, true);
      assert.ok(
        err.message.toLowerCase().includes("too many") ||
          err.message.toLowerCase().includes("wait") ||
          err.message.toLowerCase().includes("try again"),
        `429 message must tell user to wait — got: "${err.message}"`,
      );
      return true;
    },
  );
});

test("parseSafeResponse handles 400 with retryable=false", async () => {
  const mockResponse = {
    ok: false,
    status: 400,
    headers: { get: () => null },
    json: async () => ({ error: "Destination query is required." }),
    text: async () => '{"error":"Destination query is required."}',
  };

  await assert.rejects(
    () => parseSafeResponse(mockResponse),
    (err) => {
      assert.strictEqual(
        err.retryable,
        false,
        "400 validation errors must NOT be retryable",
      );
      return true;
    },
  );
});

test("parseSafeResponse handles 503 with retryable=true", async () => {
  const mockResponse = {
    ok: false,
    status: 503,
    headers: { get: () => null },
    json: async () => {
      throw new SyntaxError("not JSON");
    },
    text: async () => "Service Unavailable",
  };

  await assert.rejects(
    () => parseSafeResponse(mockResponse),
    (err) => {
      assert.strictEqual(err.retryable, true);
      assert.ok(
        err.message.toLowerCase().includes("unavailable") ||
          err.message.toLowerCase().includes("try again"),
        `503 message must be user-friendly — got: "${err.message}"`,
      );
      return true;
    },
  );
});

// ── HTTP_STATUS_MESSAGES ──────────────────────────────────────────────────

test("HTTP_STATUS_MESSAGES covers 429, 502, 503", () => {
  assert.ok(HTTP_STATUS_MESSAGES[429], "Must have message for 429");
  assert.ok(HTTP_STATUS_MESSAGES[502], "Must have message for 502");
  assert.ok(HTTP_STATUS_MESSAGES[503], "Must have message for 503");
  // Messages must be user-facing (no developer jargon)
  for (const [code, msg] of Object.entries(HTTP_STATUS_MESSAGES)) {
    assert.ok(
      !msg.toLowerCase().includes("undefined"),
      `Status ${code} message must not contain 'undefined'`,
    );
    assert.ok(
      msg.length > 10,
      `Status ${code} message must be descriptive (>10 chars)`,
    );
  }
});

// ── fetchWithRetry ────────────────────────────────────────────────────────

test("fetchWithRetry succeeds on first attempt for ok response", async () => {
  let callCount = 0;
  const mockFetch = async () => {
    callCount++;
    return {
      ok: true,
      status: 200,
      headers: { get: () => "application/json" },
      json: async () => ({ data: "success" }),
      text: async () => '{"data":"success"}',
    };
  };

  const result = await fetchWithRetry(
    "https://example.com/api",
    {},
    { maxRetries: 2, retryableStatuses: [429, 502, 503], fetchFn: mockFetch },
  );

  assert.deepStrictEqual(result, { data: "success" });
  assert.strictEqual(callCount, 1, "Should only call fetch once on success");
});

test("fetchWithRetry retries on 503 and succeeds on second attempt", async () => {
  let callCount = 0;
  const mockFetch = async () => {
    callCount++;
    if (callCount === 1) {
      return {
        ok: false,
        status: 503,
        headers: { get: () => null },
        json: async () => { throw new SyntaxError("not JSON"); },
        text: async () => "Service Unavailable",
      };
    }
    return {
      ok: true,
      status: 200,
      headers: { get: () => "application/json" },
      json: async () => ({ data: "recovered" }),
      text: async () => '{"data":"recovered"}',
    };
  };

  const result = await fetchWithRetry(
    "https://example.com/api",
    {},
    {
      maxRetries: 2,
      retryableStatuses: [429, 502, 503],
      fetchFn: mockFetch,
      baseDelayMs: 0, // no delay in tests
    },
  );

  assert.deepStrictEqual(result, { data: "recovered" });
  assert.strictEqual(callCount, 2, "Should have retried once");
});

test("fetchWithRetry does NOT retry on 400", async () => {
  let callCount = 0;
  const mockFetch = async () => {
    callCount++;
    return {
      ok: false,
      status: 400,
      headers: { get: () => null },
      json: async () => ({ error: "Bad request" }),
      text: async () => '{"error":"Bad request"}',
    };
  };

  await assert.rejects(
    () =>
      fetchWithRetry("https://example.com/api", {}, {
        maxRetries: 2,
        retryableStatuses: [429, 502, 503],
        fetchFn: mockFetch,
        baseDelayMs: 0,
      }),
    (err) => {
      assert.strictEqual(
        callCount,
        1,
        "Must not retry on 400 — got call count: " + callCount,
      );
      assert.strictEqual(err.retryable, false);
      return true;
    },
  );
});

test("fetchWithRetry exhausts retries and throws last error", async () => {
  let callCount = 0;
  const mockFetch = async () => {
    callCount++;
    return {
      ok: false,
      status: 502,
      headers: { get: () => null },
      json: async () => { throw new SyntaxError("not JSON"); },
      text: async () => "<html>Bad Gateway</html>",
    };
  };

  await assert.rejects(
    () =>
      fetchWithRetry("https://example.com/api", {}, {
        maxRetries: 2,
        retryableStatuses: [429, 502, 503],
        fetchFn: mockFetch,
        baseDelayMs: 0,
      }),
    (err) => {
      assert.strictEqual(callCount, 3, `Should try 1 + 2 retries = 3 — got: ${callCount}`);
      assert.strictEqual(err.retryable, true);
      return true;
    },
  );
});

test("fetchWithRetry on 429 reads RateLimit-Reset header", async () => {
  const resetTime = Math.floor(Date.now() / 1000) + 60;
  const mockFetch = async () => ({
    ok: false,
    status: 429,
    headers: {
      get: (name) =>
        name === "RateLimit-Reset" ? String(resetTime) : null,
    },
    json: async () => ({ error: "rate limited" }),
    text: async () => '{"error":"rate limited"}',
  });

  await assert.rejects(
    () =>
      fetchWithRetry("https://example.com/api", {}, {
        maxRetries: 0, // don't retry, just verify error shape
        retryableStatuses: [429, 502, 503],
        fetchFn: mockFetch,
        baseDelayMs: 0,
      }),
    (err) => {
      assert.strictEqual(err.status, 429);
      assert.strictEqual(err.retryable, true);
      // rateLimitReset should be surfaced on the error
      assert.ok(
        err.rateLimitReset !== undefined,
        `Error should expose rateLimitReset for countdown UI — got: ${JSON.stringify(err)}`,
      );
      return true;
    },
  );
});
