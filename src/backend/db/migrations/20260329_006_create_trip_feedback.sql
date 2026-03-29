-- 006: Create trip_feedback table
-- Stores user feedback signals (more_like_this, less_like_this, save_as_preference)

CREATE TABLE IF NOT EXISTS public.trip_feedback (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL,
  trip_request_id UUID NOT NULL,
  signal_type     TEXT NOT NULL, -- more_like_this, less_like_this, save_as_preference
  payload_json    JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.trip_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "feedback_select_own" ON public.trip_feedback
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "feedback_insert_own" ON public.trip_feedback
  FOR INSERT WITH CHECK (auth.uid() = user_id);
