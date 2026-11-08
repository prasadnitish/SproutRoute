// node batch.mjs submit   -> creates one batch with a request per destination, saves batch id
// node batch.mjs status   -> prints progress
// node batch.mjs collect  -> writes results/<custom_id>.json and a cost summary
import Anthropic from "@anthropic-ai/sdk";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { requestParams, cost } from "./lib.mjs";

const client = new Anthropic();
const here = (p) => new URL(p, import.meta.url);
const COUNT = { 5: 35, 4: 30, 3: 25 };
const slug = (d) => `${d.country_code}-${d.name}`.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 64);

function destinations() {
  const seen = new Set();
  return JSON.parse(readFileSync(here("./destinations.json"))).filter((d) => {
    const key = slug(d);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const cmd = process.argv[2];
if (cmd === "submit") {
  if (existsSync(here("./batch-id.txt"))) throw new Error("batch already submitted: " + readFileSync(here("./batch-id.txt"), "utf8"));
  const list = destinations();
  const requests = list.map((d) => ({
    custom_id: slug(d),
    params: requestParams({ name: `${d.name}, ${d.region}`, country: d.country_code, count: COUNT[d.family_popularity] ?? 20 }),
  }));
  const batch = await client.messages.batches.create({ requests });
  writeFileSync(here("./batch-id.txt"), batch.id);
  writeFileSync(here("./batch-index.json"), JSON.stringify(Object.fromEntries(list.map((d) => [slug(d), d])), null, 2));
  console.log("submitted", batch.id, requests.length, "requests");
} else if (cmd === "status") {
  const b = await client.messages.batches.retrieve(readFileSync(here("./batch-id.txt"), "utf8").trim());
  console.log(b.processing_status, JSON.stringify(b.request_counts));
} else if (cmd === "collect") {
  const id = readFileSync(here("./batch-id.txt"), "utf8").trim();
  mkdirSync(here("./results/"), { recursive: true });
  let total = 0, ok = 0, places = 0;
  const failed = [];
  for await (const r of await client.messages.batches.results(id)) {
    if (r.result.type !== "succeeded") { failed.push([r.custom_id, r.result.type]); continue; }
    const m = r.result.message;
    total += cost(m.usage, true);
    try {
      const data = JSON.parse(m.content.find((b) => b.type === "text").text);
      writeFileSync(here(`./results/${r.custom_id}.json`), JSON.stringify(data, null, 2));
      ok += 1; places += data.attractions.length;
    } catch { failed.push([r.custom_id, "parse:" + m.stop_reason]); }
  }
  console.log({ ok, places, failed, cost: total.toFixed(2) });
} else {
  console.log("usage: submit | status | collect");
}
