import test from "node:test";
import { oauthDeps, owner, token } from "../helpers/libraryOAuth.js";
import assert from "node:assert/strict";
import { summarizeUnitCosts } from "../../src/backend/services/unitCosts.js";
import { tracing } from "../../src/backend/services/tracing.js";
import { createApp } from "../../src/backend/server.js";

const pass = (_req, _res, next) => next();
async function start(t, deps = {}) {
  const app = createApp({
    enableRequestLogging: false,
    socialSave: {
      limiter: pass,
      aiLimiter: pass,
      meter: () => pass,
      billing: {preview:true},
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
            const inserted = !saved.some(other => other.id === row.id);
            if (inserted) saved.push(row);
            return { error: null, select: () => ({data: inserted ? [{id:row.id}] : [], error:null}) };
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
  await rpc("tools/call", {
    name: "save_place_from_url", arguments: {source: "https://example.org/post", requestId},
  });
  assert.equal(analyses, 1);
  const { queuedLink } = summarizeUnitCosts(tracing.snapshot());
  assert.equal(queuedLink.units, 1);
  assert.equal(queuedLink.usdPerUnit, 0);
});

test("billing enforces account allowance on REST before model execution", async (t) => {
  let calls=0;
  const url=await start(t,{
    authenticate(req,res,next){req.user={id:owner};next();},
    billing:{enabled:true, rpc:async(name,args)=>{
      assert.equal(args.owner_id,owner);
      if(name==='billing_status') return {remaining:0};
      assert.equal(name,'billing_reserve'); return {state:'limited'};
    }},
    extract:async()=>{calls++;return {candidates:[]};},
  });
  const status=await fetch(url+'/billing');
  assert.equal(status.status,200);
  assert.equal((await status.json()).remaining,0);
  const response=await fetch(url+'/extract',{method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({source:'https://example.org',requestId:'05410ab1-9f3a-46bd-b09e-00c5fa2a4c0b'})});
  assert.equal(response.status,429);
  assert.equal((await response.json()).code,'EXTRACTION_LIMIT_REACHED');
  assert.equal(calls,0);
});

test("RevenueCat webhook requires its own secret and mirrors verified accounts on transfer", async t=>{
  const accounts=[];
  const url=await start(t,{billing:{enabled:true,webhookHeader:'Bearer private-fixture',sync:async user=>accounts.push(user)}});
  const hook=url.replace('/social-save','/billing/revenuecat');
  const post=authorization=>fetch(hook,{method:'POST',headers:{authorization,'content-type':'application/json'},
    body:JSON.stringify({event:{type:'TRANSFER',environment:'SANDBOX',transferred_from:[owner],transferred_to:['$RCAnonymousID:test','5b1faf9c-2de9-4f12-9357-6a6c597b5d72']}})});
  assert.equal((await post('Bearer wrong')).status,401);
  assert.equal(accounts.length,0);
  assert.equal((await post('Bearer private-fixture')).status,200);
  assert.equal(accounts.length,2);
});

test("purchase refresh verifies only the signed-in user and returns current allowance",async t=>{
  const verified=[];
  const url=await start(t,{authenticate(req,res,next){req.user={id:owner};next();},
    billing:{enabled:true,sync:async id=>verified.push(id),rpc:async()=>({plan:'premium'})}});
  const response=await fetch(url+'/billing/refresh',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({userId:'other'})});
  assert.equal(response.status,200);
  assert.equal((await response.json()).plan,'premium');
  assert.deepEqual(verified,[owner]);
});
