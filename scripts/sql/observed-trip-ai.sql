-- Historical request-level estimate using rates documented in the Oct 28 model comparison.
-- A cohort contains one recorded completed trip and its backend request, plus calls that
-- carry that journey ID. A reused journey ID across multiple completions is ambiguous.
WITH requests AS (
  SELECT t.run_id, t.trace, nullif(t.trace->'meta'->>'journey_id','') AS journey,
         EXISTS (SELECT 1 FROM public.trip_metrics m WHERE m.event_type = 'trip' AND m.req_id = t.run_id) AS completed
  FROM public.request_traces t
  WHERE t.service = 'sproutroute' AND t.environment = 'production'
    AND t.started_at < timestamptz '2026-11-20 21:37:24+00'
), cohorts AS (
  SELECT journey, max(run_id) FILTER (WHERE completed) AS trip_run
  FROM requests WHERE journey IS NOT NULL GROUP BY journey
  HAVING count(*) FILTER (WHERE completed) = 1
), rates(model, input_rate, output_rate) AS (
  VALUES ('gemini-3.8-flash',0.75,3.75), ('gpt-5.4-nano',0.20,1.25),
         ('claude-haiku-4-5-20251001',1.0,5.0)
), attempts AS (
  SELECT c.journey, c.trip_run = r.run_id AS on_stream, s->'detail' AS detail
  FROM cohorts c JOIN requests r USING (journey)
  CROSS JOIN LATERAL jsonb_array_elements(r.trace->'spans') s
  WHERE s->>'kind' = 'llm'
), values_usd AS (
  SELECT a.journey, on_stream, CASE WHEN detail->>'usage_source' = 'provider' THEN
    ((detail->>'input_tokens')::numeric * input_rate
     + (detail->>'output_tokens')::numeric * output_rate)/1000000 END AS usd
  FROM attempts a LEFT JOIN rates ON rates.model = detail->>'model_id'
), totals AS (
  SELECT journey, count(*) AS attempts, count(usd) AS priced, sum(usd) AS usd,
         sum(usd) FILTER (WHERE on_stream) AS stream_usd
  FROM values_usd GROUP BY journey
)
SELECT (SELECT count(*) FROM requests WHERE completed) AS linked_trip_completions,
       (SELECT count(*) FROM cohorts) AS single_completion_journeys,
       count(*) AS journeys_with_ai_attempts,
       count(*) FILTER (WHERE attempts = priced) AS fully_priced_observed_journeys,
       sum(attempts) AS observed_attempts, sum(priced) AS priced_attempts,
       round(avg(usd) FILTER (WHERE attempts = priced),6) AS mean_observed_journey_ai_usd,
       round(min(usd) FILTER (WHERE attempts = priced),6) AS min_observed_journey_ai_usd,
       round(max(usd) FILTER (WHERE attempts = priced),6) AS max_observed_journey_ai_usd,
       round(avg(stream_usd) FILTER (WHERE attempts = priced),6) AS mean_observed_stream_ai_usd
FROM totals;
