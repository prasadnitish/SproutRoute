import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import tailwind from "../../src/frontend/tailwind.config.js";

// Loading Google Fonts from Google's servers sends the visitor's IP address to Google before any consent.
// The fonts are self-hosted (Fontsource packages, SIL Open Font License) so nothing leaves our own origin.
const GOOGLE_FONT_HOSTS = /fonts\.googleapis\.com|fonts\.gstatic\.com/;

function files(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "node_modules" || name === "dist" ? [] : files(path);
    return /\.(jsx?|css|html)$/.test(name) ? [path] : [];
  });
}

test("no frontend page, stylesheet or script points at Google's font servers", () => {
  const offenders = [...files("src/frontend/src"), ...files("src/frontend/public"), "src/frontend/index.html"]
    .filter((file) => GOOGLE_FONT_HOSTS.test(readFileSync(file, "utf8")));
  assert.deepEqual(offenders, []);
});

test("the app entry imports the self-hosted Inter and Space Grotesk faces", () => {
  const entry = readFileSync("src/frontend/src/main.jsx", "utf8");
  assert.match(entry, /@fontsource-variable\/inter/);
  assert.match(entry, /@fontsource-variable\/space-grotesk/);
});

test("Tailwind font families use the names the Fontsource packages register", () => {
  const { fontFamily } = tailwind.theme.extend;
  assert.ok(fontFamily.sans.includes('"Inter Variable"'), "sans must start with Inter Variable");
  assert.ok(fontFamily.body.includes('"Inter Variable"'));
  assert.ok(fontFamily.display.includes('"Space Grotesk Variable"'));
});

test("the page body font matches the Tailwind sans stack", () => {
  assert.match(readFileSync("src/frontend/src/index.css", "utf8"), /font-family:\s*"Inter Variable"/);
});
