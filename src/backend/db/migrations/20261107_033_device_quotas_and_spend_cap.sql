-- 033: App Attest devices, usage counters, and the global daily spend cap.
-- Server-only tables: RLS on with no policies, browser roles have no access, only service_role
-- (the Express server) reads and writes them. Apply before deploying the matching backend code;
-- until then the server logs "cost-control:store-unavailable" and enforces limits in memory.
-- Safe to re-run.

-- One row per App Attest key (one per app install). key_id is the base64 key identifier
-- DCAppAttestService returns, which is SHA256 of the public key. No Apple ID or user identity.
create table if not exists public.app_attest_devices (
  key_id text primary key check (key_id ~ '^[A-Za-z0-9+/]{43}=$'),
  public_key text not null check (public_key like '-----BEGIN PUBLIC KEY-----%'),
  sign_count bigint not null default 0 check (sign_count >= 0),
  environment text not null check (environment in ('production', 'development')),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
alter table public.app_attest_devices enable row level security;
revoke all on public.app_attest_devices from public, anon, authenticated;
grant select, insert, update, delete on public.app_attest_devices to service_role;
create index if not exists app_attest_devices_last_seen_idx on public.app_attest_devices (last_seen_at);

-- Counters keyed by (bucket, period). Buckets look like device:<keyId>:plan, ip:<hmac>:plan,
-- global:all, global:unattested. period is a UTC day (2026-11-07) or month (2026-11).
-- ip buckets hold an HMAC of the client IP, never the address itself.
create table if not exists public.usage_counters (
  bucket text not null check (char_length(bucket) between 1 and 120),
  period text not null check (period ~ '^\d{4}-\d{2}(-\d{2})?$'),
  period_start date not null,
  request_count integer not null default 0 check (request_count >= 0),
  cost_cents numeric(12, 4) not null default 0 check (cost_cents >= 0),
  updated_at timestamptz not null default now(),
  primary key (bucket, period)
);
alter table public.usage_counters enable row level security;
revoke all on public.usage_counters from public, anon, authenticated;
grant select, insert, update, delete on public.usage_counters to service_role;
create index if not exists usage_counters_period_start_idx on public.usage_counters (period_start);

-- Check every limit, then increment every counter, or none of them, in one call.
-- p_items: [{bucket, period, period_start, inc_count, inc_cost, limit_count|null, limit_cost|null}]
-- When p_device_key_id is given, the assertion counter is advanced first; if the stored counter is
-- already >= p_device_sign_count (a replayed assertion), nothing is counted and one row with
-- r_replay = true comes back. Otherwise one row per item: the new values when allowed, or the
-- current values with r_denied marking each limit that would be exceeded.
-- SECURITY INVOKER (the default): it runs with the caller's rights, and only service_role may call it.
create or replace function public.usage_consume(
  p_items jsonb,
  p_device_key_id text default null,
  p_device_sign_count bigint default null
)
returns table (
  r_bucket text,
  r_period text,
  r_count integer,
  r_cost_cents numeric,
  r_denied boolean,
  r_replay boolean
)
language plpgsql
set search_path = ''
as $$
declare
  v_denied boolean;
begin
  if p_device_key_id is not null then
    update public.app_attest_devices d
       set sign_count = p_device_sign_count, last_seen_at = now()
     where d.key_id = p_device_key_id
       and d.sign_count < p_device_sign_count;
    if not found then
      return query select null::text, null::text, null::integer, null::numeric, false, true;
      return;
    end if;
  end if;

  insert into public.usage_counters (bucket, period, period_start)
  select i.bucket, i.period, i.period_start
    from jsonb_to_recordset(p_items) as i(bucket text, period text, period_start date)
   order by i.bucket, i.period
  on conflict (bucket, period) do nothing;

  -- Lock in a fixed order so concurrent calls touching the same buckets cannot deadlock.
  perform 1
     from public.usage_counters c
     join jsonb_to_recordset(p_items) as i(bucket text, period text)
       on c.bucket = i.bucket and c.period = i.period
    order by c.bucket, c.period
      for update of c;

  select coalesce(bool_or(
           (i.limit_count is not null and c.request_count + i.inc_count > i.limit_count)
        or (i.limit_cost is not null and c.cost_cents + i.inc_cost > i.limit_cost)), false)
    into v_denied
    from public.usage_counters c
    join jsonb_to_recordset(p_items) as i(bucket text, period text, inc_count integer, inc_cost numeric,
                                          limit_count integer, limit_cost numeric)
      on c.bucket = i.bucket and c.period = i.period;

  if v_denied then
    return query
      select c.bucket, c.period, c.request_count, c.cost_cents,
             (i.limit_count is not null and c.request_count + i.inc_count > i.limit_count)
          or (i.limit_cost is not null and c.cost_cents + i.inc_cost > i.limit_cost),
             false
        from public.usage_counters c
        join jsonb_to_recordset(p_items) as i(bucket text, period text, inc_count integer, inc_cost numeric,
                                              limit_count integer, limit_cost numeric)
          on c.bucket = i.bucket and c.period = i.period;
  else
    return query
      update public.usage_counters c
         set request_count = c.request_count + i.inc_count,
             cost_cents = c.cost_cents + i.inc_cost,
             updated_at = now()
        from jsonb_to_recordset(p_items) as i(bucket text, period text, inc_count integer, inc_cost numeric)
       where c.bucket = i.bucket and c.period = i.period
      returning c.bucket, c.period, c.request_count, c.cost_cents, false, false;
  end if;
end;
$$;

-- Deletes counter rows whose period began more than p_keep_days ago (about 40 days) and devices
-- not seen for p_device_keep_days. The server calls it at most every few hours.
create or replace function public.usage_purge(p_keep_days integer default 40, p_device_keep_days integer default 400)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_counters integer;
  v_devices integer;
begin
  delete from public.usage_counters
   where period_start < (now() at time zone 'utc')::date - p_keep_days;
  get diagnostics v_counters = row_count;
  delete from public.app_attest_devices
   where last_seen_at < now() - make_interval(days => p_device_keep_days);
  get diagnostics v_devices = row_count;
  return v_counters + v_devices;
end;
$$;

revoke execute on function public.usage_consume(jsonb, text, bigint) from public, anon, authenticated;
revoke execute on function public.usage_purge(integer, integer) from public, anon, authenticated;
grant execute on function public.usage_consume(jsonb, text, bigint) to service_role;
grant execute on function public.usage_purge(integer, integer) to service_role;
