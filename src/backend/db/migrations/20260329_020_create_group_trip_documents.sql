-- 020: Create durable Trip Hub document table
-- Stores shared trip-organizer state server-side so group trips survive process restarts.

CREATE TABLE IF NOT EXISTS public.group_trip_documents (
  id                TEXT PRIMARY KEY,
  invite_code       TEXT UNIQUE NOT NULL,
  trip_json         JSONB NOT NULL,
  participants_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  items_json        JSONB NOT NULL DEFAULT '[]'::jsonb,
  decisions_json    JSONB NOT NULL DEFAULT '[]'::jsonb,
  expenses_json     JSONB NOT NULL DEFAULT '[]'::jsonb,
  activity_json     JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_group_trip_documents_invite_code
  ON public.group_trip_documents (invite_code);

CREATE INDEX IF NOT EXISTS idx_group_trip_documents_updated_at
  ON public.group_trip_documents (updated_at DESC);

ALTER TABLE public.group_trip_documents ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'group_trip_documents'
      AND policyname = 'group_trip_documents_service_role_all'
  ) THEN
    CREATE POLICY "group_trip_documents_service_role_all"
      ON public.group_trip_documents
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END
$$;

-- Trip Hub writes go through the backend service role while invite/auth hardening is finalized.
-- Keep the table hidden from client API roles; participant auth is enforced by the backend token model.
REVOKE ALL ON TABLE public.group_trip_documents FROM PUBLIC;
REVOKE ALL ON TABLE public.group_trip_documents FROM anon;
REVOKE ALL ON TABLE public.group_trip_documents FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.group_trip_documents TO service_role;
