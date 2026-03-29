-- 003: Create profile_revisions table
-- Immutable audit trail — every profile change is recorded

CREATE TABLE IF NOT EXISTS public.profile_revisions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id      UUID NOT NULL,
  version         INTEGER NOT NULL,
  change_source   TEXT NOT NULL, -- import, user_edit, feedback, merge
  change_summary  TEXT NOT NULL DEFAULT '',
  profile_json    JSONB NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profile_revisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "revisions_select_own" ON public.profile_revisions
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = profile_revisions.profile_id AND profiles.user_id = auth.uid())
  );
