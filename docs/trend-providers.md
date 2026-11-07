# Trend data providers: what is verified and how to test them

Checked 2026-10-27 and 2026-10-28 against each provider's own pages, plus independent search where a provider's
page was silent. A claim marked unverified was in the earlier write-up and I could not confirm it from a
primary source.

## What each provider actually offers for "recent posts at a place"

| Provider | Place-based posts | Price (verified) | Notes |
|---|---|---|---|
| **Apify**, actor `apidojo/instagram-location-scraper-api` | Yes. Input: location ids or location URLs, `maxItems`, an `until` date. | $0.025 per location plus $0.0005 per post beyond 50 free per location. Free plan: 5 runs a month, 10 items each. | Returns `createdAt`, `likeCount`, `commentCount`, owner, `location.id/name/lat/lng`. **No view counts.** No login or cookies. Several other location actors exist with different prices and login requirements. |
| **HikerAPI** | Yes: 7 location endpoints and 3 hashtag endpoints. | From $0.0006 per request ($0.60 per 1,000), 100 free, prepaid, funds do not expire. Failed 5xx calls are not billed. | Posts per page are not published. Field names unverified (see below). |
| **Bright Data** | Not confirmed. The documented Instagram posts input is a URL (profile or post). A hashtag scraper product page exists but its input is vague. | $1.50 per 1,000 records, first 5,000 records a month free. | Post records include a `location` field. Delivery by webhook or API. |
| **ScraperSocial** | **Unverified.** Its site lists Instagram profile, reel, post and comment endpoints; no location endpoint is mentioned and I could not find its docs. | $5 a month for 1,000 credits, 100 free. | The earlier write-up called it place-native. Its own site does not say so. |
| **ScrapeCreators** | **Unverified.** No posts-by-location endpoint found. Its hashtag endpoint returns Google-indexed public posts, not Instagram's hashtag feed. | Credits never expire. $47 for 25,000 ($1.88 per 1,000); $497 for 500,000 ($0.99 per 1,000). Its pricing page URL returned 404, so these figures are from a third-party review. | One review says Instagram calls can cost several credits each. |
| **EnsembleData** | Reported by a third-party tool listing (user, hashtag and location search); units per request not found. | $100 a month for 1,500 units a day; $200 for 5,000; $400 for 11,000. Free: 50 units a day. | The "10,000 posts for $100" figure depends on units per post, which I could not confirm. |

## Rough weekly cost for 100 tracked places (assumptions in brackets)

- Apify: 100 x $0.025 = **$2.50** a week for up to 50 posts each (about $11 a month). With 100 posts each, $5.
- HikerAPI: [page size unknown; assuming 20 to 30 posts per request] 2 to 3 requests per place = about **$0.12 to
  $0.18** a week.

So Apify is not meaningfully more expensive at this scale. The difference only matters at thousands of places.

## What I built, so you can test with real keys

- A common provider interface (`src/backend/services/trend/`): `fetchLocationPosts` and `fetchHashtagPosts`,
  returning one normalized post shape. `TREND_PROVIDER` picks the provider. Adapters for Apify and HikerAPI.
- `scripts/bench-trend-providers.mjs`: pulls the same locations from each provider and reports posts returned,
  newest and median post age, how many fall in the last 7 days, field coverage (views, author, location id),
  latency, request count, estimated cost per post, and how many posts two providers share.
- Scoring (`scoring.js`): velocity `(likes + 2*comments + views/50) / hours since post`, weighted by distinct
  authors and week-over-week change, halved each week without new posts.

**Verified on 2026-10-28 for locations.** The HikerAPI paths and field names came from its MCP tool names and the
Instagram-client convention because its Swagger page could not be read; the first live location call matched them.
The hashtag endpoint is still unverified. The adapter accepts several response
shapes, and `--save-raw` keeps every raw response so the mapping can be corrected from real data.

## Measured on 2026-10-28 (3 Seattle places, limit 50, last 7 days)

| Place | Provider | Posts | Newest | Median age | Views | Cost |
|---|---|---|---|---|---|---|
| Seattle Aquarium | Apify | 50 | 0.4 h | 62 h | none | $0.025 |
| Seattle Aquarium | HikerAPI | 50 | 0.4 h | 62 h | yes | $0.0006 |
| Pike Place Market | Apify | 50 | 0 h | 8.8 h | none | $0.025 |
| Pike Place Market | HikerAPI | 50 | 0 h | 8.8 h | yes | $0.0006 |
| Space Needle | Apify | 50 | 0.3 h | 35 h | none | $0.025 |
| Space Needle | HikerAPI | 50 | 0.3 h | 35 h | yes | $0.0006 |

- The HikerAPI location endpoint, header and field mapping worked on the first live call: one request returned 50
  posts with time, counts, views, author and location. The two providers returned the same posts (overlap 100%,
  100% and 96%). The hashtag endpoint was not tested.
- HikerAPI is about 40 times cheaper per call and the only one with view counts. Use it as `TREND_PROVIDER`.
- **A 50-post limit is not a week for busy places.** At Pike Place Market the median post is under 9 hours old, so
  50 posts cover about a day. The job now asks for up to 200 posts per seed within 7 days; HikerAPI pages until it
  reaches the window or the limit.

## To run the test

1. Create a free Apify account (copy the API token) and a HikerAPI account (100 free requests).
2. Pick three Seattle places and find their Instagram location ids: search the place on instagram.com, open its
   location page, and take the number from `/explore/locations/<id>/`.
3. Copy `scripts/trend-bench-locations.example.json`, fill in the ids, and run:

   ```bash
   APIFY_TOKEN=... HIKERAPI_ACCESS_KEY=... node scripts/bench-trend-providers.mjs \
     --providers apify,hikerapi --locations my-locations.json --save-raw ./bench-raw
   ```

What to look for: how many posts each returns for the last 7 days, whether views and authors are present
(Apify has no views), how much the two overlap, and the cost per post.

## Legal and data handling

- In Meta v. Bright Data (N.D. Cal., January 2024) the judge held Meta's terms did not bar scraping public data
  while logged out, and Meta dropped the case. That is one district court's ruling, not binding precedent, and it
  does not cover logged-in scraping. Prefer providers that work without an Instagram login or your account.
- Store only what scoring needs: post link, time, counts, a hash of the author handle, and the place. Not
  captions, images or handles. Handles are personal data and the score only needs the count of distinct authors.
- The official Instagram Graph API has no location search, so it cannot do this job.

## Not decided yet

TikTok. It may be a better signal for attractions, but I have not verified any programmatic source for it.
Add it once Instagram data has proven the idea.
