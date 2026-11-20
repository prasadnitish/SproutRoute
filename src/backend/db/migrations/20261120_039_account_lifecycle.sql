begin;
-- Owner records use the auth UUID. Reconcile any historical orphan before applying.
alter table public.users add constraint users_auth_owner_fk
  foreign key (id) references auth.users(id) on delete cascade;
alter table public.trip_requests drop constraint fk_trips_user,
  add constraint fk_trips_user foreign key (user_id) references public.users(id) on delete cascade;
alter table public.trip_feedback drop constraint trip_feedback_trip_owner_fkey,
  add constraint trip_feedback_trip_owner_fkey foreign key (trip_request_id, user_id)
  references public.trip_requests(id, user_id) on update cascade on delete cascade;

-- The legacy Trip Hub also supports guest keys. Tie only registered-owner
-- keys to auth so a concurrent create cannot survive account erasure.
alter table public.group_trip_documents add column account_owner_id uuid
  generated always as (case when owner_key like 'user:%'
    then substring(owner_key from 6)::uuid else null end) stored
  references auth.users(id) on delete cascade;
create index group_trip_documents_account_owner on public.group_trip_documents(account_owner_id)
  where account_owner_id is not null;

create function public.finish_account_lifecycle(source_id uuid, destination_id uuid, apple_subject text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  locked_count integer;
  max_version integer;
  previous_active uuid;
begin
  if source_id is null or source_id = destination_id then
    raise exception 'Invalid account selection';
  end if;
  -- Stable order serializes opposite-direction merges. Foreign key locks also
  -- serialize inserts into account-owned tables against deletion of the source.
  perform 1 from auth.users where id in (source_id,destination_id) order by id for update;
  get diagnostics locked_count = row_count;
  if locked_count <> (case when destination_id is null then 1 else 2 end) then
    raise exception 'Account no longer exists';
  end if;
  if exists(select 1 from auth.users where id in (source_id,destination_id) and is_anonymous) then
    raise exception 'Registered account required';
  end if;
  -- Re-check the verified user's provider membership inside the transaction.
  if exists(select 1 from auth.identities where user_id=source_id and provider='apple'
      and provider_id is distinct from apple_subject) then
    raise exception 'Apple identity changed';
  end if;
  perform 1 from public.users where id in (source_id,destination_id) order by id for update;

  if destination_id is not null then
    insert into public.users(id,email)
      select id,coalesce(email,id::text || '@placeholder.local') from auth.users where id=destination_id
      on conflict(id) do nothing;

    select id, version into previous_active, max_version from public.profiles
      where user_id=destination_id order by version desc limit 1;
    update public.profiles set user_id=destination_id, version=version+coalesce(max_version,0)
      where user_id=source_id;
    if found and previous_active is not null then
      update public.profiles set version=1+(select max(version) from public.profiles where user_id=destination_id)
        where id=previous_active;
    end if;
    update public.profile_imports set user_id=destination_id where user_id=source_id;
    update public.trip_requests set user_id=destination_id where user_id=source_id;
    update public.group_trip_documents set owner_key='user:' || destination_id where owner_key='user:' || source_id;

    -- Preserve divergent records even when both clients independently used the same ID.
    delete from public.account_trips s using public.account_trips d
      where s.user_id=source_id and d.user_id=destination_id and s.id=d.id
        and s.snapshot=d.snapshot and s.destination=d.destination;
    update public.account_trips s set user_id=destination_id,
      id=case when exists(select 1 from public.account_trips d where d.user_id=destination_id and d.id=s.id)
        then gen_random_uuid() else s.id end where s.user_id=source_id;

    -- An Apple place ID names a real location. Keep the destination copy and
    -- put differing source details in the normal review inbox with their real ID.
    insert into public.social_inbox(user_id,id,source,text,extraction)
      select destination_id, gen_random_uuid(), s.source,
        concat_ws(E'\n', s.name, nullif(s.evidence,''), nullif(s.tip,''), nullif(s.family,'')),
        jsonb_build_object('status','review','origin','supplied','candidates',
          jsonb_build_array(to_jsonb(s)-'user_id'))
      from public.social_places s join public.social_places d on d."placeId"=s."placeId"
      where s.user_id=source_id and d.user_id=destination_id and
        to_jsonb(s)-'user_id'-'locked' <> to_jsonb(d)-'user_id'-'locked';
    update public.social_places d set locked=true from public.social_places s
      where s.user_id=source_id and d.user_id=destination_id and s."placeId"=d."placeId" and s.locked;
    delete from public.social_places s using public.social_places d
      where s.user_id=source_id and d.user_id=destination_id and s."placeId"=d."placeId";
    update public.social_places set user_id=destination_id where user_id=source_id;

    delete from public.social_inbox s using public.social_inbox d
      where s.user_id=source_id and d.user_id=destination_id and s.id=d.id
      and to_jsonb(s)-'user_id' = to_jsonb(d)-'user_id';
    update public.social_inbox s set user_id=destination_id,
      id=case when exists(select 1 from public.social_inbox d where d.user_id=destination_id and d.id=s.id)
        then gen_random_uuid() else s.id end where s.user_id=source_id;
  end if;
  -- Session/identity deletion and owner-data mutation commit or roll back together.
  delete from auth.users where id=source_id;
end;
$$;
revoke all on function public.finish_account_lifecycle(uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.finish_account_lifecycle(uuid,uuid,text) to service_role;
commit;
