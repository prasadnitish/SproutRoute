-- 017: Add demand-driven attraction memory fields
-- Supports storing attractions generated in live trip flows and reusing them later.

ALTER TABLE public.city_attractions
  ADD COLUMN IF NOT EXISTS source_type TEXT NOT NULL DEFAULT 'generated',
  ADD COLUMN IF NOT EXISTS times_seen INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS why_recommended TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS timing_tip TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_city_attractions_last_seen
  ON public.city_attractions (last_seen_at DESC);

CREATE INDEX IF NOT EXISTS idx_city_attractions_source_type
  ON public.city_attractions (source_type);
