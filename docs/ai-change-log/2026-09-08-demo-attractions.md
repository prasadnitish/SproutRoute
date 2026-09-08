# Restore web trip generation

Production baseline: `3aac762d158ee0b1a1dbc8ac11032cb75c0bee31`.

The apex website served a bundle built with the www API hostname. Its
`connect-src 'self'` policy blocked trip requests. Production web requests now
use relative URLs because Express serves both the SPA and API. Development
still supports VITE_API_URL. No CSP or CORS permissions were broadened.

The Japan winter prompt also produced a country route with valid stops but a
null destination. Normalize that missing field from the existing countryTour
country so downstream validation accepts the route without changing its stops.

Both failures reproduced before the changes in regression tests. Validate with
`npm test` and `cd src/frontend && npm run build`. Live verification: generate
"japan trip for 2 in winter", review the proposed route/dates, press Continue,
and confirm named attractions in the itinerary. Check both apex and www hosts.

Live follow-up found itinerary generation also exceeded the default 20-second
AI deadline. A controlled six-day Tokyo request with AI_PROVIDER_TIMEOUT_MS=60000
returned 24 attractions in 60.6 seconds total (37.3-second primary response and
23.3-second compact retry). Set that existing Railway variable to 60000 and
redeploy the same hotfix snapshot. No credentials or provider selection changed.
The deadline remains bounded. Longer term, size chunks/output budgets together,
reserve time for fallback providers, and replace indefinite itinerary loading
with an explicit failure/retry state.

Local validation: 513 tests passed and Vite build passed. GitHub Test & Build
and E2E Tests passed for be84ed0. The parser and API hostname checks also passed
in live Chrome on both apex and www after the first deployment.

For incidents, collect request IDs, status and duration for parse-input,
route-attractions, and trip/stream; check SSE itinerary events and provider errors.
Avoid storing cookies, credentials, or unrelated user prompts in the report.
Rollback to Railway deployment `4706f309-8726-4402-b45d-619eb6f5fee4` if needed;
that baseline still has the hostname bug.
