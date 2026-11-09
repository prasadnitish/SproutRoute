import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";

import { createApp } from "../../src/backend/server.js";

// Guessing OPS_SECRET must cost the same on every route that accepts it: the session form and the
// header or Bearer path on the ops APIs. One budget of 5 failed attempts per IP per 15 minutes.

function opsDeps() {
  return {
    enableRequestLogging: false,
    metricsService: { recordRequest() {}, getSnapshot: async () => ({ ok: true }) },
  };
}

async function withOps(fn) {
  const previous = process.env.OPS_SECRET;
  process.env.OPS_SECRET = "ops-secret";
  const server = http.createServer(createApp(opsDeps()));
  await new Promise((resolve) => server.listen(0, resolve));
  try {
    return await fn(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    if (previous === undefined) delete process.env.OPS_SECRET;
    else process.env.OPS_SECRET = previous;
  }
}

const guess = (base, path, headers) => fetch(`${base}${path}`, { headers });
const sessionGuess = (base, key) => fetch(`${base}/ops/session`, {
  method: "POST",
  redirect: "manual",
  headers: { "content-type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({ key }),
});

test("wrong x-ops-secret guesses on the metrics API are cut off after five", async () => {
  await withOps(async (base) => {
    const statuses = [];
    for (let attempt = 0; attempt < 8; attempt += 1) {
      statuses.push((await guess(base, "/api/v1/ops/metrics", { "x-ops-secret": `wrong-${attempt}` })).status);
    }
    assert.deepEqual(statuses, [403, 403, 403, 403, 403, 429, 429, 429]);
  });
});

test("wrong Bearer guesses are throttled the same way, on the traces API too", async () => {
  await withOps(async (base) => {
    let last;
    for (let attempt = 0; attempt < 6; attempt += 1) {
      last = await guess(base, "/api/v1/ops/traces", { authorization: `Bearer wrong-${attempt}` });
    }
    assert.equal(last.status, 429);
  });
});

test("the session form and the ops APIs draw on one failed-attempt budget", async () => {
  await withOps(async (base) => {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      assert.equal((await sessionGuess(base, "wrong-secret")).status, 403);
    }
    for (let attempt = 0; attempt < 2; attempt += 1) {
      assert.equal((await guess(base, "/api/v1/ops/metrics", { "x-ops-secret": "wrong-secret" })).status, 403);
    }
    assert.equal((await guess(base, "/api/v1/ops/metrics", { "x-ops-secret": "wrong-secret" })).status, 429);
    assert.equal((await sessionGuess(base, "wrong-secret")).status, 429);
  });
});

test("successful requests do not count against the limit", async () => {
  await withOps(async (base) => {
    for (let attempt = 0; attempt < 12; attempt += 1) {
      assert.equal((await guess(base, "/api/v1/ops/metrics", { "x-ops-secret": "ops-secret" })).status, 200);
    }
  });
});
