// For new cities whose centre came from Wikidata, confirm the centre item is in the destination's country (P17 -> P297).
import { readFileSync, writeFileSync } from "node:fs";
const UA = "SproutRouteCurator/1.0 (https://www.sproutroute.app)";
const api = async (p) => (await fetch(`https://www.wikidata.org/w/api.php?${new URLSearchParams({ format: "json", ...p })}`, { headers: { "User-Agent": UA } })).json();
const preview = JSON.parse(readFileSync("./load-preview.json")).cityInserts;
const wiki = JSON.parse(readFileSync("./wikidata-matches.json"));
const index = JSON.parse(readFileSync("./batch-index.json"));
const slugOf = Object.fromEntries(Object.entries(index).map(([s, d]) => [`${d.name}|${d.country_code}`, s]));
const rows = preview.map((c) => ({ c, slug: slugOf[`${c.city_name}|${c.country_code}`] })).filter(({ slug }) => wiki[slug]?.center && Math.abs(wiki[slug].center.lat - 0) >= 0);
const usedWd = rows.filter(({ c, slug }) => Math.abs(c.lat - wiki[slug].center.lat) < 1e-6 && Math.abs(c.lon - wiki[slug].center.lon) < 1e-6);
const ids = [...new Set(usedWd.map(({ slug }) => wiki[slug].center.id))];
const country = {};
for (let i = 0; i < ids.length; i += 50) {
  const b = await api({ action: "wbgetentities", ids: ids.slice(i, i + 50).join("|"), props: "claims" });
  for (const [id, e] of Object.entries(b.entities)) country[id] = (e.claims?.P17 ?? []).map((s) => s.mainsnak?.datavalue?.value?.id).filter(Boolean);
}
const cIds = [...new Set(Object.values(country).flat())];
const iso = {};
for (let i = 0; i < cIds.length; i += 50) {
  const b = await api({ action: "wbgetentities", ids: cIds.slice(i, i + 50).join("|"), props: "claims" });
  for (const [id, e] of Object.entries(b.entities)) iso[id] = e.claims?.P297?.[0]?.mainsnak?.datavalue?.value;
}
const bad = usedWd.filter(({ c, slug }) => { const cs = country[wiki[slug].center.id].map((x) => iso[x]); return cs.length && !cs.includes(c.country_code); })
  .map(({ c, slug }) => ({ slug, name: c.city_name, cc: c.country_code, wd: wiki[slug].center.id, wdCountries: country[wiki[slug].center.id].map((x) => iso[x]) }));
const noCountry = usedWd.filter(({ slug }) => !country[wiki[slug].center.id].length).map(({ slug }) => slug);
console.log({ newCities: preview.length, centreFromWikidata: usedWd.length, wrongCountry: bad.length, noCountryClaim: noCountry.length });
console.log(bad); console.log("no P17:", noCountry.join(", "));
writeFileSync("./bad-centres.json", JSON.stringify({ bad, noCountry }, null, 2));
