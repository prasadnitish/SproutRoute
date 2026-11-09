-- Google Maps Platform terms: only the place id may be stored indefinitely (General Service Term 3), and Places
-- latitude/longitude for at most 30 consecutive days (Service Specific Term 14.3). Everything else from Google
-- (ratings, review counts, price level, hours, photo references, business status, place types, addresses,
-- Maps links) may not be stored. This removes what earlier code stored. Wikidata coordinates are untouched.
-- Irreversible: the values are deleted, not moved.

update public.city_attractions
set rating = null, rating_count = null, price_level = null, opening_hours = null, photo_ref = null,
    business_status = null, place_types = '[]'::jsonb
where rating is not null or rating_count is not null or price_level is not null or opening_hours is not null
   or photo_ref is not null or business_status is not null or jsonb_array_length(coalesce(place_types, '[]'::jsonb)) > 0;

-- Google coordinates past 30 days (the server repeats this daily: services/googleRetention.js).
update public.city_attractions
set lat = null, lon = null
where wikidata_id is null and google_place_id is not null and lat is not null
  and last_verified_at < now() - interval '30 days';

-- The verification cache keeps only the place id and our own attraction name.
delete from public.attraction_verification_cache where expires_at < now();
update public.attraction_verification_cache
set verification_payload_json = jsonb_strip_nulls(jsonb_build_object(
      'attractionName', verification_payload_json->>'attractionName',
      'placeId', verification_payload_json->>'placeId'));
