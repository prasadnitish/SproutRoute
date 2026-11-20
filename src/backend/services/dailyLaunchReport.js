// The SQL aggregate is the only input. Only allowlisted dates and numeric cells reach the page.
const counts = [
  ["active_attested_keys", "Active installs"],
  ["returning_attested_keys", "Returning installs"],
  ["active_attested_planner_keys", "Planning installs"],
  ["unattested_ip_buckets", "Network buckets"],
  ["total_plan_requests", "Plan requests"],
  ["trip_events", "Trip events"],
  ["accounts_saving_trips", "Accounts saving trips"],
  ["saved_trips_created", "Saved trips"],
  ["saved_places_created", "Saved places"],
  ["successful_social_extractions", "Successful extractions"],
  ["extracted_grounded_facts", "Grounded facts"],
  ["retained_shares_created", "Share links"],
];

function number(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) throw new Error("Invalid aggregate");
  return n;
}

function spend(row) {
  const priced = number(row.priced_ai_calls);
  const total = number(row.ai_calls);
  const cost = number(row.estimated_priced_ai_usd);
  if (total === null || priced === null) return "Unknown";
  const amount = priced > 0 && cost !== null ? "$" + cost.toFixed(4) : "Unknown";
  return amount + "<small>" + priced + " of " + total + " priced</small>";
}

function date(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || new Date(value).toISOString().slice(0, 10) !== value)
    throw new Error("Invalid report date");
  return value;
}

export function renderDailyReport(rows) {
  if (!Array.isArray(rows) || !rows.length) throw new Error("No daily aggregates available");
  const sorted = rows.map(row => ({ ...row, day_utc: date(row.day_utc) }))
    .sort((a, b) => b.day_utc.localeCompare(a.day_utc));
  const asOf = new Date(sorted[0].observed_as_of_utc).toISOString();
  const day = asOf.slice(0, 10);
  const body = sorted.map(row => {
    const cells = counts.map(([field]) => "<td>" + (number(row[field]) ?? "Unknown") + "</td>").join("");
    const age = (Date.parse(day) - Date.parse(row.day_utc)) / 86400000;
    return '<tr class="' + (age === 0 ? "today" : age < 7 ? "week" : "older") + '"><th scope="row">' + row.day_utc
      + (age === 0 ? "<small>Partial day</small>" : "") + "</th>" + cells + "<td>" + spend(row) + "</td></tr>";
  }).join("");
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Daily launch dashboard · SproutRoute</title>
<style>
:root{color-scheme:light dark;--ink:#17392b;--paper:#f9faf6;--panel:#fff;--line:#c5d4c9;--accent:#155938}
@media(prefers-color-scheme:dark){:root{--ink:#e1eee3;--paper:#14231b;--panel:#1d3025;--line:#52705c;--accent:#a9e9bc}}
*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:1rem/1.5 system-ui,sans-serif}main{max-width:95rem;margin:auto;padding:clamp(1rem,4vw,3rem)}h1{margin:.2em 0;font-size:clamp(2rem,5vw,3.5rem);line-height:1.05}p,dd{max-width:82ch}small{display:block;font-size:.8em}fieldset{margin:1.5rem 0 1rem;border:0;padding:0}legend,dt{font-weight:bold}label{display:inline-flex;align-items:center;gap:.3em;padding:.6rem .8rem .6rem 0;cursor:pointer}input{accent-color:var(--accent)}.scroll{overflow:auto;background:var(--panel);border:1px solid var(--line);border-radius:.5rem}table{border-collapse:separate;border-spacing:0;width:100%;font-variant-numeric:tabular-nums}th,td{border-bottom:1px solid var(--line);padding:.7rem;text-align:right}th:first-child{position:sticky;left:0;background:var(--panel);text-align:left;white-space:nowrap}thead{color:var(--accent)}tbody tr:last-child>*{border-bottom:0}main:has(#today:checked) tr.week,main:has(#today:checked) tr.older,main:has(#week:checked) tr.older{display:none}dl{display:grid;gap:.4em}dd{margin:0 0 .6em}caption{text-align:left;padding:.7rem;font-weight:bold}
</style><main><header><span>SproutRoute operations</span><h1>Daily launch dashboard</h1><p>Data through <time datetime="${asOf}">${asOf.replace("T", " ").slice(0, 19)} UTC</time>. Reload the report from the database for a newer reading.</p></header>
<fieldset><legend>Reporting window</legend><label><input id="today" name="window" type="radio">Today</label><label><input id="week" name="window" type="radio" checked>Last 7 days</label><label><input name="window" type="radio">All available days</label></fieldset>
<div class="scroll" role="region" aria-label="Daily launch figures, horizontally scrollable" tabindex="0"><table><caption>Daily activity by UTC date</caption><thead><tr><th scope="col">Date</th>${counts.map(([,label]) => '<th scope="col">' + label + '</th>').join("")}<th scope="col">Priced AI spend (USD)</th></tr></thead><tbody>${body}</tbody></table></div>
<h2>Coverage</h2><dl>
<dt>Active, returning and planning installs</dt><dd>Each attested key represents an observed installation accessing a metered endpoint. Returning installs were active during the preceding seven UTC days. Planning installs reached a metered plan endpoint. Human DAU and cross-device identity are unknown. App Store downloads, App Store sessions and TestFlight sessions are unavailable here.</dd>
<dt>Network buckets</dt><dd>Unattested traffic groups requests by network address. A shared network can represent multiple people. These counts can include web, QA and automated traffic.</dd>
<dt>Requests and trip events</dt><dd>Plan requests count admitted metered calls, including replans and retries. Trip events count recorded stream completions. These sources cover different routes and cannot establish an attempt-to-completion rate.</dd>
<dt>Saves and shares</dt><dd>Accounts saving trips counts distinct registered accounts that added a trip that day. Saved trips and places count committed first inserts, excluding updates and retries. Guest and device-only saves are unknown. Share links count retained records by creation date. Expiry, revocation or deletion can reduce historical coverage.</dd>
<dt>Extractions and grounded facts</dt><dd>Successful extractions count finalized, charged imports that returned candidates. Grounded facts count distinct supported claims per candidate from those imports. A missing fact count makes that day’s total unknown. Recording begins partway through the UTC day the measurement migration is installed. Earlier save and extraction counts are unknown.</dd>
<dt>Spend and missing data</dt><dd>Spend sums estimates for recorded calls with a price. Billing totals, infrastructure and calls outside this instrumentation are unknown. Zero counts mean zero observed in that source. Unknown means the source or lookback is unavailable, or no calls had a recorded price.</dd>
</dl></main></html>`;
}
