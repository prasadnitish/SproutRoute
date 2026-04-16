# 2026-04-16 — Web documentation sync

## Summary

Updated the repo’s existing documentation to match the current web application flow and the new `docs/WEB_CODE_GRAPH.md` reference.

## Files updated

- `README.md`
- `docs/ARCHITECTURE.md`
- `AGENTS.md`
- `docs/WEB_CODE_GRAPH.md` (created earlier in this session)

## Key learnings captured

- The real frontend control plane is `src/frontend/src/hooks/useTrip.js`, not `App.jsx`.
- The primary browser path is `POST /api/v1/trip/parse-input` followed by `POST /api/v1/trip/stream`.
- `ResultsScreen.jsx` is the current composition hub for the web UI.
- Packing still uses legacy `POST /api/generate` in the live browser flow even though v1 packing routes exist.
- Place enrichment is lazy and activity-driven through `usePlacesEnrich`.
- Profile import is currently browser-local first via `ProfileImportModal`, while auth-backed profile routes exist for signed-in flows.

## Why this changed

The older docs still referenced earlier component ownership and request sequencing. That mismatch was starting to make first-read orientation slower and less reliable, especially for the web app.
