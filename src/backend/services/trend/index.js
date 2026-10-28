/**
 * Trend data providers. Scoring talks to this interface only, so the data source is a configuration choice:
 *   fetchLocationPosts({ locationId, limit, sinceDays })  recent posts tagged at a place
 *   fetchHashtagPosts(tag, { limit })                     recent posts under a hashtag
 * Select one with TREND_PROVIDER (apify | hikerapi).
 */
import { createApifyProvider } from "./apify.js";
import { createHikerApiProvider } from "./hikerapi.js";

export { TrendProviderUnsupported } from "./common.js";

function need(env, key) {
  if (!env[key]) throw new Error(`${key} is required for TREND_PROVIDER=${env.TREND_PROVIDER}`);
  return env[key];
}

export function createTrendProvider(env = process.env, deps = {}) {
  const name = (env.TREND_PROVIDER || "").toLowerCase().trim();
  if (!name) throw new Error("TREND_PROVIDER is not set (apify | hikerapi)");
  if (name === "apify") return createApifyProvider({ token: need(env, "APIFY_TOKEN"), ...deps });
  if (name === "hikerapi") return createHikerApiProvider({ accessKey: need(env, "HIKERAPI_ACCESS_KEY"), ...deps });
  throw new Error(`Unknown TREND_PROVIDER "${name}" (apify | hikerapi)`);
}
