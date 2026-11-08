import Anthropic from "@anthropic-ai/sdk";
import { writeFileSync, mkdirSync } from "node:fs";
import { requestParams, cost } from "./lib.mjs";

const client = new Anthropic();
const out = new URL("./pilot/", import.meta.url);
mkdirSync(out, { recursive: true });

const dests = [
  { slug: "orlando", name: "Orlando", country: "US", count: 35 },
  { slug: "paris", name: "Paris", country: "FR", count: 30 },
  { slug: "maui", name: "Maui", country: "US", count: 30 },
];

let total = 0;
await Promise.all(dests.map(async (d) => {
  const t0 = Date.now();
  const msg = await client.messages.stream(requestParams(d)).finalMessage();
  const text = msg.content.find((b) => b.type === "text")?.text ?? "";
  const data = JSON.parse(text);
  writeFileSync(new URL(`${d.slug}.json`, out), JSON.stringify(data, null, 2));
  const c = cost(msg.usage, false);
  total += c;
  console.log(d.slug, msg.stop_reason, data.attractions.length, "places", msg.usage.input_tokens, "in", msg.usage.output_tokens, "out",
    `$${c.toFixed(3)} (batch $${(c / 2).toFixed(3)})`, `${((Date.now() - t0) / 1000).toFixed(0)}s`);
}));
console.log("pilot total $" + total.toFixed(3));
