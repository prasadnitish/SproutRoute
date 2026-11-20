import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

const sql = async path => readFile(new URL("../../" + path, import.meta.url), "utf8");
test("daily totals survive edits and deletion, skip retries, and preserve unavailable coverage", async t => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`
    create role anon; create role authenticated; create schema auth;
    create table auth.users(id uuid primary key);
    create table account_trips(user_id uuid, id text primary key);
    create table social_places(user_id uuid, id text primary key);
    create table billing_extractions(charged boolean, result jsonb);
    create table trip_shares(created_at timestamptz);
    create table group_trip_documents(created_at timestamptz);
    create table usage_counters(period_start date, bucket text, period text, request_count int);
  `);
  await db.exec(await sql("src/backend/db/migrations/20260329_019_create_trip_metrics.sql"));
  await db.exec("insert into trip_metrics(event_type,created_at) values ('trip',now()-interval '1 day')");
  const query = await sql("scripts/sql/launch-daily.sql");
  const owner = "00000000-0000-4000-8000-000000000001";
  const report = async () => (await db.query(query)).rows.at(-1);
  assert.equal((await report()).accounts_saving_trips, null);
  await db.exec(await sql("src/backend/db/migrations/20261120_042_launch_activity.sql"));
  assert.equal((await report()).saved_trips_created, 0);
  await db.query("insert into auth.users values ($1)", [owner]);
  await db.query("insert into account_trips values ($1,'a'),($1,'b')", [owner]);
  await db.query("insert into account_trips values ($1,'a') on conflict(id) do update set id=excluded.id", [owner]);
  await db.query("insert into social_places values ($1,'p')", [owner]);
  await db.exec("delete from social_places; delete from account_trips; delete from auth.users");
  await db.exec(`insert into billing_extractions values (false,null),(false,'{}');
    update billing_extractions set charged=true,result='{"candidates":[{}],"groundedFactCount":2}' where result is null;
    update billing_extractions set result=result;`);
  const result = await report();
  assert.deepEqual(["accounts_saving_trips","saved_trips_created","saved_places_created",
    "successful_social_extractions","extracted_grounded_facts"].map(k => Number(result[k])), [1,2,1,1,2]);
  await db.exec("begin; insert into billing_extractions values(false,null); update billing_extractions set charged=true,result='{}' where result is null; rollback");
  assert.equal(Number((await report()).successful_social_extractions), 1);
  await db.exec("update billing_extractions set charged=true,result='{}' where charged=false");
  assert.equal((await report()).extracted_grounded_facts, null);
  assert.equal((await db.query(query)).rows[0].accounts_saving_trips, null);
  assert.equal((await db.query("select count(*) n from launch_trip_savers")).rows[0].n, 0);
  const denied = await db.query("select has_table_privilege('authenticated','launch_trip_savers','select') as visible");
  assert.equal(denied.rows[0].visible, false);
});
