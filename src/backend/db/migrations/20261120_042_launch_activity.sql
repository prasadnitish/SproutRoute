begin;

-- Only the latest save date is needed to count an account once per UTC day.
-- Erasing the account removes this row. The historical metrics contain counts only.
create table public.launch_trip_savers (
  user_id uuid primary key references auth.users(id) on delete cascade,
  latest_day date not null
);
alter table public.launch_trip_savers enable row level security;
revoke all on public.launch_trip_savers from public, anon, authenticated;

create function public.count_launch_save() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  stamp timestamptz;
  first_today boolean;
begin
  if tg_table_name = 'account_trips' then
    -- Serialize concurrent saves across the UTC day boundary before reading the clock.
    perform pg_advisory_xact_lock(hashtextextended(new.user_id::text, 42));
    stamp := clock_timestamp();
    insert into public.launch_trip_savers(user_id, latest_day)
    values (new.user_id, (stamp at time zone 'UTC')::date)
    on conflict (user_id) do update set latest_day=excluded.latest_day
      where public.launch_trip_savers.latest_day < excluded.latest_day;
    first_today := found;
    insert into public.trip_metrics(event_type, created_at, timing_json)
      values ('account_trip_saved',stamp,jsonb_build_object('firstAccountSaveToday',first_today));
  else
    insert into public.trip_metrics(event_type) values ('social_place_saved');
  end if;
  return null;
end;
$$;
revoke all on function public.count_launch_save() from public, anon, authenticated;
create trigger count_account_trip_save after insert on public.account_trips
  for each row execute function public.count_launch_save();
create trigger count_social_place_save after insert on public.social_places
  for each row execute function public.count_launch_save();

-- Billing finalization is atomic with the stored result. Cached retries and account
-- merges cannot charge again; only the first false-to-true transition gets a receipt.
create function public.count_finished_extraction() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.trip_metrics(event_type, timing_json)
    values ('social_extraction_finished', jsonb_build_object('facts',
      case when jsonb_typeof(new.result->'groundedFactCount')='number'
           and (new.result->>'groundedFactCount') ~ '^[0-9]{1,2}$'
           then (new.result->>'groundedFactCount')::int end));
  return null;
end;
$$;
revoke all on function public.count_finished_extraction() from public, anon, authenticated;
create trigger count_finished_extraction after update of charged on public.billing_extractions
  for each row when (new.charged and not old.charged)
  execute function public.count_finished_extraction();

insert into public.trip_metrics(event_type) values ('launch_save_coverage_start');
commit;
