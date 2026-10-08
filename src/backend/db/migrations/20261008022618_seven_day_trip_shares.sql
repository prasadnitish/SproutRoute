-- Public links expose only a server-validated snapshot via the Express API.
-- The database table itself is inaccessible to browser roles.
create table public.trip_shares (
  share_token_hash text primary key check (share_token_hash ~ '^[0-9a-f]{64}$'),
  owner_token_hash text not null check (owner_token_hash ~ '^[0-9a-f]{64}$'),
  snapshot jsonb not null check (snapshot->>'schemaVersion' = '1'),
  created_at timestamptz not null,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  constraint trip_shares_seven_day_expiry check (expires_at = created_at + interval '168 hours'),
  constraint trip_shares_payload_size check (octet_length(snapshot::text) <= 160 * 1024)
);
alter table public.trip_shares enable row level security;
revoke all on public.trip_shares from public, anon, authenticated;
grant select, insert, update, delete on public.trip_shares to service_role;
create index trip_shares_expires_at_idx on public.trip_shares (expires_at);
