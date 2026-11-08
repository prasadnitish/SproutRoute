// Web-search check of low-confidence places, one batch request per destination.
// node verify.mjs plan <maxDestinations>  -> prints what would be checked and an estimate
// node verify.mjs submit <maxDestinations>
// node verify.mjs status | collect
import Anthropic from "@anthropic-ai/sdk";
import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { MODEL } from "./lib.mjs";
import { pathToFileURL } from "node:url";

const client = new Anthropic();
const here = (p) => new URL(p, import.meta.url);
const THRESHOLD = 0.8;

const verdictTool = {
  name: "record_verdicts",
  description: "Record the verdict for every place you were asked to check. Call it once, at the end.",
  strict: true,
  input_schema: {
    type: "object", additionalProperties: false,
    properties: {
      verdicts: {
        type: "array",
        items: {
          type: "object", additionalProperties: false,
          properties: {
            name: { type: "string", description: "The name exactly as given to you" },
            status: { type: "string", enum: ["open", "closed_permanently", "closed_temporarily", "renamed", "seasonal", "not_found"] },
            current_name: { type: "string", description: "Correct current name, or the given name if unchanged" },
            official_url: { type: "string", description: "Official website if found, else empty" },
            hours_pattern: { type: "string", description: "Typical opening pattern in general words, from the official site if possible, else empty" },
            note: { type: "string", description: "Anything a family should know (renovation, reservation now required), else empty" },
            source_url: { type: "string", description: "The page you relied on most" },
            checked_by_search: { type: "boolean", description: "True only if a search result in this session confirmed the verdict" },
          },
          required: ["name", "status", "current_name", "official_url", "hours_pattern", "note", "source_url", "checked_by_search"],
        },
      },
    },
    required: ["verdicts"],
  },
};

function candidates() {
  const index = JSON.parse(readFileSync(here("./batch-index.json")));
  return readdirSync(here("./results/")).map((f) => {
    const id = f.replace(/\.json$/, "");
    const data = JSON.parse(readFileSync(here(`./results/${f}`)));
    const weak = data.attractions.filter((a) => a.confidence < THRESHOLD);
    return { id, dest: index[id], weak };
  }).filter((c) => c.weak.length).sort((a, b) => (b.dest?.family_popularity ?? 0) - (a.dest?.family_popularity ?? 0) || b.weak.length - a.weak.length);
}

export function params({ dest, weak }) {
  const list = weak.slice(0, 10).map((a) => `- ${a.canonical_name} (${a.area})`).join("\n");
  return {
    model: MODEL, max_tokens: 16000,
    output_config: { effort: "low" },
    tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 10 }, verdictTool],
    tool_choice: { type: "auto" },
    system: "You check facts for a family trip planner. Use web search to confirm each place still operates in 2026 under that name. Prefer official sites and recent local news. Search efficiently: one search can cover several places. Then call record_verdicts once with a verdict for every place.",
    messages: [{ role: "user", content: `Destination: ${dest.name}, ${dest.region} (${dest.country_code}). Check these places:\n${list}` }],
  };
}

const main = import.meta.url === pathToFileURL(process.argv[1]).href;
const [cmd, maxArg] = main ? process.argv.slice(2) : [];
const max = Number(maxArg || 150);
if (cmd === "plan" || cmd === "submit") {
  const picked = candidates().slice(0, max);
  const places = picked.reduce((n, c) => n + Math.min(c.weak.length, 10), 0);
  console.log({ destinationsWithWeakPlaces: candidates().length, picked: picked.length, places, estimateUSD: (picked.length * 0.18).toFixed(0) });
  if (cmd === "submit") {
    if (existsSync(here("./verify-batch-id.txt"))) throw new Error("already submitted");
    const batch = await client.messages.batches.create({ requests: picked.map((c) => ({ custom_id: c.id, params: params(c) })) });
    writeFileSync(here("./verify-batch-id.txt"), batch.id);
    console.log("submitted", batch.id);
  }
} else if (cmd === "status") {
  const b = await client.messages.batches.retrieve(readFileSync(here("./verify-batch-id.txt"), "utf8").trim());
  console.log(b.processing_status, JSON.stringify(b.request_counts));
} else if (cmd === "collect") {
  mkdirSync(here("./verified/"), { recursive: true });
  let usd = 0, ok = 0, searches = 0;
  const failed = [];
  for await (const r of await client.messages.batches.results(readFileSync(here("./verify-batch-id.txt"), "utf8").trim())) {
    if (r.result.type !== "succeeded") { failed.push([r.custom_id, r.result.type]); continue; }
    const m = r.result.message;
    const s = m.usage.server_tool_use?.web_search_requests ?? 0;
    searches += s;
    usd += ((m.usage.input_tokens + (m.usage.cache_read_input_tokens ?? 0)) * 2 + m.usage.output_tokens * 10) / 1e6 + s * 0.01;
    const call = m.content.find((b) => b.type === "tool_use" && b.name === "record_verdicts");
    if (!call) { failed.push([r.custom_id, "no-verdicts:" + m.stop_reason]); continue; }
    writeFileSync(here(`./verified/${r.custom_id}.json`), JSON.stringify(call.input, null, 2));
    ok += 1;
  }
  console.log({ ok, searches, failed: failed.length, failedSample: failed.slice(0, 5), costUSD: usd.toFixed(2) });
}
