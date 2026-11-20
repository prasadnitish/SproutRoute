import test from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../../src/backend/server.js";

const issuedAt = Math.floor(Date.now() / 1000);

function token(id, method = "otp", age = 0, extra = {}) {
  const payload = {
    sub: id,
    amr: [{ method, timestamp: issuedAt - age }],
    ...extra,
  };
  return (
    "header." +
    Buffer.from(JSON.stringify(payload)).toString("base64url") +
    ".signature"
  );
}
async function setup(t, overrides = {}) {
  const calls = [];
  const verified = new Map(
    ["destination", "source"].map((id) => [
      token(id),
      { id, identities: [{ provider: "email" }] },
    ]),
  );
  const pass = (_req, _res, next) => next();
  const app = createApp({
    enableRequestLogging: false,
    socialSave: {
      limiter: pass,
      authenticate: (req, _res, next) => {
        req.user = { id: "destination" };
        next();
      },
      accountLifecycle: {
        verify: async (jwt) => verified.get(jwt),
        finish: async (...args) => calls.push(args),
        ...overrides,
      },
    },
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => {
    server.closeAllConnections();
    server.close();
  });
  return {
    calls,
    verified,
    send: (path, body, jwt = token("destination")) =>
      fetch(
        "http://127.0.0.1:" +
          server.address().port +
          "/api/v1/social-save/account" +
          path,
        {
          method: path ? "POST" : "DELETE",
          headers: {
            authorization: "Bearer " + jwt,
            "content-type": "application/json",
          },
          body: JSON.stringify(body),
        },
      ),
  };
}
test("deletion accepts a recently verified email without Apple credentials", async (t) => {
  const { calls, send } = await setup(t);
  assert.equal((await send("", { manualAppleRevocation: false })).status, 200);
  assert.deepEqual(calls, [["destination", null, null]]);
});
test("merge requires confirmation, a distinct verified source and two recent first-party sessions", async (t) => {
  const { calls, send, verified } = await setup(t);
  const body = { sourceAccessToken: token("source"), confirm: true };
  assert.equal((await send("/merge", { ...body, confirm: false })).status, 422);
  assert.equal(
    (await send("/merge", { ...body, sourceAccessToken: "unknown" })).status,
    403,
  );
  assert.equal(
    (await send("/merge", { ...body, sourceAccessToken: token("destination") }))
      .status,
    409,
  );
  for (const jwt of [
    token("source", "oauth", 320),
    token("source", "otp", 0, { client_id: "connector" }),
    token("source", "token_refresh"),
  ]) {
    verified.set(jwt, { id: "source", identities: [] });
    assert.equal(
      (await send("/merge", { ...body, sourceAccessToken: jwt })).status,
      403,
    );
  }
  assert.equal(
    (await send("/merge", body, token("destination", "otp", 450))).status,
    403,
  );
  assert.equal(calls.length, 0);
  assert.equal((await send("/merge", body)).status, 200);
  assert.deepEqual(calls, [["source", "destination", null]]);
});
test("Apple-linked deletion checks subject and revocation before deleting", async (t) => {
  const apple = {
    id: "destination",
    identities: [
      { provider: "apple", identity_data: { sub: "apple-subject" } },
    ],
  };
  const attempts = [];
  const { calls, send, verified } = await setup(t, {
    revokeApple: async (body, sub) => {
      attempts.push([body.appleAuthorizationCode, sub]);
      if (body.appleAuthorizationCode === "fail") throw Error("sensitive");
    },
  });
  verified.set(token("destination"), apple);
  assert.equal((await send("", {})).status, 403);
  assert.equal(
    (await send("", { appleAuthorizationCode: "fail", appleClientId: "app" }))
      .status,
    503,
  );
  assert.equal(calls.length, 0);
  assert.equal(
    (await send("", { appleAuthorizationCode: "good", appleClientId: "app" }))
      .status,
    200,
  );
  assert.deepEqual(attempts, [
    ["fail", "apple-subject"],
    ["good", "apple-subject"],
  ]);
  assert.deepEqual(calls, [["destination", null, "apple-subject"]]);
});

test("users can explicitly choose manual Apple revocation when credentials are unavailable", async (t) => {
  const { calls, verified, send } = await setup(t, {
    revokeApple: () => assert.fail("no Apple code available"),
  });
  verified.set(token("destination"), {
    id: "destination",
    identities: [{ provider: "apple", identity_data: { sub: "apple-id" } }],
  });
  const response = await send("", { manualAppleRevocation: true });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    ok: true,
    manualAppleRevocation: true,
  });
  assert.deepEqual(calls, [["destination", null, "apple-id"]]);
});
