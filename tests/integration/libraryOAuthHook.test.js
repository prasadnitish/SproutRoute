import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";

test("staging token hook preserves native claims and limits connector issuance and refresh", async t => {
  const db = new PGlite();
  t.after(() => db.close());
  const doc = await readFile(new URL("../../docs/MCP_ACCOUNT_LINKING.md", import.meta.url), "utf8");
  const clientId = randomUUID();
  const resource = "https://staging.example/api/v1/social-save/mcp";
  const sql = doc.match(/\x60\x60\x60sql\n([\s\S]+?)\n\x60\x60\x60/)[1]
    .replace("STAGING_CLAUDE_CLIENT_UUID", clientId)
    .replace("https://STAGING-APP-HOST/api/v1/social-save/mcp", resource);
  await db.exec("create role anon; create role authenticated; create role supabase_auth_admin;");
  await db.exec(sql);
  const native = { aud:"authenticated", sub:randomUUID(), is_anonymous:false, email:"owner@example.org" };
  async function issue(claims, method) {
    const result = await db.query("select public.sproutroute_mcp_claims($1::jsonb) as event", [
      JSON.stringify({ claims, authentication_method:method }),
    ]);
    return result.rows[0].event.claims;
  }
  await db.exec("set role authenticated");
  await assert.rejects(issue(native, "otp"), { code:"42501" });
  await db.exec("reset role; set role supabase_auth_admin");
  assert.deepEqual(await issue(native, "otp"), native);
  const delegated = { ...native, client_id:clientId, scope:"openid", user_metadata:{ private:true } };
  for (const method of ["oauth_provider/authorization_code", "token_refresh"]) {
    const claims = await issue(delegated, method);
    assert.equal(claims.sub, native.sub);
    assert.equal(claims.aud, resource);
    assert.equal(claims.role, "sproutroute_mcp");
    assert.equal(claims.email, "");
    assert.equal(claims.user_metadata, undefined);
    assert.deepEqual(claims.sproutroute_permissions, ["library:read", "library:write"]);
  }
  for (const bad of [{ client_id:randomUUID() }, { is_anonymous:true }, { scope:"profile" }]) {
    await assert.rejects(issue({ ...delegated, ...bad }, "token_refresh"), { code:"P0001" });
  }
});
