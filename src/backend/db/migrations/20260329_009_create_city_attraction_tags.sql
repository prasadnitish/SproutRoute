-- 009: Create city_attraction_tags table
-- Flexible tagging for attractions (activity_type, theme, audience, season)

CREATE TABLE IF NOT EXISTS public.city_attraction_tags (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attraction_id UUID NOT NULL,
  tag           TEXT NOT NULL,
  tag_group     TEXT NOT NULL DEFAULT '', -- activity_type, theme, audience, season
  weight        REAL NOT NULL DEFAULT 1.0, -- 0.0-1.0 relevance
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
