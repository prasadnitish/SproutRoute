import test from "node:test";
import assert from "node:assert/strict";
import * as guard from "../../src/frontend/src/services/oauthConsent.js";

test("only registered HTTPS callback paths receive OAuth results", () => {
  const expected = "https://host.example/callback";
  const redirected = expected + "?code=123&state=abc";
  assert.equal(guard.trustedCallback(redirected, [expected]), redirected);
  for (const bad of [
    expected + "/other?code=1",
    "https://host.example.evil/callback?code=1",
    "http://host.example/callback?code=1",
    expected + "?next=elsewhere",
    expected + "?code=1#token",
  ])
    assert.throws(() => guard.trustedCallback(bad, [expected]));
});
