-- 021: Restrict internal RLS helper execution
-- Supabase advisor flagged public.rls_auto_enable() as a SECURITY DEFINER function
-- callable by client API roles. Keep it unavailable through anon/authenticated API paths.

REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM anon;
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.rls_auto_enable() TO service_role;
