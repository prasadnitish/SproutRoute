import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";

import { createApp } from "../../src/backend/server.js";

test("ops dashboard exchanges its secret for an HttpOnly session without URL credentials", async () => {
  const previousSecret = process.env.OPS_SECRET;
  process.env.OPS_SECRET = "test-ops-secret";
  const server = http.createServer(createApp({ enableRequestLogging: false }));
  await new Promise((resolve) => server.listen(0, resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;

  try {
    const login = await fetch(`${origin}/ops`);
    assert.equal(login.status, 200);
    assert.match(await login.text(), /action="\/ops\/session"/);
    assert.match(login.headers.get("cache-control"), /no-store/);
    assert.equal(login.headers.get("referrer-policy"), "same-origin");
    const denied = await fetch(`${origin}/api/v1/ops/metrics`);
    assert.equal(denied.status, 403);
    const queryCredential = await fetch(`${origin}/ops?key=test-ops-secret`, { redirect: "manual" });
    assert.notEqual(queryCredential.status, 200);

    const exchange = await fetch(`${origin}/ops/session`, {
      method: "POST",
      redirect: "manual",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ key: "test-ops-secret" }),
    });
    assert.equal(exchange.status, 303);
    assert.equal(exchange.headers.get("location"), "/ops");
    const cookie = exchange.headers.get("set-cookie");
    assert.match(cookie, /HttpOnly/i);
    assert.match(cookie, /SameSite=Strict/i);
    assert.equal(cookie.includes("test-ops-secret"), false);

    const dashboard = await fetch(`${origin}/ops`, { headers: { Cookie: cookie } });
    const html = await dashboard.text();
    assert.equal(dashboard.status, 200);
    assert.equal(html.includes("URLSearchParams(window.location.search)"), false);
    assert.equal(html.includes("?key=YOUR_OPS_SECRET"), false);
    assert.equal(dashboard.headers.get("referrer-policy"), "no-referrer");
  } finally {
    await new Promise((resolve) => server.close(resolve));
    if (previousSecret === undefined) delete process.env.OPS_SECRET;
    else process.env.OPS_SECRET = previousSecret;
  }
});
