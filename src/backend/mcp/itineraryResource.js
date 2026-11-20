import { readFileSync } from "node:fs";

export const ITINERARY_RESOURCE_URI = "ui://sproutroute/itinerary";
const mimeType = "text/html;profile=mcp-app";
function websiteOrigin(value) {
  const url = new URL(value);
  if (url.protocol !== "https:" || !/^[A-Za-z0-9.-]+$/.test(url.hostname) || ![url.origin, url.origin + "/"].includes(value)) {
    throw new Error("SPROUTROUTE_WEB_ORIGIN must be a canonical HTTPS origin.");
  }
  return url.origin;
}

export const itineraryWebsiteOrigin = websiteOrigin(process.env.SPROUTROUTE_WEB_ORIGIN || "https://sproutroute.app");
const text = readFileSync(new URL("./widget/itinerary.html", import.meta.url), "utf8")
  .replace('data-website-origin="https://sproutroute.app"', () => 'data-website-origin="' + itineraryWebsiteOrigin + '"');
// The widget never fetches photos, fonts, scripts, analytics, or API endpoints.
// Map and website navigation are user-initiated requests to the host.
const _meta = { ui: { csp: { resourceDomains: [], connectDomains: [] } } };

export function registerItineraryResource(server) {
  server.registerResource("itinerary", ITINERARY_RESOURCE_URI, {
    title: "SproutRoute itinerary",
    description: "Browse each day of your family trip and swap a stop.",
    mimeType,
    _meta,
  }, async () => ({
    contents: [{ uri: ITINERARY_RESOURCE_URI, mimeType, text, _meta }],
  }));
}
