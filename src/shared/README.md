# SproutRoute — Shared Contracts

This package contains TypeScript types that are the **source of truth** for all API shapes.

## What's here

```
src/shared/
├── types/
│   ├── api.ts      ← ApiError, CapabilityPayload, V1RequestBase, error envelope
│   ├── trip.ts     ← TripPlanRequest/Response, PackingList, CarSeatCheck, ChildProfile
│   └── index.ts    ← Barrel export (import from here)
└── README.md
```

## Usage

**Frontend (web):**
```ts
import type { TripPlanRequest, ApiError } from '../../shared/types';
```

**Mobile (Expo — Phase 3):**
```ts
import type { TripPackingRequest, PackingList } from '../shared/types';
```

## Update process

When the API shape changes:
1. Update the type in `src/shared/types/`
2. Update the backend handler in `src/backend/server.js`
3. Update the frontend API call in `src/frontend/src/services/api.js`
4. Update the mobile API call in `sproutroute-mobile/services/api.ts` (Phase 3+)
5. Run `npm test` — contract tests will catch shape mismatches

## Key design decisions

- **No Zod schemas yet** (Phase 1 is types-only). Phase 2 adds runtime validation.
- **ESM only** — uses `.js` extensions in imports per project's `"type": "module"` setting.
- **No circular deps** — `trip.ts` imports from `api.ts`, never the reverse.
