begin;

create table public.billing_entitlements (
  user_id uuid primary key references auth.users(id) on delete cascade,
  observed_at timestamptz not null,
  premium_until timestamptz
);
create table public.billing_extractions (
  user_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null,
  input_hash text not null,
  period_start date not null,
  token uuid not null,
  lease_until timestamptz not null,
  result jsonb,
  charged boolean not null default false,
  primary key(user_id,request_id)
);
create index billing_period on public.billing_extractions(user_id,period_start);
alter table public.billing_entitlements enable row level security;
alter table public.billing_extractions enable row level security;
revoke all on public.billing_entitlements,public.billing_extractions from public,anon,authenticated;
grant select, insert, update, delete on public.billing_entitlements,public.billing_extractions to service_role;

create function public.billing_status(owner_id uuid,free_limit int,premium_limit int)
returns jsonb language sql stable set search_path='' as $$
  with period as (select date_trunc('month', now() at time zone 'UTC') as start),
  allowance as (select exists(select 1 from public.billing_entitlements
    where user_id=owner_id and premium_until>now()) as premium),
  usage as (select count(*) filter(where charged) as used,
    count(*) filter(where result is null and lease_until>now()) as pending
    from public.billing_extractions,period where user_id=owner_id and period_start=start::date)
  select jsonb_build_object('plan',case when premium then 'premium' else 'free' end,
    'freeLimit',free_limit,'premiumLimit',premium_limit,
    'limit',case when premium then premium_limit else free_limit end,'used',used,
    'remaining',greatest(0,(case when premium then premium_limit else free_limit end)-used-pending),
    'resetsAt',(start+interval '1 month') at time zone 'UTC') from allowance,usage,period
$$;

create function public.billing_reserve(owner_id uuid,operation_id uuid,fingerprint text,free_limit int,premium_limit int)
returns jsonb language plpgsql set search_path='' as $$
declare previous public.billing_extractions%rowtype; lease uuid := gen_random_uuid();
begin
  perform pg_advisory_xact_lock(hashtextextended(owner_id::text,0));
  select * into previous from public.billing_extractions where user_id=owner_id and request_id=operation_id;
  if found then
    if previous.input_hash <> fingerprint then return '{"state":"conflict"}'; end if;
    if previous.result is not null then return jsonb_build_object('state','cached','result',previous.result); end if;
    if previous.lease_until>now() then return '{"state":"pending"}'; end if;
  end if;
  if (public.billing_status(owner_id,free_limit,premium_limit)->>'remaining')::int <= 0 then
    return '{"state":"limited"}';
  end if;
  insert into public.billing_extractions(user_id,request_id,input_hash,period_start,token,lease_until)
    values(owner_id,operation_id,fingerprint,date_trunc('month',now() at time zone 'UTC')::date,lease,now()+interval '10 minutes')
    on conflict(user_id,request_id) do update set token=excluded.token,lease_until=excluded.lease_until,period_start=excluded.period_start;
  return jsonb_build_object('state','reserved','token',lease);
end; $$;

create function public.billing_finish(owner_id uuid,operation_id uuid,lease_token uuid,output jsonb,consume boolean)
returns boolean language plpgsql set search_path='' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(owner_id::text,0));
  update public.billing_extractions set result=output, charged=(consume and output is not null),lease_until=now()
    where user_id=owner_id and request_id=operation_id and token=lease_token and result is null
    and (output is null or lease_until>now());
  return found;
end; $$;

-- A deleted account's delayed webhook must not resurrect it. Provider snapshot time
-- fences overlapping webhooks and reconciliation, independent of delivery order.
create function public.billing_sync(owner_id uuid,observed timestamptz,expires timestamptz)
returns void language plpgsql set search_path='' as $$
begin
  insert into public.billing_entitlements(user_id,observed_at,premium_until)
    values(owner_id,observed,expires)
    on conflict(user_id) do update set observed_at=excluded.observed_at,premium_until=excluded.premium_until
    where excluded.observed_at>public.billing_entitlements.observed_at;
exception when foreign_key_violation then return;
end; $$;
revoke all on function public.billing_status(uuid,int,int),public.billing_reserve(uuid,uuid,text,int,int),
  public.billing_finish(uuid,uuid,uuid,jsonb,boolean),public.billing_sync(uuid,timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function public.billing_status(uuid,int,int),public.billing_reserve(uuid,uuid,text,int,int),
  public.billing_finish(uuid,uuid,uuid,jsonb,boolean),public.billing_sync(uuid,timestamptz,timestamptz) to service_role;
-- Keep the account-lifecycle proof checks, Apple revocation contract and data
-- transfer together. Entitlements must be restored through RevenueCat after merge.
alter function public.finish_account_lifecycle(uuid,uuid,text) rename to finish_account_library;
revoke all on function public.finish_account_library(uuid,uuid,text) from service_role;
create function public.finish_account_lifecycle(source_id uuid,destination_id uuid,apple_subject text)
returns void language plpgsql security definer set search_path='' as $$
declare account_id uuid;
begin
  for account_id in select distinct id from unnest(array[source_id,destination_id]) as ids(id)
    where id is not null order by id loop
    perform pg_advisory_xact_lock(hashtextextended(account_id::text,0));
  end loop;
  if destination_id is not null then
    if exists(select 1 from public.billing_extractions
        where user_id=source_id and result is null and lease_until>now()) then
      raise exception 'Extraction is still in progress; retry the account merge';
    end if;
    update public.billing_extractions s set user_id=destination_id,
      request_id=case when exists(select 1 from public.billing_extractions d
        where d.user_id=destination_id and d.request_id=s.request_id)
        then gen_random_uuid() else s.request_id end where s.user_id=source_id;
  end if;
  perform public.finish_account_library(source_id,destination_id,apple_subject);
end; $$;
revoke all on function public.finish_account_lifecycle(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.finish_account_lifecycle(uuid,uuid,text) to service_role;
commit;
