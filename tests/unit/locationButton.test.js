import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { build } from "../../src/frontend/node_modules/esbuild/lib/main.js";

const bundled = await build({
  stdin: {
    contents: `import React from "react"; import { renderToStaticMarkup } from "react-dom/server"; import LocationButton from "./src/components/LocationButton.jsx"; export const render = (props) => renderToStaticMarkup(React.createElement(LocationButton, props));`,
    resolveDir: fileURLToPath(new URL("../../src/frontend/", import.meta.url)),
  },
  bundle: true, write: false, format: "cjs", platform: "node", define: { "import.meta.env": "{}" }, jsx: "automatic",
});
const mod = { exports: {} };
new Function("require", "module", "exports", bundled.outputFiles[0].text)(createRequire(import.meta.url), mod, mod.exports);
const { render } = mod.exports;

const noop = () => {};

test("before a choice there is a Use my location button", () => {
  const html = render({ status: "idle", onRequest: noop, onClear: noop });
  assert.match(html, /Use my location/);
  assert.doesNotMatch(html, /<button[^>]*disabled=""/);
});

test("while the browser answers the button says so and cannot be pressed again", () => {
  const html = render({ status: "requesting", onRequest: noop, onClear: noop });
  assert.match(html, /Finding your location/);
  assert.match(html, /<button[^>]*disabled=""/);
});

test("once shared, it shows that the location is in use and offers a way to stop", () => {
  const html = render({ status: "granted", onRequest: noop, onClear: noop });
  assert.match(html, /Using your location/);
  assert.match(html, /aria-label="Stop using my location"/);
  assert.doesNotMatch(html, /Use my location/);
});

test("when the browser blocks it, the screen explains how to allow it and keeps the button", () => {
  const html = render({ status: "denied", onRequest: noop, onClear: noop });
  assert.match(html, /Use my location/);
  assert.match(html, /blocked/i);
  assert.match(html, /browser/i);
  assert.match(html, /role="status"/);
});

test("when the position cannot be found it says so and keeps the button", () => {
  const html = render({ status: "error", onRequest: noop, onClear: noop });
  assert.match(html, /Use my location/);
  assert.match(html, /Couldn.{1,6}t get your location/);
});

test("a browser without geolocation shows nothing", () => {
  assert.equal(render({ status: "unavailable", onRequest: noop, onClear: noop }), "");
});
