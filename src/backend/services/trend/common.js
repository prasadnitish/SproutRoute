/**
 * Shared pieces of the trend providers. Every provider returns posts in one normalized shape so scoring
 * never depends on which data source is configured:
 *   { url, timestamp (ISO 8601), likes, comments, views, author, location_id, location_name }
 */
export class TrendProviderUnsupported extends Error {
  constructor(provider, method) {
    super(`${provider} does not support ${method}`);
    this.name = "TrendProviderUnsupported";
  }
}

export function toIso(value) {
  if (value === null || value === undefined || value === "") return null;
  const numeric = typeof value === "number" || /^\d+(\.\d+)?$/.test(String(value)) ? Number(value) : null;
  const ms = numeric !== null ? (numeric < 1e12 ? numeric * 1000 : numeric) : Date.parse(value);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

export const count = (value) => (Number.isFinite(value) ? value : null);

/** A post without a link or a time cannot be deduplicated or aged, so it is dropped rather than guessed. */
export function finishPost(post) {
  return post.url && post.timestamp ? post : null;
}

export async function ensureOk(response, provider) {
  if (!response.ok) throw new Error(`${provider} request failed with HTTP ${response.status}`);
}
