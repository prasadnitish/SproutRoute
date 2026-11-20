import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createApp } from "../../src/backend/server.js";

import {
  owner,
  token,
  path,
  origin,
  issuer,
  pairs,
  oauthDeps,
} from "../helpers/libraryOAuth.js";

test("connector discovers its trusted issuer and validates signed audience, grants and identity before any query", async (t) => {
  const queried = [];
  const app = createApp({
    enableRequestLogging: false,
    socialSave: {
      ...oauthDeps,
      connectorDatabase: () => ({
        from(name) {
          const chain = {
            select() {
              return chain;
            },
            eq(column, value) {
              queried.push([name, column, value]);
              return chain;
            },
            order() {
              return chain;
            },
            limit() {
              return { data: [] };
            },
          };
          return chain;
        },
      }),
    },
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => {
    server.closeAllConnections();
    server.close();
  });
  const url = "http://127.0.0.1:" + server.address().port;
  async function call(bearer, name = "list_saved_trips") {
    return fetch(url + path, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        ...(bearer && { authorization: "Bearer " + bearer }),
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name, arguments: {} },
      }),
    });
  }
  const metadataPath = "/.well-known/oauth-protected-resource" + path;
  const metadata = await fetch(url + metadataPath);
  assert.equal(metadata.status, 200);
  assert.deepEqual((await metadata.json()).authorization_servers, [issuer]);
  const challenge = await call();
  assert.equal(challenge.status, 401);
  assert.ok(
    challenge.headers.get("www-authenticate").includes(origin + metadataPath),
  );
  for (const invalid of [
    token({}, pairs[1]),
    token({ aud: "authenticated" }),
    token({ iss: "https://other.example" }),
    token({ exp: Math.floor(Date.now() / 1000) + 7200 }),
    token({ iat: undefined }),
    token({ client_id: randomUUID() }),
    token({ client_id: undefined }),
    token({ exp: 1 }),
    token({ is_anonymous: true }),
    token({ sub: "invalid" }),
    token({ role: "authenticated" }),
  ])
    assert.equal((await call(invalid)).status, 401);
  assert.equal((await call(token({ scope: "email" }))).status, 403);
  assert.equal(
    (await call(token({ sproutroute_permissions: [] }))).status,
    403,
  );
  assert.equal(
    (
      await call(
        token({ sproutroute_permissions: ["library:read"] }),
        "save_place_from_url",
      )
    ).status,
    403,
  );
  assert.deepEqual(queried, []);
  const unsupported = await fetch(url + path, {
    headers: { authorization: "Bearer " + token({}) },
  });
  assert.equal(unsupported.status, 405);
  assert.equal(unsupported.headers.get("allow"), "POST");
  const result = await call(token({}));
  assert.equal(result.status, 200);
  assert.match(await result.text(), /trips/);
  assert.deepEqual(queried, [["account_trips", "user_id", owner]]);
});
