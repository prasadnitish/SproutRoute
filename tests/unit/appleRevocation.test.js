import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { revokeAppleAuthorization } from "../../src/backend/services/appleRevocation.js";

test("exchanges the code and revokes only a signed token for the exact linked Apple subject and client", async () => {
  const account = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const apple = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const env = {
    APPLE_WEB_CLIENT_ID: "web",
    APPLE_WEB_REDIRECT_URI: "https://example.org/apple",
    APPLE_KEY_ID: "test",
    APPLE_TEAM_ID: "team",
    APPLE_PRIVATE_KEY: account.privateKey
      .export({ format: "pem", type: "pkcs8" })
      .toString(),
  };
  const encode = (data) =>
    Buffer.from(JSON.stringify(data)).toString("base64url");
  const payload =
    encode({ alg: "RS256", kid: "key" }) +
    "." +
    encode({
      sub: "apple-123",
      iss: "https://appleid.apple.com",
      exp: Date.now() / 1000 + 60,
      aud: "web",
    });
  const jwt =
    payload +
    "." +
    sign("sha256", Buffer.from(payload), apple.privateKey).toString(
      "base64url",
    );
  let calls = [],
    signature = jwt;
  const request = async (url, options) => {
    calls.push(url);
    assert.equal(options.redirect, "error");
    if (url.endsWith("/auth/keys"))
      return Response.json({
        keys: [{ ...apple.publicKey.export({ format: "jwk" }), kid: "key" }],
      });
    assert.equal(options.body.get("client_id"), "web");
    if (url.endsWith("/auth/token")) {
      assert.equal(
        options.body.get("redirect_uri"),
        env.APPLE_WEB_REDIRECT_URI,
      );
      assert.equal(options.body.get("code"), "one-time-code");
      return Response.json({ id_token: signature, refresh_token: "refresh" });
    }
    assert.equal(options.body.get("token"), "refresh");
    return new Response(null, { status: 200 });
  };
  const revoke = (sub, client = "web") =>
    revokeAppleAuthorization(
      { appleClientId: client, appleAuthorizationCode: "one-time-code" },
      sub,
      { env, request },
    );
  await assert.rejects(revoke("apple-123", "attacker"));
  assert.equal(calls.length, 0);
  await assert.rejects(revoke("some-second-apple-account"));
  assert.deepEqual(
    calls.map((c) => new URL(c).pathname),
    ["/auth/token"],
  );
  calls = [];
  signature = payload + ".bad";
  await assert.rejects(revoke("apple-123"));
  assert.ok(!calls.some((c) => c.endsWith("/revoke")));
  calls = [];
  signature = jwt;
  await revoke("apple-123");
  assert.deepEqual(
    calls.map((c) => new URL(c).pathname),
    ["/auth/token", "/auth/keys", "/auth/revoke"],
  );
});
