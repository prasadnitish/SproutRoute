# Shared itinerary links

Share → Create 7-day link saves a frozen, read-only copy of the completed itinerary. Opening `/s#<token>` fetches that result and never calls parsing, generation, packing, safety or Places enrichment endpoints.

The public-access notice is visible before creation and on the shared view: **Public link: anyone with the link can view this itinerary. The original prompt and imported profile are not shared.** The snapshot includes dates, destination, itinerary/schedule, route stops and saved weather. It excludes raw input, imported profiles, traveler identities, authentication state, packing/checkmarks and safety/profile context. Supporting generated itinerary text can still reflect the travel preferences that shaped it.

`src/shared/shareSnapshot.js` positively allowlists result fields in both browser and server. Snapshots are versioned and limited to 128 KiB. Database rows enforce a seven-day lifespan from creation; server reads reject expired/revoked links regardless of browser state. A view already open also clears its displayed snapshot at expiry. Previously copied or downloaded information cannot be recalled.

## API

- `POST /api/v1/trip/shares`: `{tripData}` → 201 `{token, ownerToken, createdAt, expiresAt}`. No automatic POST retries. Available after itinerary completion in the UI.
- `GET /api/v1/trip/shares/view`: `x-trip-share-token` → `{snapshot, createdAt, expiresAt}`. Unavailable, expired and revoked links return the same 404 error envelope.
- `DELETE /api/v1/trip/shares`: both `x-trip-share-token` and `x-trip-share-owner-token` → 204. Only the creator capability can revoke a link; repeated valid revocations succeed.

Tokens are random 256-bit capabilities. Only SHA-256 hashes are stored in the database. Public URLs contain the read token in a fragment to keep it out of server request paths and referrers; API requests carry it in a header. Shared pages disable PostHog tracking, use `no-store`, `no-referrer` and `noindex` headers. Share-link inputs are excluded from autocapture. Public access means anyone possessing the URL can open or forward it; unlisted links are not recipient-specific authorization.

The creator token stays in the original browser until expiry. Stop sharing works in the creation dialog and when opening the link from that browser. Clearing browser storage loses that management capability; automatic expiry still applies. Cross-device ownership/invites and collaborative editing are separate features.

## Deployment and tests

Apply the additive `seven_day_trip_shares` migration before deploying the new code. `trip_shares` has RLS enabled and all `anon`, `authenticated` and `PUBLIC` privileges revoked; only the backend service role accesses it. No unrelated table permissions change. Rollback can leave this protected table in place.

Unit/integration checks cover privacy filtering, the exact expiry boundary, token hashing, creator-only revocation, safe failures, payload limits and API contracts. Browser checks cover disclosure, link creation, read-only same-itinerary loading with no generation calls, expiry/error states and revocation. Expiry blocks access; physical cleanup of expired rows is a future retention task.
