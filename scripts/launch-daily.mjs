// Owner-only report. The remote endpoint enforces read-only SQL; no app server is started.
import { readFile, writeFile, mkdir, rename, rm } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { parseArgs } from "node:util";
import { renderDailyReport } from "../src/backend/services/dailyLaunchReport.js";

const { values } = parseArgs({ options: { snapshot: { type: "string" }, output: { type: "string" } } });
const directory = path.join(homedir(), "Documents", "SproutRoute Launch", "analytics");
const destination = path.resolve(values.output || path.join(directory, "launch-daily.html"));

async function fetchRows() {
  const query = await readFile(new URL("./sql/launch-daily.sql", import.meta.url), "utf8");
  const token = process.env.SUPABASE_ACCESS_TOKEN ||
    (await readFile(path.join(homedir(), ".supabase", "access-token"), "utf8")).trim();
  const response = await fetch("https://api.supabase.com/v1/projects/pejicyunorzjihwsejzy/database/query/read-only", {
    method: "POST", headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify({ query }), signal: AbortSignal.timeout(30000), redirect: "error",
  });
  if (!response.ok) throw new Error("Read-only aggregate query returned HTTP " + response.status);
  return response.json();
}

const rows = values.snapshot ? JSON.parse(await readFile(values.snapshot, "utf8")) : await fetchRows();
const html = renderDailyReport(rows);
await mkdir(path.dirname(destination), { recursive: true, mode: 0o700 });
const temporary = destination + "." + randomUUID();
try {
  await writeFile(temporary, html, { mode: 0o600, flag: "wx" });
  await rename(temporary, destination);
} finally {
  await rm(temporary, { force: true });
}
console.log(destination);
