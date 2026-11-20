import test from "node:test";
import assert from "node:assert/strict";
import { registerItineraryResource, ITINERARY_RESOURCE_URI } from "../../src/backend/mcp/itineraryResource.js";

test("itinerary resource lists and returns a self-contained tracker-free MCP App", async () => {
  let args;
  registerItineraryResource({ registerResource(...registration) { args = registration; } });
  const [, uri, metadata, read] = args;
  assert.equal(uri, "ui://sproutroute/itinerary");
  assert.equal(uri, ITINERARY_RESOURCE_URI);
  const { contents: [resource] } = await read();
  assert.equal(resource.uri, uri);
  assert.equal(resource.mimeType, "text/html;profile=mcp-app");
  assert.deepEqual(metadata._meta, resource._meta);
  assert.deepEqual(resource._meta.ui.csp.connectDomains, []);
  assert.deepEqual(resource._meta.ui.csp.resourceDomains, []);
  assert.match(resource.text, /ui\/initialize/);
  assert.doesNotMatch(resource.text, /<script[^>]+src=|<link[^>]+href=|<iframe|<img|window\.openai/i);
});

test("preview handoff admits only the explicitly configured HTTPS origin", async t => {
  const oldValue = process.env.SPROUTROUTE_WEB_ORIGIN;
  t.after(() => {
    if (oldValue === undefined) delete process.env.SPROUTROUTE_WEB_ORIGIN;
    else process.env.SPROUTROUTE_WEB_ORIGIN = oldValue;
  });
  process.env.SPROUTROUTE_WEB_ORIGIN = "https://sproutroute-preview.example";
  const preview = await import("../../src/backend/mcp/itineraryResource.js?preview");
  assert.equal(preview.itineraryWebsiteOrigin, process.env.SPROUTROUTE_WEB_ORIGIN);
  let reader;
  preview.registerItineraryResource({ registerResource(...args) { reader = args[3]; } });
  assert.match((await reader()).contents[0].text, /data-website-origin="https:\/\/sproutroute-preview\.example"/);
  process.env.SPROUTROUTE_WEB_ORIGIN = "https://untrusted.example/redirect";
  await assert.rejects(import("../../src/backend/mcp/itineraryResource.js?invalid"), /HTTPS origin/);
});
