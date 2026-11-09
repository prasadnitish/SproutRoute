-- 031: Security hardening from the run-1 audit
-- Idempotent: safe to re-run. Each constraint is added NOT VALID, then validated, so a database that
-- already holds offending rows fails loudly at the VALIDATE step instead of half-applying.
-- Checked against production on 2026-10-30: trip_metrics has 0 rows with search_text set, and
-- trip_feedback_trip_owner_fkey was already in place and validated.
-- The rls_auto_enable() revoke from the same audit is covered by 20260329_021.

-- ── trip_metrics.search_text must stay NULL ──────────────────────────────
-- The app never stores search text (services/metrics.js writes null). Enforce it in the database so a
-- future writer cannot start retaining user-typed text.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'trip_metrics_search_text_null'
      AND conrelid = 'public.trip_metrics'::regclass
  ) THEN
    ALTER TABLE public.trip_metrics
      ADD CONSTRAINT trip_metrics_search_text_null
      CHECK (search_text IS NULL) NOT VALID;
  END IF;
END $$;

ALTER TABLE public.trip_metrics VALIDATE CONSTRAINT trip_metrics_search_text_null;

-- ── trip_feedback must belong to the user who owns the trip ──────────────
-- fk_feedback_trip only checks that the trip exists. This composite key also requires
-- trip_requests.user_id to equal trip_feedback.user_id. Trips with a NULL user_id (anonymous) can no
-- longer be referenced by feedback.
CREATE UNIQUE INDEX IF NOT EXISTS idx_trip_requests_id_user_id
  ON public.trip_requests (id, user_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'trip_feedback_trip_owner_fkey'
      AND conrelid = 'public.trip_feedback'::regclass
  ) THEN
    ALTER TABLE public.trip_feedback
      ADD CONSTRAINT trip_feedback_trip_owner_fkey
      FOREIGN KEY (trip_request_id, user_id)
      REFERENCES public.trip_requests (id, user_id)
      ON DELETE CASCADE
      NOT VALID;
  END IF;
END $$;

ALTER TABLE public.trip_feedback VALIDATE CONSTRAINT trip_feedback_trip_owner_fkey;
