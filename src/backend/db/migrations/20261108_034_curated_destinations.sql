-- Curated destination and attraction data (written by Claude, checked against Wikidata and web search).
-- Additive only: existing rows and Google-sourced columns are untouched.
-- Coordinates in rows with wikidata_id come from Wikidata (CC0) and may be stored indefinitely;
-- Google-sourced coordinates keep their 30-day refresh.

alter table public.cities
  add column if not exists aliases jsonb not null default '[]'::jsonb,       -- lowercased names people type ("roma", "nyc")
  add column if not exists kind text,                                         -- city, island, national_park, ...
  add column if not exists family_popularity smallint,                        -- 1-5
  add column if not exists summary text,
  add column if not exists best_months jsonb not null default '[]'::jsonb,
  add column if not exists family_base_areas jsonb not null default '[]'::jsonb,
  add column if not exists getting_around text,
  add column if not exists typical_trip_days smallint,
  add column if not exists wikidata_id text,
  add column if not exists curated_at timestamptz;

create index if not exists cities_aliases_gin on public.cities using gin (aliases jsonb_path_ops);

alter table public.city_attractions
  add column if not exists wikidata_id text,
  add column if not exists official_url text,
  add column if not exists area text,
  add column if not exists must_do boolean not null default false,
  add column if not exists hours_pattern text,                                -- general pattern in our words, never Google hours
  add column if not exists seasonal_note text,
  add column if not exists km_from_center integer,
  add column if not exists web_check jsonb,                                   -- latest web-search verdict
  add column if not exists curated_at timestamptz;

create index if not exists city_attractions_wikidata_idx on public.city_attractions (wikidata_id) where wikidata_id is not null;
