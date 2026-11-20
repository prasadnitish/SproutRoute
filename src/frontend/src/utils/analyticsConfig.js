// PostHog init options, kept apart from analytics.js so tests can import them without the SDK.
// Session recording stays off: trip text contains children's ages and pet details, and masking is not a
// reason to keep a screen recorder running. Keep privacy.html in step with this file.
export const posthogOptions = {
  api_host: "https://us.i.posthog.com",
  person_profiles: "identified_only",
  capture_pageview: true,
  capture_pageleave: true,
  autocapture: true, // Clicks, form submits, page views
  disable_session_recording: true,
  persistence: "localStorage",
};

// Account callbacks and handoffs can carry credentials. Keep both analytics
// providers off those pages, including when consent was granted previously.
export function isPlannerAnalyticsUrl(url) {
  return url.pathname === "/" && !url.hash &&
    [...url.searchParams.keys()].every(key => /^utm_(source|medium|campaign|term|content)$/.test(key));
}
