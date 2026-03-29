-- 016: Align public.users identity with Supabase Auth IDs
-- public.users.id must be supplied from auth.users.id, never generated independently.

ALTER TABLE public.users
  ALTER COLUMN id DROP DEFAULT;

COMMENT ON COLUMN public.users.id IS
  'Must match auth.users.id exactly; populated by server-side upsert on first authenticated write.';
