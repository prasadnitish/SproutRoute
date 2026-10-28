import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

// The Langfuse eval capture needs Node 22. Railway picks its Node version from engines, and CI must run the
// SDK tests rather than skip them, so all three have to agree.
const major = (range) => Number(/(\d+)/.exec(range)[1]);

test("the package declares Node 22 or newer so the deploy runs the eval capture", () => {
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  assert.ok(major(pkg.engines.node) >= 22, pkg.engines.node);
});

test("every CI workflow that sets up Node uses 22 or newer", () => {
  for (const file of readdirSync(".github/workflows").filter((f) => f.endsWith(".yml"))) {
    const lines = readFileSync(`.github/workflows/${file}`, "utf8").split("\n").filter((l) => !l.trim().startsWith("#"));
    for (const line of lines) {
      const m = /node-version:\s*"?(\d+)/.exec(line);
      if (m) assert.ok(Number(m[1]) >= 22, `${file}: ${line.trim()}`);
    }
  }
});
