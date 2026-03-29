-- 011: Create attraction_verification_cache table
-- Caches external verification data (Google Places, etc.)

CREATE TABLE IF NOT EXISTS public.attraction_verification_cache (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attraction_id           UUID NOT NULL,
  provider                TEXT NOT NULL, -- google_places, yelp, etc.
  verification_payload_json JSONB NOT NULL,
  verified_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at              TIMESTAMPTZ NOT NULL
);
