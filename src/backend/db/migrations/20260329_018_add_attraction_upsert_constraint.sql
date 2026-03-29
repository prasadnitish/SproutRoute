-- 018: Add unique constraint for city_id + canonical_name to enable upsert in precompute
-- Handles duplicate names within same city gracefully

CREATE UNIQUE INDEX IF NOT EXISTS idx_city_attractions_city_name_unique
  ON public.city_attractions (city_id, canonical_name);
