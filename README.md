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

## Deployment

The web app is deployed on Railway. In production, the backend serves the built frontend assets.

## Current State

This is a working web application with active mobile and product-expansion work. The current browser hot path is:

`InputScreen -> useTrip.submitTrip() -> /api/v1/trip/parse-input -> /api/v1/trip/stream -> ResultsScreen`

Packing and safety data continue loading in the background after the first results render.
