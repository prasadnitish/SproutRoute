import test from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../../src/backend/server.js";
import { tracing } from "../../src/backend/services/tracing.js";
test("ops trace endpoint requires secret and validation errors are retained", async () => {
  const old = process.env.OPS_SECRET;
  process.env.OPS_SECRET = "integration-only-secret";
  const app = createApp({ enableRequestLogging: false });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal((await fetch(base + "/api/v1/ops/traces")).status, 403);
    const response = await fetch(base + "/api/v1/trip/stream", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Journey-Id": "a".repeat(32),
      },
      body: JSON.stringify({
        destination: "Seattle",
        startDate: "invalid",
        endDate: "invalid",
      }),
    });
    await response.text();
    await new Promise((r) => setImmediate(r));
    const traces = tracing.snapshot();
    const t = traces.findLast((t) => t.meta.journey_id === "a".repeat(32));
    assert.ok(t);
    assert.equal(t.spans[0].status, "error");
    assert.equal(t.meta.complete, true);
    const admin = await fetch(base + "/api/v1/ops/traces", {
      headers: { "x-ops-secret": process.env.OPS_SECRET },
    });
    assert.equal(admin.status, 200);
    assert.equal(admin.headers.get("cache-control"), "no-store");
    const raw = JSON.stringify(await admin.json());
    assert.ok(!raw.includes("integration-only-secret"));
    assert.ok(!raw.includes("Seattle"));
  } finally {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
    if (old === undefined) delete process.env.OPS_SECRET;
    else process.env.OPS_SECRET = old;
  }
});
