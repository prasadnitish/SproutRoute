// Weekly trend job: score which attractions are being posted about right now.
//
// Dry run by default: it calls the trend provider, Claude and Google, but writes nothing.
//
//   node scripts/run-trend-job.ts                      dry run for every city that has seeds
//   node scripts/run-trend-job.ts --city Seattle       one city
//   node scripts/run-trend-job.ts --apply              write posts, new attractions and scores
//
// Weekly cron: `node scripts/run-trend-job.ts --apply`.
//
// Needs Node 22.18 or newer (runs TypeScript directly), SUPABASE_URL, SUPABASE_SERVICE_KEY,
// TREND_PROVIDER (+ APIFY_TOKEN or HIKERAPI_ACCESS_KEY), GOOGLE_PLACES_API_KEY and ANTHROPIC_API_KEY.
// Set TREND_AUTHOR_SALT to a private random string so stored author hashes cannot be looked up from a handle.
import { getSupabaseAdmin } from "../src/backend/utils/supabaseClient.js";
import { createTrendProvider } from "../src/backend/services/trend/index.js";
import { createVenueClassifier } from "../src/backend/services/trend/venueClassifier.js";
import { runTrendJob } from "../src/backend/services/trend/trendJob.js";

const flag = (name: string): boolean => process.argv.includes(`--${name}`);
const option = (name: string): string | undefined => {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
};

const admin = getSupabaseAdmin();
const provider = createTrendProvider();
const apply = flag("apply");

let cityId: string | null = null;
const cityName = option("city");
if (cityName) {
  const { data, error } = await admin.from("cities").select("id").ilike("city_name", cityName).limit(2);
  if (error) throw new Error(`city lookup failed: ${error.message}`);
  if (!data?.length) throw new Error(`no city named "${cityName}"`);
  if (data.length > 1) throw new Error(`"${cityName}" matches more than one city; use the exact name`);
  cityId = data[0].id;
}

console.log(JSON.stringify({ event: "trend_start", provider: provider.name, apply, cityId }));
const summary = await runTrendJob({
  admin,
  provider,
  classifier: createVenueClassifier(),
  apply,
  cityId,
  onProgress: (p: { city?: string; seed?: string; error?: string }) => console.error(JSON.stringify({ event: "trend_warning", ...p })),
});
console.log(JSON.stringify({ event: "trend_done", provider: provider.name, providerRequests: provider.stats?.().requests, ...summary }));
process.exit(summary.errors > 0 && summary.scored === 0 && summary.postsStored === 0 ? 1 : 0);
