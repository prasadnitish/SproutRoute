-- 036: completed request traces, so the ops trace view and latency report survive a deploy.
-- A trace holds timings, statuses, model and step labels, and the client label (web, ios, android,
-- other). It never holds request or response content, prompts, IP addresses or user identity.
-- Server-only table: RLS on with no policies, browser roles have no access, only service_role
-- (the Express server) reads and writes it. The server deletes rows older than 30 days
-- (services/traceStore.js). Safe to re-run.
create table if not exists public.request_traces (
  run_id text primary key check (char_length(run_id) between 1 and 64),
  started_at timestamptz not null,
  client text,
  service text,
  environment text,
  build text,
  duration_ms integer check (duration_ms is null or duration_ms >= 0),
  trace jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.request_traces enable row level security;
revoke all on public.request_traces from public, anon, authenticated;
grant select, insert, delete on public.request_traces to service_role;
create index if not exists request_traces_environment_started_idx
  on public.request_traces (environment, started_at desc);
create index if not exists request_traces_started_idx on public.request_traces (started_at);
