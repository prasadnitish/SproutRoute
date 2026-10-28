import { TrendProviderUnsupported, count, ensureOk, finishPost, toIso } from "./common.js";

// Output shape from the actor's page: createdAt, likeCount, commentCount, owner.username,
// location.id and location.name. It returns no view counts. Pricing: $0.025 per location plus
// $0.0005 per post beyond 50 free per location (checked 2026-10-27).
const DEFAULT_ACTOR = "apidojo~instagram-location-scraper-api";

export function createApifyProvider({ token, actor = DEFAULT_ACTOR, fetchFn = globalThis.fetch, now = Date.now }) {
  let requests = 0;
  let raw = [];

  function mapItem(item) {
    return finishPost({
      url: item.url || (item.code ? `https://www.instagram.com/p/${item.code}/` : null),
      timestamp: toIso(item.createdAt),
      likes: count(item.likeCount),
      comments: count(item.commentCount),
      views: count(item.playCount ?? item.viewCount),
      author: item.owner?.username || null,
      location_id: item.location?.id ? String(item.location.id) : null,
      location_name: item.location?.name || null,
    });
  }

  return {
    name: "apify",
    stats: () => ({ requests }),
    /** Raw response bodies since the last call, before any mapping or filtering. */
    takeRaw() {
      const taken = raw;
      raw = [];
      return taken;
    },

    async fetchLocationPosts({ locationId, limit = 50, sinceDays = 7 }) {
      requests += 1;
      const until = new Date(now() - sinceDays * 86400000).toISOString().slice(0, 10);
      const response = await fetchFn(`https://api.apify.com/v2/acts/${actor}/run-sync-get-dataset-items`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ locationIds: [String(locationId)], maxItems: limit, until }),
      });
      await ensureOk(response, "apify");
      const items = await response.json();
      raw.push(items);
      return (Array.isArray(items) ? items : []).map(mapItem).filter(Boolean);
    },

    async fetchHashtagPosts() {
      throw new TrendProviderUnsupported("apify", "fetchHashtagPosts (set up a hashtag actor first)");
    },
  };
}
