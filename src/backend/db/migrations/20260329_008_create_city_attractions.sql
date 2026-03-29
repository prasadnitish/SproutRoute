-- 008: Create city_attractions table
-- Precomputed attraction data populated by offline LLM pipeline

CREATE TABLE IF NOT EXISTS public.city_attractions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  city_id             UUID NOT NULL,
  canonical_name      TEXT NOT NULL,
  short_summary       TEXT NOT NULL DEFAULT '',
  category            TEXT NOT NULL DEFAULT '',
  subcategories_json  JSONB NOT NULL DEFAULT '[]'::jsonb,
  age_bands_json      JSONB NOT NULL DEFAULT '[]'::jsonb,
  indoor_outdoor      TEXT NOT NULL DEFAULT 'both',    -- indoor, outdoor, both
  duration_bucket     TEXT NOT NULL DEFAULT '1_2h',     -- under_1h, 1_2h, 2_4h, half_day, full_day
  pace_fit            TEXT NOT NULL DEFAULT 'any',      -- slow, moderate, fast, any
  crowd_level         TEXT NOT NULL DEFAULT 'moderate', -- low, moderate, high, varies
  budget_tier         TEXT NOT NULL DEFAULT 'moderate', -- free, budget, moderate, premium
  stroller_friendly   BOOLEAN NOT NULL DEFAULT false,
  rainy_day_fit       BOOLEAN NOT NULL DEFAULT false,
  parent_appeal_score SMALLINT NOT NULL DEFAULT 5,  -- 1-10
  kid_appeal_score    SMALLINT NOT NULL DEFAULT 5,  -- 1-10
  pet_friendly        BOOLEAN NOT NULL DEFAULT false,
  booking_needed      BOOLEAN NOT NULL DEFAULT false,
  confidence_score    REAL NOT NULL DEFAULT 0.5,    -- 0.0-1.0
  llm_notes           TEXT NOT NULL DEFAULT '',
  google_place_id     TEXT,
  last_verified_at    TIMESTAMPTZ,
  verification_status TEXT NOT NULL DEFAULT 'unverified', -- verified, unverified, stale, rejected
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
