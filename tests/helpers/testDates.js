// Trip start/end dates in tests must stay relative to "now" — validateTripData
// rejects any startDate before yesterday, so a hardcoded calendar date (e.g.
// "2026-05-01") silently starts failing once real time passes it.
export function daysFromNow(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}
