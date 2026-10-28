// Pull recent posts for the same Instagram locations from each trend provider and compare them.
//
//   APIFY_TOKEN=... HIKERAPI_ACCESS_KEY=... \
//   node scripts/bench-trend-providers.mjs --providers apify,hikerapi --locations my-locations.json \
//        [--limit 50] [--since-days 7] [--save-raw ./bench-raw] [--out bench-report.json]
//
// Copy scripts/trend-bench-locations.example.json and replace FILL_ME with Instagram location ids: search the
// place on instagram.com, open its location page, and use the number in /explore/locations/<id>/.
// --save-raw writes the provider's original response bodies next to the normalized posts, so a wrong field
// mapping can be fixed from real data. Each location is one request per provider on free tiers.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createTrendProvider } from "../src/backend/services/trend/index.js";
import { summarizeProviderRun, compareProviders, estimateCost } from "../src/backend/services/trend/bench.js";

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
};

const providers = arg("providers", "").split(",").map((p) => p.trim()).filter(Boolean);
const locationsFile = arg("locations");
const limit = Number(arg("limit", 50));
const sinceDays = Number(arg("since-days", 7));
const rawDir = arg("save-raw");
const outFile = arg("out", "bench-report.json");
if (!providers.length || !locationsFile) {
  console.error("usage: bench-trend-providers.mjs --providers apify,hikerapi --locations file.json [--limit 50] [--since-days 7] [--save-raw dir] [--out file]");
  process.exit(2);
}

const locations = JSON.parse(readFileSync(locationsFile, "utf8"));
if (locations.some((l) => !l.locationId || l.locationId === "FILL_ME")) {
  console.error("Replace every FILL_ME with an Instagram location id first.");
  process.exit(2);
}
if (rawDir) mkdirSync(rawDir, { recursive: true });

const report = { ranAt: new Date().toISOString(), limit, sinceDays, locations: [] };
for (const location of locations) {
  const byProvider = {};
  const runs = {};
  for (const name of providers) {
    const provider = createTrendProvider({ ...process.env, TREND_PROVIDER: name });
    const before = provider.stats().requests;
    const started = Date.now();
    try {
      const posts = await provider.fetchLocationPosts({ locationId: location.locationId, limit, sinceDays });
      const requests = provider.stats().requests - before;
      byProvider[name] = posts;
      runs[name] = summarizeProviderRun({
        posts, ms: Date.now() - started, requests,
        costUsd: estimateCost(name, { locations: 1, posts: posts.length, requests }),
      });
      if (rawDir) {
        writeFileSync(`${rawDir}/${name}-${location.locationId}.json`, JSON.stringify({ raw: provider.takeRaw(), normalized: posts }, null, 2));
      }
    } catch (error) {
      byProvider[name] = [];
      runs[name] = { error: error.message };
      if (rawDir) {
        writeFileSync(`${rawDir}/${name}-${location.locationId}.json`, JSON.stringify({ error: error.message, raw: provider.takeRaw() }, null, 2));
      }
    }
  }
  report.locations.push({ ...location, runs, ...compareProviders(byProvider) });
  console.log(`\n${location.name} (${location.locationId})`);
  console.table(Object.fromEntries(Object.entries(runs).map(([name, r]) => [name, r.error ? { error: r.error } : {
    posts: r.posts, requests: r.requests, ms: r.ms, newestH: r.newestAgeHours, medianH: r.medianAgeHours,
    last7d: r.postsLast7Days, views: r.coverage.views, author: r.coverage.author, costUsd: r.costUsd, perPost: r.costPerPostUsd,
  }])));
}
writeFileSync(outFile, JSON.stringify(report, null, 2));
console.log(`\nWrote ${outFile}`);
