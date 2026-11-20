import test from "node:test";
import { oauthDeps, owner, token } from "../helpers/libraryOAuth.js";
import assert from "node:assert/strict";
import { createApp } from "../../src/backend/server.js";

const pass = (_req, _res, next) => next();
async function start(t, deps = {}) {
  const app = createApp({
    enableRequestLogging: false,
    socialSave: {
      limiter: pass,
      aiLimiter: pass,
      meter: () => pass,
      ...deps,
    },
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => {
    server.closeAllConnections();
    server.close();
  });
  return "http://127.0.0.1:" + server.address().port + "/api/v1/social-save";
}
test("library routes and private MCP require a user session", async (t) => {
  const url = await start(t);
  for (const [method, path] of [
    ["GET", "places"],
    ["GET", "inbox"],
    ["POST", "extract"],
    ["POST", "mcp"],
    ["DELETE", "account"],
  ]) {
    assert.equal((await fetch(url + "/" + path, { method })).status, 401);
  }
});
test("anonymous Supabase accounts cannot enter a library", async (t) => {
  const url = await start(t, {
    authenticate: (req, res, next) => {
      req.user = { id: "guest", isAnonymous: true };
      next();
    },
  });
  assert.equal((await fetch(url + "/places")).status, 403);
});
test("authenticated extract uses shared service and private responses", async (t) => {
  const url = await start(t, {
    authenticate: (req, res, next) => {
      req.user = { id: "person" };
      next();
    },
  });
  const response = await fetch(url + "/extract", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ source: "https://example.org/post" }),
  });
  assert.equal(response.status, 200);
  assert.match(response.headers.get("cache-control"), /no-store/);
  assert.equal((await response.json()).status, "needs_evidence");
});
test("signed-in MCP advertises only personal tools and accepts idempotent inbox submissions", async (t) => {
  const saved = [];
  let analyses = 0;
  let storedExtraction = null;
  const url = await start(t, {
    ...oauthDeps,
    extract: async () => {
      analyses += 1;
      return { status: "review", origin: "supplied", candidates: [] };
    },
    connectorDatabase: () => ({
      from(name) {
        assert.equal(name, "social_inbox");
        return {
          select() {
            const query = {
              eq() {
                return query;
              },
              single() {
                return { data: { ...saved[0], extraction: storedExtraction } };
              },
            };
            return query;
          },
          update({ extraction }) {
            storedExtraction = extraction;
            const query = {
              eq() {
                return query;
              },
              error: null,
            };
            return query;
          },
          upsert(row, options) {
            assert.deepEqual(options, {
              onConflict: "user_id,id",
              ignoreDuplicates: true,
            });
            saved.push(row);
            return { error: null };
          },
        };
      },
    }),
  });
  async function rpc(method, params) {
    const r = await fetch(url + "/mcp", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        authorization: "Bearer " + token({}),
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    });
    assert.equal(r.status, 200);
    const data = await r.text();
    return JSON.parse(
      data
        .split("\n")
        .find((x) => x.startsWith("data: "))
        ?.slice(6) ?? data,
    ).result;
  }
  assert.deepEqual(
    (await rpc("tools/list", {})).tools.map((x) => x.name).sort(),
    ["list_saved_places", "list_saved_trips", "save_place_from_url"],
  );
  const requestId = "ab14e692-41d4-475b-b386-af1c8874cc52";
  await rpc("tools/call", {
    name: "save_place_from_url",
    arguments: { source: "https://example.org/post", requestId },
  });
  assert.deepEqual(saved, [
    {
      user_id: owner,
      id: requestId,
      source: "https://example.org/post",
      text: "",
    },
  ]);
  for (let attempt = 0; attempt < 2; attempt++) {
    const preview = await rpc("tools/call", {
      name: "save_place_from_url",
      arguments: {
        source: "https://example.org/post",
        requestId,
        extractNow: true,
      },
    });
    assert.equal(JSON.parse(preview.content[0].text).status, "review");
  }
  assert.equal(analyses, 1);
});
