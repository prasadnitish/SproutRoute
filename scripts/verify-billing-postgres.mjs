// Install embedded-postgres outside this checkout; pass its module file as argv[2].
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";
const { default: Postgres } = await import(
  process.argv[2] || "embedded-postgres"
);
const dir = await mkdtemp(join(tmpdir(), "sproutroute-billing-"));
const socket = createServer().listen(0, "127.0.0.1");
await new Promise((resolve) => socket.once("listening", resolve));
const port = socket.address().port;
await new Promise((resolve) => socket.close(resolve));
const db = new Postgres({
  databaseDir: dir,
  port,
  password: randomUUID(),
  autoRehydrateSymlinks: true,
});
const clients = [];
try {
  await db.initialise();
  await db.start();
  for (let i = 0; i < 4; i++) {
    const c = db.getPgClient();
    await c.connect();
    clients.push(c);
  }
  const [c] = clients;
  await c.query(
    "create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create table auth.users(id uuid primary key,is_anonymous boolean default false)",
  );
  await c.query(
    "create function public.finish_account_lifecycle(uuid,uuid,text) returns void language sql as $$ select $$",
  );
  await c.query(
    await readFile(
      new URL(
        "../src/backend/db/migrations/20261120_041_social_billing.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  const user = randomUUID();
  await c.query("insert into auth.users(id) values($1)", [user]);
  const keys = clients.map(() => randomUUID());
  const reserve = (client, id, hash = "a") =>
    client
      .query("select billing_reserve($1,$2,$3,1,3) r", [user, id, hash])
      .then((x) => x.rows[0].r);
  const batch = await Promise.all(
    clients.map((client, i) => reserve(client, keys[i])),
  );
  const index = batch.findIndex((r) => r.state === "reserved");
  assert.equal(batch.filter((r) => r.state === "limited").length, 3);
  const id = keys[index];
  assert.equal((await reserve(c, id)).state, "pending");
  assert.equal((await reserve(c, id, "b")).state, "conflict");
  const finish = (token, data, charge) =>
    c
      .query("select billing_finish($1,$2,$3,$4,$5) ok", [
        user,
        id,
        token,
        data,
        charge,
      ])
      .then((x) => x.rows[0].ok);
  assert.equal(await finish(randomUUID(), {}, true), false);
  assert.equal(await finish(batch[index].token, null, false), true);
  const retry = await reserve(c, id);
  const data = { status: "review", candidates: [{ name: "Park" }] };
  assert.equal(await finish(retry.token, data, true), true);
  assert.deepEqual((await reserve(c, id)).result, data);
  assert.equal((await reserve(c, randomUUID())).state, "limited");
  await c.query("select billing_sync($1,now(),now()+interval '1 day')", [user]);
  await c.query("select billing_sync($1,now()-interval '1 day',null)", [user]);
  const view = async () =>
    (await c.query("select billing_status($1,1,3) r", [user])).rows[0].r;
  assert.equal((await view()).remaining, 2);
  await c.query("select billing_sync($1,now(),null)", [user]);
  assert.equal((await view()).remaining, 0);
  await c.query("set role authenticated");
  await assert.rejects(reserve(c, randomUUID()), /permission denied/);
  console.log(
    "Quota concurrency, replay, settlement, entitlement ordering and privileges passed.",
  );
} finally {
  await Promise.all(clients.map((c) => c.end()));
  await db.stop();
  await rm(dir, { recursive: true, force: true });
}
