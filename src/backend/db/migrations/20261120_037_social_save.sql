begin;
create table public.social_places (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  "placeId" text not null check ("placeId" ~ '^[A-Za-z0-9][A-Za-z0-9_:-]{0,199}$'),
  name text not null check (length(name) between 1 and 180),
  destination text not null check (length(destination) between 1 and 180),
  source text not null check (source ~ '^https://' and length(source) <= 2048),
  category text not null check (category in ('eat','cafe','drink','attraction','stay','shop','activity','viewpoint','other')),
  evidence text not null check (length(evidence)<=500), tip text not null check(length(tip)<=500),
  family text not null check(length(family)<=500), locked boolean not null default false,
  primary key (user_id, "placeId")
);
create table public.social_inbox (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id uuid not null, source text not null check (source ~ '^https://' and length(source)<=2048),
  extraction jsonb check (jsonb_typeof(extraction) = 'object' and octet_length(extraction::text) <= 100000),
  text text not null check (length(text)<=12000), primary key (user_id,id)
);
alter table public.social_places enable row level security;
alter table public.social_inbox enable row level security;
revoke all on public.social_places, public.social_inbox from public, anon, authenticated;
grant select, insert, update, delete on public.social_places, public.social_inbox to authenticated;
create policy own_places on public.social_places to authenticated
  using (user_id = (select auth.uid()) and (select auth.jwt()->>'is_anonymous') is distinct from 'true')
  with check (user_id = (select auth.uid()) and (select auth.jwt()->>'is_anonymous') is distinct from 'true');
create policy own_inbox on public.social_inbox to authenticated
  using (user_id = (select auth.uid()) and (select auth.jwt()->>'is_anonymous') is distinct from 'true')
  with check (user_id = (select auth.uid()) and (select auth.jwt()->>'is_anonymous') is distinct from 'true');
commit;
