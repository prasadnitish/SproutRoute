-- 022: Security scan remediation for Trip Hub, telemetry, feedback, and public attractions.

-- Trip Hub optimistic concurrency and capability lifecycle.
ALTER TABLE public.group_trip_documents
  ADD COLUMN IF NOT EXISTS version BIGINT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS invite_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS invite_revoked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS invite_generation UUID,
  ADD COLUMN IF NOT EXISTS owner_key TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

UPDATE public.group_trip_documents
SET invite_expires_at = COALESCE(invite_expires_at, created_at + INTERVAL '7 days'),
    invite_generation = COALESCE(invite_generation, gen_random_uuid()),
    expires_at = COALESCE(expires_at, created_at + INTERVAL '90 days')
WHERE invite_expires_at IS NULL
   OR invite_generation IS NULL
   OR expires_at IS NULL;

ALTER TABLE public.group_trip_documents
  ALTER COLUMN invite_expires_at SET NOT NULL,
  ALTER COLUMN invite_generation SET NOT NULL,
  ALTER COLUMN expires_at SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_group_trip_documents_owner_active
  ON public.group_trip_documents (owner_key, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_group_trip_documents_expires_at
  ON public.group_trip_documents (expires_at)
  WHERE archived_at IS NULL;

-- Search metrics retain only a coarse prompt-length bucket.
ALTER TABLE public.trip_metrics
  ADD COLUMN IF NOT EXISTS text_length_bucket TEXT;

UPDATE public.trip_metrics
SET search_text = NULL
WHERE search_text IS NOT NULL;

ALTER TABLE public.trip_metrics
  DROP CONSTRAINT IF EXISTS trip_metrics_no_search_text;

ALTER TABLE public.trip_metrics
  ADD CONSTRAINT trip_metrics_no_search_text
  CHECK (event_type <> 'search' OR search_text IS NULL);

-- Bind feedback to the same user that owns the referenced trip request.
CREATE UNIQUE INDEX IF NOT EXISTS idx_trip_requests_id_user_id
  ON public.trip_requests (id, user_id);

ALTER TABLE public.trip_feedback
  DROP CONSTRAINT IF EXISTS trip_feedback_trip_owner_fkey;

ALTER TABLE public.trip_feedback
  ADD CONSTRAINT trip_feedback_trip_owner_fkey
  FOREIGN KEY (trip_request_id, user_id)
  REFERENCES public.trip_requests (id, user_id)
  ON DELETE CASCADE;

-- RLS cannot mask columns. Hide the base attraction-memory table and expose
-- only the product-approved public projection.
REVOKE SELECT ON TABLE public.city_attractions FROM anon;
REVOKE SELECT ON TABLE public.city_attractions FROM authenticated;

GRANT SELECT (
  id,
  city_id,
  canonical_name,
  short_summary,
  category,
  subcategories_json,
  age_bands_json,
  indoor_outdoor,
  duration_bucket,
  pace_fit,
  crowd_level,
  budget_tier,
  stroller_friendly,
  rainy_day_fit,
  parent_appeal_score,
  kid_appeal_score,
  pet_friendly,
  booking_needed,
  google_place_id,
  verification_status,
  created_at,
  updated_at
) ON TABLE public.city_attractions TO anon, authenticated;

DROP VIEW IF EXISTS public.public_city_attractions;
CREATE VIEW public.public_city_attractions
WITH (security_barrier = true, security_invoker = true)
AS
SELECT
  id,
  city_id,
  canonical_name,
  short_summary,
  category,
  subcategories_json,
  age_bands_json,
  indoor_outdoor,
  duration_bucket,
  pace_fit,
  crowd_level,
  budget_tier,
  stroller_friendly,
  rainy_day_fit,
  parent_appeal_score,
  kid_appeal_score,
  pet_friendly,
  booking_needed,
  google_place_id,
  verification_status,
  created_at,
  updated_at
FROM public.city_attractions
WHERE verification_status <> 'rejected';

REVOKE ALL ON TABLE public.public_city_attractions FROM PUBLIC;
GRANT SELECT ON TABLE public.public_city_attractions TO anon;
GRANT SELECT ON TABLE public.public_city_attractions TO authenticated;
