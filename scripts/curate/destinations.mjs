// Build the curated destination list, one request per region, in parallel.
import Anthropic from "@anthropic-ai/sdk";
import { writeFileSync } from "node:fs";
import { MODEL, cost } from "./lib.mjs";

const client = new Anthropic();
const EXISTING = process.argv[2] || "";

const REGIONS = [
  ["US: cities", 55, "US cities families visit most (theme-park cities, big cities, regional hubs)"],
  ["US: beaches, mountains, national parks, small towns", 65, "US beach towns, lake and mountain resorts, national parks and gateway towns, Hawaii islands, Alaska"],
  ["Canada", 35, "Canada, all provinces, cities and nature destinations"],
  ["Mexico", 35, "Mexico, cities and beach resorts"],
  ["Caribbean, Bahamas, Bermuda, Central America", 40, "islands and beach destinations in the Caribbean, Bahamas, Bermuda, Costa Rica, Belize, Panama"],
  ["Europe: UK and Ireland", 30, "UK and Ireland"],
  ["Europe: France, Benelux, Germany, Austria, Switzerland", 50, "France, Belgium, Netherlands, Luxembourg, Germany, Austria, Switzerland"],
  ["Europe: Spain, Portugal, Italy, Malta, Greece, Cyprus, Croatia", 60, "Spain incl. islands, Portugal incl. islands, Italy, Malta, Greece incl. islands, Cyprus, Croatia"],
  ["Europe: Nordics, Central and Eastern Europe, Turkey", 35, "Denmark, Sweden, Norway, Finland, Iceland, Poland, Czechia, Hungary, Slovenia, Baltics, Turkey and others"],
  ["India", 30, "India, cities, hill stations, beaches and heritage towns"],
  ["Australia and New Zealand", 30, "Australia and New Zealand"],
  ["Asia", 40, "Japan, Singapore, Thailand, Vietnam, Malaysia, Indonesia, Philippines, South Korea, Hong Kong, Taiwan, Sri Lanka, Maldives"],
  ["Middle East, Africa, Indian Ocean", 15, "UAE, Qatar, Oman, Jordan, Egypt, Morocco, South Africa, Kenya, Mauritius, Seychelles"],
  ["South America", 15, "South America"],
];

const schema = {
  type: "object", additionalProperties: false,
  properties: {
    destinations: {
      type: "array",
      items: {
        type: "object", additionalProperties: false,
        properties: {
          name: { type: "string", description: "Common English name, e.g. 'Rome', 'Maui', 'Banff'" },
          country_code: { type: "string", description: "ISO 3166-1 alpha-2" },
          region: { type: "string", description: "State, province or region" },
          kind: { type: "string", enum: ["city", "beach_town", "island", "mountain_lake", "national_park", "theme_park_hub", "countryside_region", "small_town"] },
          aliases: { type: "array", items: { type: "string" }, description: "Other names people type, local-language names, and any matching names from the existing list" },
          family_popularity: { type: "integer", description: "1-5, how often families with kids from US/Canada/UK/India/Australia go there" },
        },
        required: ["name", "country_code", "region", "kind", "aliases", "family_popularity"],
      },
    },
  },
  required: ["destinations"],
};

let total = 0;
const all = [];
await Promise.all(REGIONS.map(async ([label, count, scope]) => {
  const msg = await client.messages.stream({
    model: MODEL, max_tokens: 32000,
    output_config: { effort: "medium", format: { type: "json_schema", schema } },
    system: "You choose destinations for SproutRoute, a trip planner for families with children. Pick places families really travel to, most popular first. Treat a destination as somewhere a family would type into a trip planner (a city, island, resort area or park), not a country or a single attraction. Avoid near-duplicates (pick 'Maui', not also 'Lahaina').",
    messages: [{ role: "user", content: `Scope: ${scope}. Give the top ${count} family destinations.\n\nOur database already has these destination rows (some are messy or duplicated). When one of your destinations matches any of them, put that exact existing text in aliases:\n${EXISTING}` }],
  }).finalMessage();
  const list = JSON.parse(msg.content.find((b) => b.type === "text").text).destinations;
  total += cost(msg.usage, false);
  for (const d of list) all.push({ ...d, group: label });
  console.log(label, list.length, msg.stop_reason);
}));
writeFileSync(new URL("./destinations.json", import.meta.url), JSON.stringify(all, null, 2));
console.log("destinations", all.length, "cost $" + total.toFixed(2));
