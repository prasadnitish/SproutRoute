-- 004: Create profile_imports table
-- Tracks raw import text and normalization results

CREATE TABLE IF NOT EXISTS public.profile_imports (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 UUID NOT NULL,
  provider_hint           TEXT NOT NULL DEFAULT 'other', -- chatgpt, claude, gemini, other
  raw_import_text         TEXT NOT NULL,
  normalized_profile_json JSONB,
  validation_result_json  JSONB,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profile_imports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "imports_select_own" ON public.profile_imports
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "imports_insert_own" ON public.profile_imports
  FOR INSERT WITH CHECK (auth.uid() = user_id);
