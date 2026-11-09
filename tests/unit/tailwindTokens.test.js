import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import tailwind from "../../src/frontend/tailwind.config.js";

function sourceFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(jsx?|tsx?)$/.test(name) ? [path] : [];
  });
}

// Tailwind silently drops a color class it does not know, so a button can render white text on
// a white card. The consent banner shipped that way once (bg-sprout-green).
test("every sprout-* color class used in the frontend exists in the Tailwind config", () => {
  const defined = Object.keys(tailwind.theme.extend.colors.sprout);
  const unknown = [];
  for (const file of sourceFiles("src/frontend/src")) {
    const text = readFileSync(file, "utf8");
    for (const [, utility, shade] of text.matchAll(/\b(bg|text|border|ring|from|to|via)-sprout-([a-z0-9]+)/g)) {
      if (!defined.includes(shade)) unknown.push(`${file}: ${utility}-sprout-${shade}`);
    }
  }
  assert.deepEqual(unknown, [], `defined shades: ${defined.join(", ")}`);
});
