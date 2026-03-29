-- 005: Create trip_requests table
-- Stores raw input, parsed intent, and resolved profile snapshot per trip

CREATE TABLE IF NOT EXISTS public.trip_requests (
  id                             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                        UUID,  -- nullable for anonymous users
  raw_input                      TEXT NOT NULL,
  parsed_trip_json               JSONB NOT NULL,
  resolved_profile_snapshot_json JSONB,
  created_at                     TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.trip_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "trips_select_own" ON public.trip_requests
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "trips_insert_own" ON public.trip_requests
  FOR INSERT WITH CHECK (auth.uid() = user_id OR user_id IS NULL);
