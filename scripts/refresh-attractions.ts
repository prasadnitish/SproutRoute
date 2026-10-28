// Re-verify a slice of city_attractions against Google Places and fill in Claude's family-fit judgment.
//
// Dry run by default: it reads and calls Google, but writes nothing and makes no Claude calls.
//
//   node scripts/refresh-attractions.ts                       dry run on the stalest quarter of the table
//   node scripts/refresh-attractions.ts --city Seattle        dry run for one city
//   node scripts/refresh-attractions.ts --limit 25 --apply    write 25 rows
//   node scripts/refresh-attractions.ts --apply --no-fit      Places only, no Claude
//
// Weekly cron: `node scripts/refresh-attractions.ts --apply`. The default slice is a quarter of the table,
// stalest first, so every row is re-checked at least every 30 days.
//
// Needs Node 22.18 or newer (runs TypeScript directly) and SUPABASE_URL, SUPABASE_SERVICE_KEY,
// GOOGLE_PLACES_API_KEY and, with fit, ANTHROPIC_API_KEY. Uses erasable TypeScript syntax only.
import { getSupabaseAdmin } from "../src/backend/utils/supabaseClient.js";
import { refreshAttractions } from "../src/backend/services/attractionRefresh.js";

function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function option(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

const admin = getSupabaseAdmin();
const apply = flag("apply");
const withFit = !flag("no-fit");

let cityId: string | null = null;
const cityName = option("city");
if (cityName) {
  const { data, error } = await admin.from("cities").select("id, city_name").ilike("city_name", cityName).limit(2);
  if (error) throw new Error(`city lookup failed: ${error.message}`);
  if (!data?.length) throw new Error(`no city named "${cityName}"`);
  if (data.length > 1) throw new Error(`"${cityName}" matches more than one city; use the exact name`);
  cityId = data[0].id;
}

const { count, error: countError } = await admin.from("city_attractions").select("id", { count: "exact", head: true });
if (countError) throw new Error(`count failed: ${countError.message}`);
const limit = Number(option("limit")) || Math.ceil((count ?? 0) / 4) + 1;

console.log(JSON.stringify({ event: "refresh_start", apply, withFit, cityId, limit, tableRows: count }));
const summary = await refreshAttractions({
  admin,
  apply,
  withFit,
  cityId,
  limit,
  onProgress: (p: { done?: number; total?: number; error?: string }) => {
    if (p.error) console.error(JSON.stringify({ event: "row_error", error: p.error }));
    else if (p.done && p.total && p.done % 25 === 0) console.log(JSON.stringify({ event: "progress", done: p.done, total: p.total }));
  },
});
console.log(JSON.stringify({ event: "refresh_done", ...summary }));
process.exit(summary.errors > summary.scanned / 2 ? 1 : 0);
