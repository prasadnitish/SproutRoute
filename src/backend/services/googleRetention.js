/**
 * Deletes Google Maps content the Google Maps Platform terms do not let us keep.
 *
 * Service Specific Terms 14.3: Places latitude and longitude may be cached for up to 30 consecutive calendar days,
 * then must be deleted. Place ids may be kept (General Service Term 3). Rows whose coordinates came from Wikidata
 * (wikidata_id set) are not Google content and are left alone. Verification-cache rows past their expiry go too.
 */
import { log } from "../utils/logger.js";

export const GOOGLE_COORDS_MAX_DAYS = 30;

export async function purgeExpiredGoogleContent(admin, { now = Date.now() } = {}) {
  const cutoff = new Date(now - GOOGLE_COORDS_MAX_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const coords = await admin
    .from("city_attractions")
    .update({ lat: null, lon: null }, { count: "exact" })
    .is("wikidata_id", null)
    .not("google_place_id", "is", null)
    .not("lat", "is", null)
    .lt("last_verified_at", cutoff);
  if (coords.error) throw coords.error;

  const cache = await admin
    .from("attraction_verification_cache")
    .delete({ count: "exact" })
    .lt("expires_at", new Date(now).toISOString());
  if (cache.error) throw cache.error;

  return { coordinatesCleared: coords.count ?? 0, cacheRowsDeleted: cache.count ?? 0, cutoff };
}

/** Runs the purge at start-up and then once a day. Failures are logged, never thrown. */
export function scheduleGoogleRetention(getAdmin, { intervalMs = 24 * 60 * 60 * 1000 } = {}) {
  const run = async () => {
    try {
      const admin = getAdmin();
      if (!admin) return;
      log.info("google-retention:purged", await purgeExpiredGoogleContent(admin));
    } catch (error) {
      log.error("google-retention:failed", { error: error.message });
    }
  };
  run();
  const timer = setInterval(run, intervalMs);
  timer.unref?.();
  return timer;
}
