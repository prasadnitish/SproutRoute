# SproutRoute

SproutRoute is a family trip planner built as a full-stack web product, with active mobile work in the same repository. It combines itinerary generation, weather-aware planning, packing support, and family travel safety features into one user flow.

## Primary References

- `docs/WEB_CODE_GRAPH.md` for the current web-app code path and ownership map
- `docs/ARCHITECTURE.md` for the broader system, service, and deployment view

## What This Project Demonstrates

- end-to-end product ownership across frontend, backend, and deployment
- practical AI integration paired with deterministic supporting systems
- external API orchestration for weather, geocoding, and safety workflows
- trust-oriented product design through packing, car-seat, and pet-travel guidance
- progressive rendering for long-running AI work with immediate UI feedback

## Current Scope

- React + Vite frontend in `src/frontend/`
- Express backend in `src/backend/`
- shared TypeScript contracts in `src/shared/`
- Node unit and integration tests in `tests/`
- Expo mobile workspace in `mobile/`

## Current Product Capabilities

- free-text trip parsing into structured intent
- progressive trip generation via `/api/v1/trip/stream`
- multi-stop and whole-country trip planning with route review
- AI itinerary generation with early results rendering
- background packing generation and persisted checklist progress
- general travel safety, child passenger safety, and pet travel guidance
- profile import from external AI tools with browser-local persistence
- on-demand place enrichment for itinerary activities

## Run Locally

```bash
npm install
npm run dev
```

Useful commands:

```bash
npm test
npm run build
npm run dev:frontend
npm run dev:backend
```

## Repo Layout

```text
src/frontend/  React SPA
src/backend/   Express API and service orchestration
src/shared/    shared contracts
tests/         unit and integration tests
mobile/        Expo mobile app workspace
docs/          architecture, code graph, PRDs, and delivery notes
```

## Multi-Agent Orchestrator + MCP Server

The trip-planning logic is also reachable as an MCP (Model Context Protocol) server, so any MCP client (e.g. Claude Desktop) can call it directly. A LangGraph.js orchestrator wraps the existing retrieval, itinerary, safety, and packing services — unchanged — into four specialist agents, fanning out and converging in a single graph. Every agent handoff is logged to Supabase (`agent_runs`) with status (`ok`/`error`/`skipped`) and latency, so a full run is inspectable end to end.

Two tools are exposed at `POST /mcp`:

- `plan_trip(destination, startDate, endDate, children?, pets?, activities?)` — runs the full orchestrator, returns itinerary + packing list + safety guidance.
- `get_agent_trace(runId)` — returns the ordered handoff spans for a prior `plan_trip` call.

To connect from Claude Desktop, add this to `claude_desktop_config.json` (ask for the current demo token — it's not committed anywhere):

```json
{
  "mcpServers": {
    "sproutroute": {
      "url": "https://sproutroute.app/mcp",
      "headers": { "Authorization": "Bearer <token>" }
    }
  }
}
```

The endpoint sits behind a constant-time bearer-token check and a 10-request/hour rate limit (it triggers real paid LLM calls). Set `MCP_ENABLED=false` in Railway to disable it instantly without a redeploy, if the token ever leaks or costs spike.

## Deployment

The web app is deployed on Railway. In production, the backend serves the built frontend assets.

## Current State

This is a working web application with active mobile and product-expansion work. The current browser hot path is:

`InputScreen -> useTrip.submitTrip() -> /api/v1/trip/parse-input -> optional RouteReviewPanel -> /api/v1/trip/stream -> ResultsScreen`

Packing and safety data continue loading in the background after the first results render.
