import { count, ensureOk, finishPost, toIso } from "./common.js";

// Pricing: from $0.0006 per request, prepaid, 100 free requests (checked 2026-10-27).
// The Swagger reference could not be read, so the paths come from the HikerAPI MCP tool names
// (get_v1_location_medias_recent_chunk, hashtag top and recent) and the field names from the
// Instagram-client convention (pk, code, taken_at, like_count, comment_count, play_count, user, location).
// Both are unverified until the first live call; `scripts/bench-trend-providers.mjs --save-raw` keeps the raw
// responses so this mapping can be corrected from real data.
const BASE = "https://api.hikerapi.com";
const MAX_PAGES = 5;

function unwrap(body) {
  if (Array.isArray(body)) {
    if (body.length === 2 && Array.isArray(body[0])) return { items: body[0], cursor: body[1] || null };
    return { items: body, cursor: null };
  }
  const inner = body?.response && typeof body.response === "object" ? body.response : body || {};
  const items = inner.items ?? inner.medias ?? body?.items ?? body?.medias ?? [];
  const cursor = inner.next_max_id ?? inner.end_cursor ?? body?.next_max_id ?? body?.end_cursor ?? null;
  return { items: Array.isArray(items) ? items : [], cursor: cursor || null };
}

function mapItem(item) {
  return finishPost({
    url: item.code ? `https://www.instagram.com/p/${item.code}/` : null,
    timestamp: toIso(item.taken_at),
    likes: count(item.like_count),
    comments: count(item.comment_count),
    views: count(item.play_count ?? item.view_count ?? item.video_view_count),
    author: item.user?.username || null,
    location_id: (item.location?.pk ?? item.location?.id) != null ? String(item.location.pk ?? item.location.id) : null,
    location_name: item.location?.name || null,
  });
}

export function createHikerApiProvider({ accessKey, fetchFn = globalThis.fetch, base = BASE }) {
  let requests = 0;

  async function pages(path, params, limit) {
    const posts = [];
    let cursor = null;
    for (let page = 0; page < MAX_PAGES && posts.length < limit; page += 1) {
      const query = new URLSearchParams({ ...params, ...(cursor ? { max_id: cursor } : {}) });
      requests += 1;
      const response = await fetchFn(`${base}${path}?${query}`, { method: "GET", headers: { "x-access-key": accessKey } });
      await ensureOk(response, "hikerapi");
      const { items, cursor: next } = unwrap(await response.json());
      posts.push(...items.map(mapItem).filter(Boolean));
      if (!next) break;
      cursor = next;
    }
    return posts.slice(0, limit);
  }

  return {
    name: "hikerapi",
    stats: () => ({ requests }),
    fetchLocationPosts: ({ locationId, limit = 50 }) =>
      pages("/v1/location/medias/recent/chunk", { location_pk: String(locationId) }, limit),
    fetchHashtagPosts: (tag, { limit = 50 } = {}) =>
      pages("/v1/hashtag/medias/recent/chunk", { name: String(tag).replace(/^#/, "") }, limit),
  };
}
