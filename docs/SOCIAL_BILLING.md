# Social Save billing in v3 staging

AI extraction requires a registered account. The account-wide allowance covers web, iOS and the private MCP connector. Planning, ordinary shares, manual place saves, confirmed places and trip libraries use the existing free paths. No backend operation charges a payment method.

## Staging setup

Apply migrations through 042 to an isolated staging database. Enable `V3_SOCIAL_BILLING_ENABLED=true` on the Railway environment named `staging`. Local development also supports this flag outside production. Without it, AI extraction returns 503 and ordinary queueing works. An offline developer can explicitly set `V3_LOCAL_EXTRACTION_PREVIEW=true` for an unmetered local extractor. Keep production on the existing release until prices, provider accounts and Sandbox verification are approved.

Provisional defaults are three successful AI imports per UTC calendar month for Free and 30 for Premium. Set `V3_FREE_EXTRACTIONS` and `V3_PREMIUM_EXTRACTIONS` in staging to test different allowances. Family members with independently verified Family Sharing entitlements each receive their account allowance. Upgrading within a month increases the limit and retains usage. Downgrading preserves saved data and clamps remaining work to zero if the account has already used its free allowance. Clients render localized prices and offer eligibility from the store.

Configure a dedicated sandbox RevenueCat project with entitlement `premium`, App Store subscriptions, and the signed-in Supabase user UUID as the App User ID. Supply server-only `REVENUECAT_SECRET_API_KEY` (v1) and a random `REVENUECAT_WEBHOOK_AUTH` matching the entire configured Authorization header. Configure `POST /api/v1/billing/revenuecat` for SANDBOX events including transfers. The handler verifies the header, reads current subscriber information from RevenueCat, checks the App Store sandbox subscription, refund and grace status, then persists provider observation time and expiry. Repeated or out-of-order deliveries cannot overwrite a newer observation. Production purchases are outside this integration.

Configure a daily staging cron running `node scripts/reconcile-social-billing.mjs`. It refreshes known customer mirrors, trims extraction replay data older than the previous UTC calendar month, logs aggregate counts, and exits nonzero on failure. Retry failed runs. Purchase/restore calls the authenticated refresh endpoint to recover first purchases missed by webhooks. An interrupted first purchase without a webhook or refresh requires Restore Purchases. After merging accounts, restore subscriptions under the destination account. The merge transfers usage and resolves entitlement ownership through RevenueCat.

## API contract

- Authenticated `GET /api/v1/social-save/billing` returns `{plan,limit,freeLimit,premiumLimit,used,remaining,resetsAt}`. Remaining includes in-flight reservations. Used counts completed requests with one or more candidates. Refresh with `POST /api/v1/social-save/billing/refresh` after purchase or restore. Both routes return 404 when staging billing is disabled.
- `POST /api/v1/social-save/extract` accepts `{requestId,source,text?}`. Keep the same UUID across retries of the same operation. The private MCP tool requires the same key when `extractNow=true`. A server transaction reserves capacity, permits only one concurrent execution per key, and replays completed responses. Empty or failed extractions consume zero. A lost worker's reservation expires after ten minutes. A matching retry after a lost commit recovers the stored result. Plain MCP queues never reserve.
- Exhaustion returns HTTP 429 with `EXTRACTION_LIMIT_REACHED`. Active duplicates return 409 `EXTRACTION_IN_PROGRESS`. Changed input for an existing key returns 409 `EXTRACTION_ID_CONFLICT`. MCP returns structured tool errors. Saved items remain available after any denial. Rate and provider spend limits apply independently.
- Billing tables and functions allow only the backend service role. Account deletion cascades to both. Account merge retains completed usage, waits for active source reservations, and requires fresh identity proof.

## Verification

Run `npm test` and the disposable two-or-more-connection PostgreSQL check, `node scripts/verify-billing-postgres.mjs /absolute/path/to/embedded-postgres/dist/index.js`. Install embedded-postgres in a temporary directory for that check. Use a sandbox family, restore, trial, cancellation, refund and transfer before enabling a paid offering.

Provider references: [RevenueCat webhooks](https://www.revenuecat.com/docs/integrations/webhooks), [subscriber model](https://www.revenuecat.com/docs/api-v1/customer-info-model).


## Daily reporting

Migration 042 starts transactional counts of newly saved account trips, accounts saving a trip, confirmed place inserts, and successful charged extractions. A marker records the installation day in UTC. Earlier days have unknown coverage. Edits and replayed requests do not add units. Deleting and later creating a new save counts a new operation. Guest and local-only saves remain outside these figures. Only a registered account’s latest save date is retained for deduplication. Account deletion removes this state. The historical counts contain no account identifiers or trip content.

An extraction receipt carries the grounder’s count of distinct supported claims per candidate. A confirmed candidate, its quoted tip, and its quoted family detail can contribute up to three claims. Identical claims within the candidate count once. The daily total stays unknown when an older server finalized a successful extraction without that count. The first UTC day has partial coverage from migration time. Staging and production have independent coverage and totals.

For hosted account and connector testing without AI spend, set `V3_DISABLE_MODEL_CALLS=true` on the Railway environment named `staging`. The server can boot without a provider key, Social Save returns `503 EXTRACTION_UNAVAILABLE` before reserving allowance, and manual inbox saves remain available. Remove the flag only when staging has approved provider credentials and budget.
