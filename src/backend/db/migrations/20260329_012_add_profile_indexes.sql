-- 012: Add profile-related indexes

CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON public.profiles (user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_user_latest ON public.profiles (user_id, version DESC);

CREATE INDEX IF NOT EXISTS idx_profile_revisions_profile_id ON public.profile_revisions (profile_id);
CREATE INDEX IF NOT EXISTS idx_profile_imports_user_id ON public.profile_imports (user_id);

CREATE INDEX IF NOT EXISTS idx_trip_requests_user_id ON public.trip_requests (user_id);
CREATE INDEX IF NOT EXISTS idx_trip_requests_created_at ON public.trip_requests (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_trip_feedback_user_id ON public.trip_feedback (user_id);
CREATE INDEX IF NOT EXISTS idx_trip_feedback_trip_request_id ON public.trip_feedback (trip_request_id);
