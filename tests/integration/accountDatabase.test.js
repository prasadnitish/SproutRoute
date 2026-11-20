import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

const migrations = new URL("../../src/backend/db/migrations/", import.meta.url);

test("V3 account migrations enforce owner isolation, anonymous limits and erasure in Postgres", async t => {
  const db = new PGlite();
  t.after(() => db.close());
  // Supabase owns these roles and auth functions in production.
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    create role supabase_auth_admin;
    create role authenticator;
    create schema auth;
    create table auth.users (id uuid primary key, email text, is_anonymous boolean default false);
    create table auth.identities(user_id uuid references auth.users on delete cascade, provider text, provider_id text);
    grant usage on schema auth to authenticated;
    create function auth.uid() returns uuid language sql stable as $$
      select current_setting('request.jwt.claim.sub', true)::uuid
    $$;
    create function auth.jwt() returns jsonb language sql stable as $$
      select current_setting('request.jwt.claims',true)::jsonb
    $$;
  `);
  // Install the application's original account/profile tables and FKs first.
  const files = (await readdir(migrations)).sort();
  const relevant = files.filter(file => /^20260329_0(0[1-9]|1[0-9]|20|22|23)_|^20261120_/.test(file));
  for (const file of relevant) await db.exec(await readFile(new URL(file, migrations), "utf8"));

  // New Supabase projects can have default Data API grants disabled.
  const connectorPrivileges = await db.query(`
    select has_table_privilege('service_role', 'public.social_places', 'select')
       and has_table_privilege('service_role', 'public.social_inbox', 'insert')
       and has_table_privilege('service_role', 'public.social_inbox', 'update')
       and has_table_privilege('service_role', 'public.social_inbox', 'select')
       and has_table_privilege('service_role', 'public.account_trips', 'select') as ready
  `);
  assert.equal(connectorPrivileges.rows[0].ready, true);

  const first = randomUUID(), second = randomUUID(), trip = randomUUID();
  for (const id of [first, second]) {
    await db.query("insert into auth.users(id) values ($1)", [id]);
    await db.query("insert into public.users(id,email) values ($1,$2)", [id, id + "@example.org"]);
  }
  async function login(id, anonymous = false) {
    await db.exec("set role authenticated");
    await db.query("select set_config('request.jwt.claim.sub',$1,false), set_config('request.jwt.claims',$2,false)",
      [id, JSON.stringify({sub:id,is_anonymous:anonymous})]);
  }
  const insertTrip = "insert into public.account_trips(user_id,id,destination,snapshot) values ($1,$2,'Seattle',$3)";
  const snapshot = JSON.stringify({schemaVersion:1,tripData:{trip:{destination:"Seattle"}}});
  await login(first);
  await db.query(insertTrip, [first,trip,snapshot]);
  await login(second);
  assert.deepEqual((await db.query("select id from account_trips")).rows, []);
  assert.deepEqual((await db.query("delete from account_trips returning id")).rows, []);
  await assert.rejects(db.query(insertTrip, [first,randomUUID(),snapshot]), {code:"42501"});
  // Identical trip IDs can legitimately exist in two accounts.
  await db.query(insertTrip, [second,trip,snapshot]);
  await login(first, true);
  assert.deepEqual((await db.query("select id from account_trips")).rows, []);
  await assert.rejects(db.query(insertTrip,[first,randomUUID(),snapshot]), {code:"42501"});

  await login(second);
  const merge = "select public.finish_account_lifecycle($1::uuid,$2::uuid,null)";
  await assert.rejects(db.query(merge, [first, second]), {code:"42501"});
  await db.exec("reset role");
  const third = randomUUID();
  await db.query("insert into auth.users(id,email) values ($1,$2)", [third, "third@example.org"]);
  await db.query("insert into public.users(id,email) values ($1,$2)", [third, "third@example.org"]);
  await db.query(insertTrip, [third,trip,JSON.stringify({schemaVersion:1,tripData:{trip:{destination:"London"}}})]);
  const sourceProfile = randomUUID(), activeProfile = randomUUID(), requestId = randomUUID();
  await db.query("insert into public.profiles(id,user_id) values ($1,$2),($3,$4)",[sourceProfile,third,activeProfile,second]);
  await db.query("insert into profile_revisions(profile_id,version,change_source,profile_json) values($1,1,'user_edit','{}')",[sourceProfile]);
  await db.query("insert into profile_imports(user_id,raw_import_text) values($1,'family preferences')",[third]);
  await db.query("insert into trip_requests(id,user_id,raw_input,parsed_trip_json) values($1,$2,'family trip','{}')",[requestId,third]);
  await db.query("insert into trip_feedback(user_id,trip_request_id,signal_type) values($1,$2,'more_like_this')",[third,requestId]);
  await db.query(`insert into social_places(user_id,"placeId",name,destination,source,category,evidence,tip,family,locked)
    values($1,'real-map-id','Park','Seattle','https://example.org/source','attraction','source note','','',true),
          ($2,'real-map-id','Park','Seattle','https://example.org/dest','attraction','destination note','','',false)`,[third,second]);
  await db.query(`insert into group_trip_documents(id,invite_code,trip_json,owner_key,invite_generation,invite_expires_at,expires_at)
    values('account-hub','invite-a','{}',$1,gen_random_uuid(),now(),now()),('guest-hub','invite-b','{}','guest:opaque',gen_random_uuid(),now(),now())`,['user:'+third]);
  await db.query("insert into auth.identities(user_id,provider,provider_id) values($1,'apple','verified-apple-subject')",[third]);
  await db.exec("set role service_role");
  await assert.rejects(db.query(merge, [third, second]), /Apple identity changed/);
  await db.exec("reset role");
  // Simulate a failure after all data moves. The DB must roll back the entire merge.
  await db.exec(`create function public.fail_delete_fixture() returns trigger language plpgsql as $$
    begin raise exception 'simulated deletion failure'; end $$;
    create trigger fail_delete_fixture before delete on auth.users for each row execute function public.fail_delete_fixture();`);
  const verifiedMerge = "select public.finish_account_lifecycle($1::uuid,$2::uuid,'verified-apple-subject')";
  await db.exec("set role service_role");
  await assert.rejects(db.query(verifiedMerge,[third,second]),/simulated deletion failure/);
  await db.exec("reset role; drop trigger fail_delete_fixture on auth.users;");
  assert.deepEqual((await db.query("select user_id from trip_requests where id=$1",[requestId])).rows,[{user_id:third}]);
  assert.equal((await db.query("select * from social_inbox")).rows.length,0);
  await db.exec("set role service_role");
  const consumed = randomUUID();
  const claim = await db.query("select billing_reserve($1,$2,'hash',3,30) r",[third,consumed]);
  await db.query("select billing_finish($1,$2,$3,'{}',true)",[third,consumed,claim.rows[0].r.token]);
  await db.query(verifiedMerge, [third, second]);
  assert.equal((await db.query("select billing_status($1,3,30) r",[second])).rows[0].r.used,1);
  await db.exec("reset role");
  assert.equal((await db.query("select id from auth.users where id=$1",[third])).rows.length, 0);
  assert.equal((await db.query("select id from account_trips where user_id=$1",[second])).rows.length, 2);
  assert.deepEqual((await db.query("select id from profiles where user_id=$1 order by version desc",[second])).rows,
    [{id:activeProfile},{id:sourceProfile}]);
  assert.deepEqual((await db.query("select user_id from trip_feedback where trip_request_id=$1",[requestId])).rows,[{user_id:second}]);
  assert.deepEqual((await db.query("select user_id from profile_imports")).rows,[{user_id:second}]);
  assert.deepEqual((await db.query("select profile_id from profile_revisions")).rows,[{profile_id:sourceProfile}]);
  assert.deepEqual((await db.query('select user_id,"placeId",locked,evidence from social_places')).rows,
    [{user_id:second,placeId:"real-map-id",locked:true,evidence:"destination note"}]);
  const inbox = (await db.query('select user_id,source,extraction from social_inbox')).rows;
  assert.equal(inbox.length,1);
  assert.equal(inbox[0].user_id,second);
  assert.equal(inbox[0].source,"https://example.org/source");
  assert.equal(inbox[0].extraction.candidates[0].placeId,"real-map-id");
  assert.equal(inbox[0].extraction.candidates[0].evidence,"source note");
  assert.deepEqual((await db.query("select account_owner_id from group_trip_documents where id='account-hub'")).rows,[{account_owner_id:second}]);
  await db.query("insert into public.profiles(user_id) values ($1)", [first]);
  await db.query("delete from auth.users where id=$1", [first]);
  assert.deepEqual((await db.query("select distinct user_id from account_trips")).rows, [{user_id:second}]);
  assert.deepEqual((await db.query("select user_id from profiles where user_id=$1",[first])).rows, []);
  await db.exec("set role service_role");
  await db.query(merge,[second,null]);
  await db.exec("reset role");
  for (const table of ["account_trips","social_places","social_inbox","profiles","profile_revisions",
    "profile_imports","trip_requests","trip_feedback","users","billing_entitlements","billing_extractions"]) {
    assert.deepEqual((await db.query("select * from public."+table)).rows,[],table);
  }
  assert.deepEqual((await db.query("select id from group_trip_documents")).rows,[{id:"guest-hub"}]);
  await assert.rejects(db.query(`insert into group_trip_documents(id,invite_code,trip_json,owner_key,invite_generation,invite_expires_at,expires_at)
    values('late','invite-c','{}',$1,gen_random_uuid(),now(),now())`,['user:'+second]), {code:"23503"});
});
