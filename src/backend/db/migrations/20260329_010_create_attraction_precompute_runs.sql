-- 010: Create attraction_precompute_runs table
-- Tracks offline LLM runs for attraction discovery and tagging

CREATE TABLE IF NOT EXISTS public.attraction_precompute_runs (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  city_id             UUID NOT NULL,
  model_provider      TEXT NOT NULL,     -- anthropic, openai, google
  model_name          TEXT NOT NULL,
  prompt_version      TEXT NOT NULL,
  run_status          TEXT NOT NULL DEFAULT 'pending', -- pending, running, completed, failed
  input_snapshot_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  output_snapshot_json JSONB,
  started_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at        TIMESTAMPTZ
);
