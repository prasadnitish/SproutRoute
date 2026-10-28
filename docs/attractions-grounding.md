# Attraction grounding: operations guide

Part B of the attractions work (see `docs/attractions-audit.md` for why). Nothing here has been run against
production. Every step that changes production is listed in "Run order" and waits for approval.

## What changed

| Piece | File |
|---|---|
| New columns, `refresh_log` table, unique place index | `src/backend/db/migrations/20261028_030_attractions_grounding.sql` |
| Google Places lookup (match by name and city, or fetch by place id) | `src/backend/services/placesGrounding.js` |
| Claude's family-fit judgment | `src/backend/services/attractionFit.js` |
| Re-verification of a slice of rows, change log | `src/backend/services/attractionRefresh.js` |
| Command line entry point | `scripts/refresh-attractions.ts` |

Decisions that differ from the original request:

- The table is `city_attractions`, so the migration extends it. It already has `google_place_id` and
  `source_type`, so no `place_id` or `source` column is added. New `source_type` values are `places` and
  `trending`.
- The script is TypeScript as asked, but it needs Node 22.18 or newer to run directly. The repo's `engines`
  field says Node 20, so set the Railway cron service to Node 22 or newer.
- `price_level` is sparse. Google returned no price level for any of the 13 Seattle places checked, including
  paid ones. Generation uses Google's place type plus Claude's `fineDining` flag to keep formal dining away
  from small children, not price level alone.

## Who does what

- **Google Places** decides whether a place exists, where it is, its rating, review count, hours, photo and
  business status. A row that cannot be matched, or is permanently closed, becomes `closed_unverified`. It is
  never deleted.
- **Claude Haiku 5.5** (`claude-haiku-5-5`, $0.10 in / $0.50 out per 1M tokens) judges family fit: kid and
  parent appeal, age bands, stroller friendliness, indoor or outdoor, typical visit length, category, fine
  dining, adults only. It only sees facts that came from Google and is told not to state hours, prices or
  ratings. Replies are validated; a bad reply is counted and the row is left for the next run.
- Sonnet 5.5 is not used. If you want a second opinion on a sample of rows, set `ATTRACTION_FIT_MODEL` to
  `claude-sonnet-5-5` for that run.

A failed request (quota, outage, network) is never treated as "not found". The row is left alone.

## Checked against the real Places API (read-only, 14 requests)

Seattle rows, with the production key:

- 5 of 5 rows with a stored place id matched by id, all `OPERATIONAL`, with rating, review count, photo and
  seven-day hours.
- 7 of 8 rows without a place id matched by name and city. Two parks had no published hours.
- "Kenmore Air Seaplane Tour" came back unmatched: tours are often listed under the operator's name.
  Unmatched rows go to `closed_unverified` and are logged, so they can be reviewed from `refresh_log`.
- A made-up place was correctly unmatched.

## Run order (each step needs your go-ahead)

1. Apply the migration. It is idempotent and was checked in an in-memory Postgres (applied twice, duplicate
   place and bad status rejected). Apply it in the Supabase SQL editor.
2. Dry run on one city. Reads the table and calls Google; writes nothing and makes no Claude calls.

   ```bash
   railway run --service SproutRoute -- node scripts/refresh-attractions.ts --city Seattle
   ```
3. Apply for the same city and read the `refresh_log` rows it wrote.

   ```bash
   railway run --service SproutRoute -- node scripts/refresh-attractions.ts --city Seattle --apply
   ```
4. Backfill in slices, stalest first: `--limit 300 --apply`, repeated until `last_verified_at` is set on every
   row. The first pass is one Google request per row (about 2,470).
5. Weekly cron on Railway: `node scripts/refresh-attractions.ts --apply`. The default slice is a quarter of
   the table, so every row is re-checked within 30 days.

## Cost

- Google: one request per row checked. Rating and hours are billed at a higher Places tier than basic fields,
  so check your Places pricing before step 4.
- Claude: a short prompt and a short reply per row, once per row (rows with a current assessment are skipped).
  Well under a cent per row at Haiku 5.5 prices. The ops dashboard shows the exact figure under "AI Spend by
  Model" once the calls are recorded.

## Not done yet

- Part C: trending layer.
- Part D: itinerary generation reading only active, grounded rows, with the candidate list and prompt rules.
- The existing retrieval filter (`verified` and not `generated`) still returns no rows. It is changed in Part D.
