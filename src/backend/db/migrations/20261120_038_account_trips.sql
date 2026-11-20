begin;
create table public.account_trips (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id uuid not null,
  destination text not null check (length(destination) between 1 and 240),
  snapshot jsonb not null check (
    jsonb_typeof(snapshot) = 'object' and snapshot @> '{"schemaVersion":1}'
    and snapshot ? 'tripData' and jsonb_typeof(snapshot->'tripData') = 'object'
    and octet_length(snapshot::text) <= 200000
  ),
  updated_at timestamptz not null default now(),
  primary key(user_id, id)
);
create index account_trips_recent on public.account_trips(user_id, updated_at desc, id);
alter table public.account_trips enable row level security;
revoke all on public.account_trips from public, anon, authenticated;
grant select, insert, update, delete on public.account_trips to authenticated;
grant select on public.account_trips to service_role;
create policy own_registered_trips on public.account_trips to authenticated
 using (user_id = (select auth.uid()) and (select auth.jwt()->>'is_anonymous') is distinct from 'true')
 with check (user_id = (select auth.uid()) and (select auth.jwt()->>'is_anonymous') is distinct from 'true');
commit;
