-- 014: Add foreign keys and constraints

-- Profile → User
ALTER TABLE public.profiles
  ADD CONSTRAINT fk_profiles_user
  FOREIGN KEY (user_id) REFERENCES public.users (id) ON DELETE CASCADE;

-- Profile revisions → Profile
ALTER TABLE public.profile_revisions
  ADD CONSTRAINT fk_revisions_profile
  FOREIGN KEY (profile_id) REFERENCES public.profiles (id) ON DELETE CASCADE;

-- Profile imports → User
ALTER TABLE public.profile_imports
  ADD CONSTRAINT fk_imports_user
  FOREIGN KEY (user_id) REFERENCES public.users (id) ON DELETE CASCADE;

-- Trip requests → User (nullable)
ALTER TABLE public.trip_requests
  ADD CONSTRAINT fk_trips_user
  FOREIGN KEY (user_id) REFERENCES public.users (id) ON DELETE SET NULL;

-- Trip feedback → User + Trip
ALTER TABLE public.trip_feedback
  ADD CONSTRAINT fk_feedback_user
  FOREIGN KEY (user_id) REFERENCES public.users (id) ON DELETE CASCADE;

ALTER TABLE public.trip_feedback
  ADD CONSTRAINT fk_feedback_trip
  FOREIGN KEY (trip_request_id) REFERENCES public.trip_requests (id) ON DELETE CASCADE;

-- City attractions → City
ALTER TABLE public.city_attractions
  ADD CONSTRAINT fk_attractions_city
  FOREIGN KEY (city_id) REFERENCES public.cities (id) ON DELETE CASCADE;

-- Attraction tags → Attraction
ALTER TABLE public.city_attraction_tags
  ADD CONSTRAINT fk_tags_attraction
  FOREIGN KEY (attraction_id) REFERENCES public.city_attractions (id) ON DELETE CASCADE;

-- Precompute runs → City
ALTER TABLE public.attraction_precompute_runs
  ADD CONSTRAINT fk_precompute_city
  FOREIGN KEY (city_id) REFERENCES public.cities (id) ON DELETE CASCADE;

-- Verification cache → Attraction
ALTER TABLE public.attraction_verification_cache
  ADD CONSTRAINT fk_verification_attraction
  FOREIGN KEY (attraction_id) REFERENCES public.city_attractions (id) ON DELETE CASCADE;

-- Check constraints
ALTER TABLE public.city_attractions
  ADD CONSTRAINT chk_appeal_scores
  CHECK (parent_appeal_score BETWEEN 1 AND 10 AND kid_appeal_score BETWEEN 1 AND 10);

ALTER TABLE public.city_attractions
  ADD CONSTRAINT chk_confidence
  CHECK (confidence_score BETWEEN 0.0 AND 1.0);

ALTER TABLE public.trip_feedback
  ADD CONSTRAINT chk_signal_type
  CHECK (signal_type IN ('more_like_this', 'less_like_this', 'save_as_preference'));
