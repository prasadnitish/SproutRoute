-- Share links now last until 7 days after the trip ends: at least 7 days and at
-- most 400 days from creation. Apply before deploying the matching backend code;
-- the old exact-168-hour check rejects every longer link. Safe to re-run.
alter table public.trip_shares drop constraint if exists trip_shares_seven_day_expiry;
alter table public.trip_shares drop constraint if exists trip_shares_expiry_window;
alter table public.trip_shares add constraint trip_shares_expiry_window check (
  expires_at >= created_at + interval '168 hours'
  and expires_at <= created_at + interval '400 days'
);
