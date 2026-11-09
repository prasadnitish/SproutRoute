import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";

import { createApp } from "../../src/backend/server.js";

// End to end: the per-IP limiter must count the visitor Cloudflare reports, but only for requests that
// prove they came through Cloudflare. The ops secret limiter (5 failed guesses) is the observable.

const ORIGIN_SECRET = "origin-secret-".padEnd(48, "z");

async function withApp(fn) {
  const saved = { ops: process.env.OPS_SECRET, origin: process.env.CF_ORIGIN_SECRET };
  process.env.OPS_SECRET = "ops-secret-for-tests";
  process.env.CF_ORIGIN_SECRET = ORIGIN_SECRET;
  const server = http.createServer(createApp({ enableRequestLogging: false }));
  await new Promise((resolve) => server.listen(0, resolve));
  try {
    return await fn(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    for (const [key, value] of [["OPS_SECRET", saved.ops], ["CF_ORIGIN_SECRET", saved.origin]]) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

const wrongGuess = (base, headers) => fetch(`${base}/api/v1/ops/metrics`, { headers: { "x-ops-secret": "wrong", ...headers } });
const viaCloudflare = (ip) => ({ "cf-connecting-ip": ip, "x-origin-secret": ORIGIN_SECRET });

test("each visitor Cloudflare reports gets their own failed-attempt budget", async () => {
  await withApp(async (base) => {
    const first = [];
    for (let attempt = 0; attempt < 6; attempt += 1) first.push((await wrongGuess(base, viaCloudflare("203.0.113.1"))).status);
    assert.deepEqual(first, [403, 403, 403, 403, 403, 429]);

    // A different visitor is not locked out by the first one's failures.
    assert.equal((await wrongGuess(base, viaCloudflare("203.0.113.2"))).status, 403);
  });
});

test("a direct caller cannot dodge the limit by rotating CF-Connecting-IP without the secret", async () => {
  await withApp(async (base) => {
    const statuses = [];
    for (let attempt = 0; attempt < 7; attempt += 1) {
      statuses.push((await wrongGuess(base, { "cf-connecting-ip": `203.0.113.${attempt + 10}` })).status);
    }
    assert.deepEqual(statuses, [403, 403, 403, 403, 403, 429, 429]);
  });
});

test("a forged secret does not help either", async () => {
  await withApp(async (base) => {
    let last;
    for (let attempt = 0; attempt < 6; attempt += 1) {
      last = await wrongGuess(base, { "cf-connecting-ip": `203.0.113.${attempt + 30}`, "x-origin-secret": "guess".padEnd(48, "z") });
    }
    assert.equal(last.status, 429);
  });
});
