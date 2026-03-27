// affiliateLinks.js — Builds affiliate-tagged search URLs for packing list items.
// Sanitizes AI-generated searchQuery before URL construction.

const STORES = [
  { store: "Amazon",  baseUrl: "https://www.amazon.com/s",  paramKey: "k",          color: "#ff9900" },
  { store: "Walmart", baseUrl: "https://www.walmart.com/search", paramKey: "q",     color: "#0071dc" },
  { store: "Target",  baseUrl: "https://www.target.com/s",  paramKey: "searchTerm", color: "#cc0000" },
];

const MAX_QUERY_LENGTH = 100;

function sanitizeQuery(raw) {
  if (!raw || typeof raw !== "string") return "";
  return raw
    .replace(/<[^>]*>/g, "")      // strip HTML tags
    .replace(/\s+/g, " ")         // collapse whitespace
    .trim()
    .slice(0, MAX_QUERY_LENGTH);
}

/**
 * Build affiliate-tagged search URLs for the given search query.
 * @param {string|null} searchQuery - AI-generated product search query
 * @returns {Array<{store: string, url: string, color: string}>}
 */
export function buildShopLinks(searchQuery) {
  const query = sanitizeQuery(searchQuery);
  if (!query) return [];

  const encoded = encodeURIComponent(query);
  const amazonTag = process.env.AMAZON_AFFILIATE_TAG;

  return STORES.map(({ store, baseUrl, paramKey, color }) => {
    let url = `${baseUrl}?${paramKey}=${encoded}`;
    if (store === "Amazon" && amazonTag) {
      url += `&tag=${encodeURIComponent(amazonTag)}`;
    }
    return { store, url, color };
  });
}
