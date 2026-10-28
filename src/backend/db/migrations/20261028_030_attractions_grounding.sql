-- 030: Ground city_attractions in Google Places data and add the refresh log.
--
-- The 2026-10-27 audit (docs/attractions-audit.md) found every row was written by a model, only 27% had a
-- Google place id, and nothing recorded rating, hours, price or whether the place still exists.
-- New columns are server-only: column-level grants for anon/authenticated (migration 023) are untouched.
--
-- Not applied automatically. Run it by hand against production after review.

alter table public.city_attractions
  add column if not exists lat double precision,
  add column if not exists lon double precision,
  add column if not exists rating numeric(2,1),
  add column if not exists rating_count integer,
  add column if not exists price_level smallint check (price_level between 0 and 4),
  add column if not exists opening_hours jsonb,
  add column if not exists photo_ref text,
  add column if not exists business_status text,
  add column if not exists place_types jsonb not null default '[]'::jsonb,
  -- Rows that fail to match a place, or are permanently closed, become closed_unverified. Never deleted.
  add column if not exists status text not null default 'active'
    check (status in ('active', 'closed_unverified')),
  -- Claude's family-fit judgment for the place, with the model and prompt version that produced it.
  add column if not exists family_fit_json jsonb,
  add column if not exists trend_score numeric not null default 0,
  add column if not exists trend_updated_at timestamptz;

-- One row per Google place per city, so a refresh or trend run can never create a duplicate venue.
create unique index if not exists city_attractions_city_place_uidx
  on public.city_attractions (city_id, google_place_id)
  where google_place_id is not null;

-- Generation reads active, grounded rows for one city, best-reviewed first.
create index if not exists city_attractions_grounded_idx
  on public.city_attractions (city_id, status, rating_count desc nulls last)
  where google_place_id is not null;

-- The refresh job takes the stalest rows first.
create index if not exists city_attractions_last_verified_idx
  on public.city_attractions (last_verified_at nulls first);

-- What the refresh job changed and why: new closures, rating moves over 0.3, unmatched rows.
create table if not exists public.refresh_log (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null,
  attraction_id uuid not null references public.city_attractions (id) on delete cascade,
  change_type text not null check (change_type in ('closed', 'reopened', 'unmatched', 'rating_change', 'matched', 'hours_change')),
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists refresh_log_run_idx on public.refresh_log (run_id);
create index if not exists refresh_log_attraction_idx on public.refresh_log (attraction_id, created_at desc);

alter table public.refresh_log enable row level security;
revoke all on public.refresh_log from public, anon, authenticated;
grant select, insert on public.refresh_log to service_role;
