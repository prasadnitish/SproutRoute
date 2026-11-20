import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { renderDailyReport } from "../../src/backend/services/dailyLaunchReport.js";

const row = {
  day_utc: "2026-11-20", observed_as_of_utc: "2026-11-20T11:00:00Z",
  trip_events: 0, search_events: 0, ai_calls: 2, priced_ai_calls: 0,
  estimated_priced_ai_usd: 0, total_plan_requests: 3, active_attested_keys: null,
  returning_attested_keys: null, active_attested_planner_keys: null, retained_shares_created: 0,
};

test("daily report distinguishes missing identity, observed zero, and unpriced spend", () => {
  const html = renderDailyReport([row]);
  assert.match(html, /0 of 2 priced/);
  assert.doesNotMatch(html, /\$0\.0000/);
  assert.match(html, /Unknown/);
  assert.match(html, /Partial day/);
  assert.match(html, /scope="row"/);
  assert.doesNotMatch(html, /<script/i);
  assert.throws(() => renderDailyReport([{ ...row, day_utc: "<img>" }]));
  assert.throws(() => renderDailyReport([]));
});

test("daily report includes account saves and extraction coverage, including unknown historical fields", () => {
  const html = renderDailyReport([{...row, accounts_saving_trips: 1, saved_trips_created: 2,
    saved_places_created: 0, successful_social_extractions: null, extracted_grounded_facts: 7}]);
  for (const label of ["Accounts saving trips", "Saved trips", "Saved places", "Successful extractions", "Grounded facts"])
    assert.ok(html.includes('<th scope="col">' + label + '</th>'), label);
  assert.match(html, /<td>1<\/td><td>2<\/td><td>0<\/td><td>Unknown<\/td><td>7<\/td>/);
});

test("owner can create a private, portable daily report from a saved aggregate", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "launch-report-"));
  try {
    const source = path.join(dir, "rows.json");
    const dest = path.join(dir, "overview.html");
    await writeFile(source, JSON.stringify([row]));
    execFileSync(process.execPath, ["scripts/launch-daily.mjs", "--snapshot", source, "--output", dest]);
    assert.match(await readFile(dest, "utf8"), /Daily launch dashboard/);
    assert.equal((await stat(dest)).mode & 0o777, 0o600);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
