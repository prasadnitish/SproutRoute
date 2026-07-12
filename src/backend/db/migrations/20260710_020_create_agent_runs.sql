-- 020: Create agent_runs table for multi-agent orchestrator handoff tracing
-- One plan_trip call produces one run_id shared across up to 4 span rows
-- (one per agent). No input/output payloads are stored — only structural
-- metadata — since get_agent_trace has no per-caller ownership check under
-- the shared MCP demo token (see design spec §4).

CREATE TABLE IF NOT EXISTS public.agent_runs (
  span_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id        UUID NOT NULL,
  parent_agent  TEXT NOT NULL DEFAULT 'orchestrator',
  child_agent   TEXT NOT NULL,  -- retrieval, itinerary, safety, packing
  status        TEXT NOT NULL,  -- ok, error, skipped
  latency_ms    INTEGER,
  edge_summary  JSONB,
  timestamp     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_runs_run_id ON public.agent_runs (run_id, timestamp ASC);

ALTER TABLE public.agent_runs ENABLE ROW LEVEL SECURITY;
