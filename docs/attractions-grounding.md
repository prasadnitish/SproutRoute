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

## How generation uses the table (Part D)

- `getPlanningCandidates` reads `city_attractions` rows that are `status = 'active'`, have a Google place id and
  coordinates, and are not rejected, closed or adults-only (`isGroundedRow`). Rows a model wrote and nothing
  verified never qualify, whatever their other columns say. The old filter (`verified` and not `generated`)
  returned no rows and is gone.
- Rows are ranked by the existing family scoring plus review volume and rating. Up to 1 in 6 slots (at most 3)
  go to trending venues (`trend_score > 0`, refreshed in the last 14 days), replacing the lowest ranked
  evergreen ones. Formal fine dining is dropped when a child is under 8 unless the traveler asked for it.
- A city with fewer than 8 grounded rows is filled once from Google Places (three family-phrased searches,
  open places rated 4.0 or higher with at least 100 reviews, no bars, casinos, hotels or restaurants). The fill
  costs about $0.10 per city. A failed or empty fill is not retried for 6 hours. Filled rows get their
  family-fit judgment from the next refresh run.
- The prompt lists each stop with rating, price, typical hours and closed days, duration and a trending flag.
  Rules: never invent a venue, do not schedule a place on a day it is closed, 45 minutes to 3 hours per stop,
  no formal fine dining under age 8 unless asked, timing tips must agree with the scheduled time.
- Each suggested activity that matches a row gets `grounded`, `placeId`, `rating`, `ratingCount`, `priceLevel`,
  `photoUrl` (the existing `/api/v1/places/photo` proxy) and `trending`. The plan gets
  `grounding: { total, matched, ratio }`, and the ratio is logged as `trip-plan:grounding` with the names that
  did not match. Matched stops are not written back to the table.

Limits: the rule against invented venues is in the prompt and measured, not enforced. A stop that matches no
row is flagged `grounded: false` and kept. Meals are still chosen by the model. Hours are the weekly pattern
Google returns, not holiday exceptions.

## Trend layer (Part C)

`scripts/run-trend-job.ts` scores which attractions are being posted about now. Code and migration 031 are in
place; nothing has run against production.

1. Apply `20261029_031_trend_layer.sql` (adds `city_seeds`, `trend_posts`, and two `refresh_log` change types).
2. Add seeds for a city. A seed is an Instagram location id or a hashtag. Example for Seattle:

   ```sql
   insert into city_seeds (city_id, kind, value, label)
   select id, 'location', v.value, v.label
   from cities, (values ('141795792557', 'Seattle Aquarium'), ('86493431461', 'Pike Place Market'), ('88603851976', 'Space Needle')) as v(value, label)
   where city_name = 'Seattle' and country_code = 'US';
   ```
3. Set `TREND_PROVIDER` (`apify` or `hikerapi`) with its key, and `TREND_AUTHOR_SALT` (any private random string).
4. Dry run, then apply:

   ```bash
   railway run --service SproutRoute -- node scripts/run-trend-job.ts --city Seattle
   railway run --service SproutRoute -- node scripts/run-trend-job.ts --city Seattle --apply
   ```
5. Weekly cron: `node scripts/run-trend-job.ts --apply`.

What it does: fetches the last 7 days of posts per seed; drops giveaway, ad and real-estate posts; groups posts
by location (captions are used only for posts with no location); asks Claude Haiku 5.5 which venues a family
could visit; resolves new venues through Google Places; links them to an existing row by place id or adds a
`source_type = 'trending'` row; stores the post link, time, counts, an HMAC of the author and the place (never
captions or handles); and writes `trend_score` and `trend_updated_at`. A venue with no new posts loses half its
score per whole week since `trend_decayed_at` (the decay checkpoint). `trend_updated_at` stays the date of the last
real observation, so decay cannot make old activity look fresh, and a venue is not marked trending after 14 days
(`isTrending`). If any
fetch or the classifier fails for a city, that city's scores are left alone that week.

Re-running with the same data changes nothing (posts keyed by link, venues by place id, mapped venues are not
looked up or classified again, decay is measured from when the score was set). At most 20 new venues are
resolved per city per run, so Google cost is bounded at about $0.04 per new venue.

HikerAPI's location endpoint was verified live on 2026-10-28 (see `docs/trend-providers.md`); its hashtag endpoint was not.

## Not done yet

- Trend seeds for any city, and a first production run.
