import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const { data: ex } = await db.from("cities").select("city_name,country_code,lat,lon");
const { cityInserts } = JSON.parse(readFileSync(new URL("./load-preview.json", import.meta.url)));
const km = (a, b) => { const r = Math.PI / 180, dl = (b.lat - a.lat) * r, dn = (b.lon - a.lon) * r; const h = Math.sin(dl / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dn / 2) ** 2; return 12742 * Math.asin(Math.sqrt(h)); };
const pairs = [];
for (const c of cityInserts) for (const e of ex) { const d = km(c, e); if (d < 30) pairs.push(`${c.city_name} [${c.country_code}] ~ existing "${e.city_name}" [${e.country_code}] ${d.toFixed(1)} km`); }
// new cities near each other
for (let i = 0; i < cityInserts.length; i++) for (let j = i + 1; j < cityInserts.length; j++) { const d = km(cityInserts[i], cityInserts[j]); if (d < 10) pairs.push(`NEW ${cityInserts[i].city_name} ~ NEW ${cityInserts[j].city_name} ${d.toFixed(1)} km`); }
console.log(cityInserts.length, "new cities"); console.log(pairs.join("\n"));
