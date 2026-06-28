import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("deployment guide includes Trip Hub live smoke gates", () => {
  const guide = readFileSync("DEPLOYMENT_GUIDE.md", "utf8");
  const packageJson = JSON.parse(readFileSync("package.json", "utf8"));

  assert.equal(
    packageJson.scripts["smoke:trip-hub"],
    "node scripts/verify-trip-hub-production.mjs",
  );
  assert.equal(
    packageJson.scripts["smoke:trip-hub:mutating"],
    "RUN_TRIP_HUB_MUTATING_SMOKE=1 node scripts/verify-trip-hub-production.mjs",
  );

  assert.match(guide, /npm run smoke:trip-hub/);
  assert.match(guide, /npm run smoke:trip-hub:mutating/);
  assert.match(guide, /SUPABASE_SERVICE_KEY/);
  assert.match(guide, /public\.group_trip_documents/);
  assert.match(guide, /RLS enabled/);
});
