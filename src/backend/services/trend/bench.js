/** Pure helpers for comparing trend providers on the same places. Used by scripts/bench-trend-providers.mjs. */

// Dollars. null means the price is not confirmed. Checked 2026-10-27 against each provider's own page.
export const PROVIDER_PRICING = {
  apify: ({ locations, posts }) => 0.025 * locations + 0.0005 * Math.max(0, posts - 50 * locations),
  hikerapi: ({ requests }) => 0.0006 * requests,
};

export function estimateCost(provider, usage) {
  const price = PROVIDER_PRICING[provider];
  return price ? Math.round(price(usage) * 1e6) / 1e6 : null;
}

const FIELDS = ["timestamp", "likes", "comments", "views", "author", "location_id"];

export function summarizeProviderRun({ posts, ms, requests, now = Date.now(), costUsd = null }) {
  const ages = posts
    .map((post) => (Date.parse(post.timestamp) ? (now - Date.parse(post.timestamp)) / 3600000 : null))
    .filter((age) => age !== null)
    .map((age) => Math.max(0, age))
    .sort((a, b) => a - b);
  const mid = Math.floor(ages.length / 2);
  const median = ages.length ? (ages.length % 2 ? ages[mid] : (ages[mid - 1] + ages[mid]) / 2) : null;
  const coverage = Object.fromEntries(
    FIELDS.map((field) => [field, posts.length ? posts.filter((p) => p[field] !== null && p[field] !== undefined).length / posts.length : 0]),
  );
  return {
    posts: posts.length,
    requests,
    ms,
    newestAgeHours: ages.length ? Math.round(ages[0] * 10) / 10 : null,
    medianAgeHours: median === null ? null : Math.round(median * 10) / 10,
    postsLast7Days: ages.filter((age) => age <= 168).length,
    coverage,
    costUsd,
    costPerPostUsd: costUsd !== null && posts.length ? Math.round((costUsd / posts.length) * 1e6) / 1e6 : null,
  };
}

// Instagram shortcodes are case-sensitive, so only the host is lowercased.
function normalizeUrl(url) {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.host.toLowerCase()}${parsed.pathname.replace(/\/+$/, "")}`;
  } catch {
    return String(url).split(/[?#]/)[0].replace(/\/+$/, "");
  }
}

export function compareProviders(byProvider) {
  const urls = Object.fromEntries(Object.entries(byProvider).map(([name, posts]) => [name, new Set(posts.map((p) => normalizeUrl(p.url)))]));
  const names = Object.keys(urls);
  const overlap = {};
  for (let i = 0; i < names.length; i += 1) {
    for (let j = i + 1; j < names.length; j += 1) {
      const shared = [...urls[names[i]]].filter((u) => urls[names[j]].has(u)).length;
      const union = urls[names[i]].size + urls[names[j]].size - shared;
      overlap[`${names[i]}|${names[j]}`] = { shared, union, jaccard: union ? Math.round((shared / union) * 1e4) / 1e4 : 0 };
    }
  }
  const onlyIn = Object.fromEntries(names.map((name) => [
    name,
    [...urls[name]].filter((u) => names.every((other) => other === name || !urls[other].has(u))),
  ]));
  return { overlap, onlyIn };
}
