// Match curated places to Wikidata (CC0) to get permanent coordinates and an id.
// node wikidata.mjs <dir-with-destination-json> <out.json>
// A place matches when a Wikidata search hit has a close name and a coordinate near the destination.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";

const API = "https://www.wikidata.org/w/api.php";
const UA = "SproutRouteCurator/1.0 (https://www.sproutroute.app)";
const [dir, outFile] = process.argv.slice(2);

const norm = (s) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/['’`]/g, "")
  .replace(/\b(the|park|theme|resort|museum|of|de|du|la|le|des|and|&)\b/g, " ").replace(/[^a-z0-9]+/g, " ").trim();
const similar = (a, b) => {
  const x = norm(a), y = norm(b);
  if (!x || !y) return false;
  if (x === y || x.includes(y) || y.includes(x)) return true;
  const A = new Set(x.split(" ")), B = new Set(y.split(" "));
  const inter = [...A].filter((t) => B.has(t)).length;
  return inter / Math.max(A.size, B.size) >= 0.6;
};
const km = (a, b) => {
  const r = Math.PI / 180, dlat = (b.lat - a.lat) * r, dlon = (b.lon - a.lon) * r;
  const h = Math.sin(dlat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dlon / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
};

async function api(params, tries = 4) {
  const url = `${API}?${new URLSearchParams({ format: "json", ...params })}`;
  for (let i = 0; i < tries; i++) {
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if (res.ok) {
      const body = await res.json();
      if (!body.error) return body;
    }
    await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
  }
  return null;
}

const search = async (q) => (await api({ action: "wbsearchentities", search: q, language: "en", uselang: "en", limit: "7", type: "item" }))?.search ?? [];
async function entities(ids) {
  if (!ids.length) return {};
  const body = await api({ action: "wbgetentities", ids: ids.join("|"), props: "claims|labels|aliases", languages: "en" });
  return body?.entities ?? {};
}
const coord = (e) => {
  const v = e?.claims?.P625?.[0]?.mainsnak?.datavalue?.value;
  return v ? { lat: v.latitude, lon: v.longitude } : null;
};
const names = (e, hit) => [hit.label, ...(hit.aliases ?? []), e?.labels?.en?.value, ...((e?.aliases?.en ?? []).map((a) => a.value))].filter(Boolean);

async function center(dest) {
  for (const hit of await search(dest.destination)) {
    const c = coord((await entities([hit.id]))[hit.id]);
    if (c) return { ...c, id: hit.id };
  }
  return null;
}

async function matchPlace(place, c) {
  const queries = [place.canonical_name];
  if (place.wikidata_id) queries.unshift(null);
  const hits = place.wikidata_id ? [{ id: place.wikidata_id, label: place.canonical_name }] : [];
  for (const q of queries.filter(Boolean)) hits.push(...(await search(q)));
  const ents = await entities([...new Set(hits.map((h) => h.id))].slice(0, 50));
  const limit = Math.max(40, (place.km_from_center || 0) * 1.6 + 25);
  for (const hit of hits) {
    const e = ents[hit.id];
    const p = coord(e);
    if (!p || !names(e, hit).some((n) => similar(n, place.canonical_name))) continue;
    if (c && km(c, p) > limit) continue;
    return { wikidata_id: hit.id, lat: p.lat, lon: p.lon, km_from_center_actual: c ? Math.round(km(c, p)) : null };
  }
  return null;
}

async function pool(items, size, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: size }, async () => { while (i < items.length) { const k = i++; await fn(items[k], k); } }));
}

const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
const out = {};
let matched = 0, total = 0;
await pool(files, 4, async (f) => {
  const dest = JSON.parse(readFileSync(`${dir}/${f}`, "utf8"));
  const c = await center(dest);
  const rows = [];
  for (const place of dest.attractions) {
    const m = await matchPlace(place, c);
    rows.push({ name: place.canonical_name, ...(m ?? {}) });
    total += 1; if (m) matched += 1;
  }
  out[f.replace(/\.json$/, "")] = { center: c, places: rows };
  process.stdout.write(`${f} ${rows.filter((r) => r.lat).length}/${rows.length}\n`);
});
writeFileSync(outFile, JSON.stringify(out, null, 2));
console.log(`matched ${matched}/${total} (${Math.round((100 * matched) / Math.max(total, 1))}%)`);
