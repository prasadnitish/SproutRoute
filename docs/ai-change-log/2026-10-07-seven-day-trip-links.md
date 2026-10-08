# Seven-day itinerary links

Added explicit snapshot-link creation from completed itineraries, fixed seven-day server expiry, creator revocation and a read-only recipient view that never regenerates the trip. The sharing panel and recipient view disclose public access and exclusion of the original prompt/imported profile.

Public result fields are allowlisted in the browser and server. Read and management capabilities are separate; only token hashes are persisted. The new table uses RLS and service-role-only privileges. Shared pages disable analytics and prevent caching/indexing/referrer leakage.

Validation: 592 unit/integration tests passed and the frontend build passed. Browser coverage adds five sharing flows, including identical saved itinerary loading with no AI requests. Production validation and CI results are recorded in the pull request.

Apply the additive migration before release. Expired links are denied immediately; automatic physical row cleanup remains separate retention work.
