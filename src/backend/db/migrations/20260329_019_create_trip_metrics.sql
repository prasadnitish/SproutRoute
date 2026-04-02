-- 019: Create trip_metrics table for persistent ops dashboard
-- Survives deploys. Enables historical comparison of latency, quality, costs.

CREATE TABLE IF NOT EXISTS public.trip_metrics (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type    TEXT NOT NULL,  -- trip, search, ai_call, error
  destination   TEXT,
  duration_days INTEGER,
  child_count   INTEGER DEFAULT 0,
  pet_count     INTEGER DEFAULT 0,
  vibe          TEXT,
  search_text   TEXT,
  provider      TEXT,
  model         TEXT,
  caller        TEXT,
  latency_ms    INTEGER,
  output_chars  INTEGER,
  success       BOOLEAN DEFAULT true,
  timing_json   JSONB,
  req_id        TEXT,
  error_message TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_trip_metrics_type_created ON public.trip_metrics (event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_trip_metrics_destination ON public.trip_metrics (destination) WHERE destination IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_trip_metrics_created ON public.trip_metrics (created_at DESC);

ALTER TABLE public.trip_metrics ENABLE ROW LEVEL SECURITY;
