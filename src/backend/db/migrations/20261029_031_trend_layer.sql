-- 031: Trend layer. city_seeds lists what the weekly job watches in each city; trend_posts holds the public
-- posts it scored.
--
-- trend_posts keeps only what scoring needs: the post link, when it was posted, its counts, a keyed hash of
-- the author (so distinct authors can be counted) and the place. No captions, images or handles.
-- Server-only tables: no access for anon or authenticated.
--
-- Not applied automatically. Run it by hand against production after review.

create table if not exists public.city_seeds (
  id uuid primary key default gen_random_uuid(),
  city_id uuid not null references public.cities (id) on delete cascade,
  -- 'location' is an Instagram location id; 'hashtag' is a tag without the leading #.
  kind text not null check (kind in ('location', 'hashtag')),
  value text not null check (length(value) between 1 and 200),
  label text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (city_id, kind, value)
);

create table if not exists public.trend_posts (
  id uuid primary key default gen_random_uuid(),
  city_id uuid not null references public.cities (id) on delete cascade,
  attraction_id uuid references public.city_attractions (id) on delete set null,
  post_url text not null unique,
  posted_at timestamptz not null,
  likes integer not null default 0 check (likes >= 0),
  comments integer not null default 0 check (comments >= 0),
  views integer check (views is null or views >= 0),
  author_hash text,
  -- The structured location id when the provider gave one, else a key made from the venue name.
  venue_key text not null,
  venue_name text not null default '',
  seed_id uuid references public.city_seeds (id) on delete set null,
  fetched_at timestamptz not null default now()
);

create index if not exists trend_posts_city_posted_idx on public.trend_posts (city_id, posted_at desc);
create index if not exists trend_posts_attraction_idx on public.trend_posts (attraction_id, posted_at desc)
  where attraction_id is not null;
create index if not exists trend_posts_venue_idx on public.trend_posts (city_id, venue_key);

alter table public.city_seeds enable row level security;
alter table public.trend_posts enable row level security;
revoke all on public.city_seeds, public.trend_posts from public, anon, authenticated;
grant select, insert, update, delete on public.city_seeds, public.trend_posts to service_role;

-- trend_updated_at is the date of the last real observation (it drives "trending"). trend_decayed_at is where the
-- weekly halving last stopped, so decaying a score never makes old activity look recent.
alter table public.city_attractions add column if not exists trend_decayed_at timestamptz;

-- The trend job writes to the same change log as the refresh job.
alter table public.refresh_log drop constraint if exists refresh_log_change_type_check;
alter table public.refresh_log add constraint refresh_log_change_type_check
  check (change_type in ('closed', 'reopened', 'unmatched', 'rating_change', 'matched', 'hours_change', 'trend_added', 'trend_scored'));
