// Cloudflare Web Analytics loads only after the visitor allows analytics, like PostHog.
// In the Cloudflare dashboard (Web Analytics > Manage site), set the site to "Enable with JS Snippet
// installation". With automatic setup the beacon is injected into every page, consent or not.
export const BEACON_SRC = "https://static.cloudflareinsights.com/beacon.min.js";
// The site token is public: Cloudflare puts it in the HTML of every page it injects the beacon into.
const BEACON_TOKEN = "b3db239f32034912af06e4999809a5a6";

export function loadCloudflareBeacon({ isProd, consent, doc }) {
  if (!isProd || consent !== "granted" || !doc) return false;
  // Covers a second call, and a beacon Cloudflare injected itself (its URL carries a version suffix).
  if (doc.querySelector(`script[src^="${BEACON_SRC}"]`)) return false;
  const script = doc.createElement("script");
  script.type = "module";
  script.src = BEACON_SRC;
  script.setAttribute("data-cf-beacon", JSON.stringify({ token: BEACON_TOKEN }));
  doc.body.appendChild(script);
  return true;
}
