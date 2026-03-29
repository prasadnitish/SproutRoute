-- 007: Create cities table
-- Canonical city list for attraction intelligence layer

CREATE TABLE IF NOT EXISTS public.cities (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code  TEXT NOT NULL,       -- ISO 3166-1 alpha-2
  region_code   TEXT NOT NULL DEFAULT '',
  city_name     TEXT NOT NULL,
  display_name  TEXT NOT NULL,
  lat           DOUBLE PRECISION NOT NULL,
  lon           DOUBLE PRECISION NOT NULL,
  priority_tier TEXT NOT NULL DEFAULT 'tier3', -- tier1, tier2, tier3
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- No RLS — cities are public read
