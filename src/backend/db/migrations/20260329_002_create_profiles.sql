-- 002: Create profiles table
-- Stores the normalized user travel profile as JSONB

CREATE TABLE IF NOT EXISTS public.profiles (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL,
  version         INTEGER NOT NULL DEFAULT 1,
  profile_json    JSONB NOT NULL DEFAULT '{}'::jsonb,
  profile_summary TEXT NOT NULL DEFAULT '',  -- Compact text for AI prompt injection (150-300 tokens)
  source          TEXT NOT NULL DEFAULT 'manual', -- manual, import, merge
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles_select_own" ON public.profiles
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "profiles_insert_own" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "profiles_delete_own" ON public.profiles
  FOR DELETE USING (auth.uid() = user_id);
