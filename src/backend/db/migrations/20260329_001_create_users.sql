-- 001: Create users table
-- Uses Supabase Auth user IDs as the primary key (uuid from auth.users)

CREATE TABLE IF NOT EXISTS public.users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT UNIQUE NOT NULL,
  auth_provider TEXT NOT NULL DEFAULT 'magic_link', -- magic_link, google, apple
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS: users can only read their own row
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_select_own" ON public.users
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "users_update_own" ON public.users
  FOR UPDATE USING (auth.uid() = id);
