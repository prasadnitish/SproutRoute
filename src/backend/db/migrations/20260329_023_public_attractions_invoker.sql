-- 023: Ensure the public attraction projection obeys caller RLS and privileges.

REVOKE SELECT ON TABLE public.city_attractions FROM anon;
REVOKE SELECT ON TABLE public.city_attractions FROM authenticated;

GRANT SELECT (
  id,
  city_id,
  canonical_name,
  short_summary,
  category,
  subcategories_json,
  age_bands_json,
  indoor_outdoor,
  duration_bucket,
  pace_fit,
  crowd_level,
  budget_tier,
  stroller_friendly,
  rainy_day_fit,
  parent_appeal_score,
  kid_appeal_score,
  pet_friendly,
  booking_needed,
  google_place_id,
  verification_status,
  created_at,
  updated_at
) ON TABLE public.city_attractions TO anon, authenticated;

ALTER VIEW public.public_city_attractions SET (security_invoker = true);
