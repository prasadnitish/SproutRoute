-- Read-only SproutRoute telemetry. One row per UTC date, including the partial current day.
-- The calendar starts at the first retained trip metric. Never select identifiers into output.
WITH metrics AS (
  SELECT (created_at AT TIME ZONE 'UTC')::date AS day,
         count(*) FILTER (WHERE event_type = 'trip') AS trips,
         count(*) FILTER (WHERE event_type = 'search') AS searches,
         count(*) FILTER (WHERE event_type = 'ai_call') AS calls,
         count(timing_json->>'costUsd') FILTER (WHERE event_type = 'ai_call') AS priced,
         sum((timing_json->>'costUsd')::numeric) FILTER (WHERE event_type = 'ai_call') AS usd,
         count(*) FILTER (WHERE event_type = 'error') AS errors,
         bool_or(event_type = 'launch_save_coverage_start') AS save_coverage_start,
         count(*) FILTER (WHERE event_type = 'account_trip_saved') AS saved_trips,
         count(*) FILTER (WHERE event_type = 'account_trip_saved'
                           AND timing_json @> '{"firstAccountSaveToday":true}') AS saving_accounts,
         count(*) FILTER (WHERE event_type = 'social_place_saved') AS saved_places,
         count(*) FILTER (WHERE event_type = 'social_extraction_finished') AS extractions,
         count(timing_json->>'facts') FILTER (WHERE event_type = 'social_extraction_finished') AS imports_with_facts,
         sum((timing_json->>'facts')::int) FILTER (WHERE event_type = 'social_extraction_finished') AS facts
  FROM public.trip_metrics GROUP BY 1
), shares AS (
  SELECT (created_at AT TIME ZONE 'UTC')::date AS day, count(*) AS n
  FROM public.trip_shares GROUP BY 1
), groups AS (
  SELECT (created_at AT TIME ZONE 'UTC')::date AS day, count(*) AS n
  FROM public.group_trip_documents GROUP BY 1
), counters AS (
  SELECT period_start AS day, split_part(bucket, ':', 1) AS kind,
         split_part(bucket, ':', 2) AS identity, split_part(bucket, ':', 3) AS category,
         request_count
  FROM public.usage_counters WHERE length(period) = 10 AND request_count > 0
), keydays AS (
  SELECT DISTINCT day, identity FROM counters WHERE kind = 'device'
), returns AS (
  SELECT a.day, count(*) AS n FROM keydays a
  WHERE EXISTS (SELECT 1 FROM keydays b WHERE b.identity = a.identity
                AND b.day BETWEEN a.day - 7 AND a.day - 1)
  GROUP BY a.day
), quota AS (
  SELECT day, count(DISTINCT identity) FILTER (WHERE kind = 'device') AS devices,
         count(DISTINCT identity) FILTER (WHERE kind = 'device' AND category = 'plan') AS planners,
         count(DISTINCT identity) FILTER (WHERE kind = 'ip') AS ips,
         sum(request_count) FILTER (WHERE kind = 'device' AND category = 'plan') AS device_plans,
         sum(request_count) FILTER (WHERE kind IN ('device', 'ip') AND category = 'plan') AS plans
  FROM counters GROUP BY day
), coverage AS (
  SELECT (SELECT min(day) FROM counters) AS first_day,
         (SELECT min(day) FROM metrics WHERE save_coverage_start) AS saves_from
), days AS (
  SELECT generate_series(min(day)::timestamp,
         (now() AT TIME ZONE 'UTC')::date::timestamp, interval '1 day')::date AS day
  FROM metrics
)
SELECT d.day AS day_utc, coalesce(m.trips, 0) AS trip_events,
       coalesce(m.searches, 0) AS search_events, coalesce(m.calls, 0) AS ai_calls,
       coalesce(m.priced, 0) AS priced_ai_calls, m.usd AS estimated_priced_ai_usd,
       coalesce(m.errors, 0) AS error_events, coalesce(s.n, 0) AS retained_shares_created,
       coalesce(g.n, 0) AS retained_groups_created,
       CASE WHEN d.day >= c.first_day THEN coalesce(q.devices, 0) END AS active_attested_keys,
       CASE WHEN d.day >= c.first_day THEN coalesce(q.planners, 0) END AS active_attested_planner_keys,
       CASE WHEN d.day >= c.first_day THEN coalesce(q.ips, 0) END AS unattested_ip_buckets,
       CASE WHEN d.day >= c.first_day THEN coalesce(q.device_plans, 0) END AS attested_plan_requests,
       CASE WHEN d.day >= c.first_day + 7 THEN coalesce(r.n, 0) END AS returning_attested_keys,
       CASE WHEN d.day >= c.first_day THEN coalesce(q.plans, 0) END AS total_plan_requests,
       CASE WHEN d.day >= c.saves_from THEN coalesce(m.saving_accounts, 0) END AS accounts_saving_trips,
       CASE WHEN d.day >= c.saves_from THEN coalesce(m.saved_trips, 0) END AS saved_trips_created,
       CASE WHEN d.day >= c.saves_from THEN coalesce(m.saved_places, 0) END AS saved_places_created,
       CASE WHEN d.day >= c.saves_from THEN coalesce(m.extractions, 0) END AS successful_social_extractions,
       CASE WHEN d.day >= c.saves_from AND coalesce(m.imports_with_facts,0) = coalesce(m.extractions,0)
            THEN coalesce(m.facts,0) END AS extracted_grounded_facts,
       to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS observed_as_of_utc
FROM days d CROSS JOIN coverage c LEFT JOIN metrics m USING (day)
LEFT JOIN shares s USING (day) LEFT JOIN groups g USING (day)
LEFT JOIN quota q USING (day) LEFT JOIN returns r USING (day)
ORDER BY d.day;
