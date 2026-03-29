-- 015: Security hardening — enable RLS on all tables, add missing policies
-- Fixes: 5 tables with no RLS, missing INSERT policy on profile_revisions

-- ── Enable RLS on attraction tables (public read, no anon writes) ────────

ALTER TABLE public.cities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cities_public_read" ON public.cities
  FOR SELECT USING (true);

ALTER TABLE public.city_attractions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "attractions_public_read" ON public.city_attractions
  FOR SELECT USING (true);

ALTER TABLE public.city_attraction_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tags_public_read" ON public.city_attraction_tags
  FOR SELECT USING (true);

-- Precompute runs and verification cache: ops/admin only (no anon access)
ALTER TABLE public.attraction_precompute_runs ENABLE ROW LEVEL SECURITY;
-- No SELECT policy = no access for anon or regular authenticated users; service role only

ALTER TABLE public.attraction_verification_cache ENABLE ROW LEVEL SECURITY;
-- No SELECT policy = service role only

-- ── Add missing INSERT policy for profile_revisions ─────────────────────

CREATE POLICY "revisions_insert_own" ON public.profile_revisions
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = profile_revisions.profile_id
      AND profiles.user_id = auth.uid()
    )
  );
