-- 013: Add attraction intelligence indexes

CREATE INDEX IF NOT EXISTS idx_city_attractions_city_id ON public.city_attractions (city_id);
CREATE INDEX IF NOT EXISTS idx_city_attractions_category ON public.city_attractions (category);
CREATE INDEX IF NOT EXISTS idx_city_attractions_verification ON public.city_attractions (verification_status);
CREATE INDEX IF NOT EXISTS idx_city_attractions_scores ON public.city_attractions (kid_appeal_score DESC, parent_appeal_score DESC);

CREATE INDEX IF NOT EXISTS idx_attraction_tags_attraction_id ON public.city_attraction_tags (attraction_id);
CREATE INDEX IF NOT EXISTS idx_attraction_tags_tag_group ON public.city_attraction_tags (tag_group, tag);

CREATE INDEX IF NOT EXISTS idx_precompute_runs_city_id ON public.attraction_precompute_runs (city_id);
CREATE INDEX IF NOT EXISTS idx_verification_cache_attraction_id ON public.attraction_verification_cache (attraction_id);
CREATE INDEX IF NOT EXISTS idx_verification_cache_expires ON public.attraction_verification_cache (expires_at);

CREATE INDEX IF NOT EXISTS idx_cities_country_region ON public.cities (country_code, region_code);
CREATE INDEX IF NOT EXISTS idx_cities_priority ON public.cities (priority_tier);
