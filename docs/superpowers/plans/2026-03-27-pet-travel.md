# Pet Travel Feature — Implementation Plan

**Date:** 2026-03-27
**Spec:** `docs/superpowers/specs/2026-03-27-pet-travel-design.md`
**Branch:** `feature/pet-travel`

---

## Overview

This plan breaks the pet travel feature into 22 independent tasks across 7 phases.
Each task follows TDD (RED -> GREEN -> REFACTOR) and is sized for ~30 min of focused work.
Tasks within a phase can often run in parallel; cross-phase dependencies are noted explicitly.

---

## Phase 1: Data Model & Sanitization (Backend)

### Task 1.1 — Type contracts for Pet data model

**Description:** Add `Pet`, `PetAirlineGuidance`, `PetEntryRequirements`, and `PetTravelCheckResponse` interfaces to the shared type contracts.

**Files to modify:**
- `src/shared/types/trip.ts` — add `Pet` interface, update `TripRequest` to include `pets: Pet[]`
- `src/shared/types/api.ts` — add `PetTravelCheckResponse`, `PetAirlineGuidance`, `PetEntryRequirements`

**Dependencies:** None

**Test requirements:** Type contracts are declarative; no runtime tests needed. Verify `npm run build` passes (TypeScript compilation check).

---

### Task 1.2 — sanitizePets() and sanitizeSpecialNeeds()

**Description:** Add pet input sanitization functions to `inputSafety.js`. `sanitizePets()` validates the pet array (max 5 items), sanitizes each field (type against allowlist, breed/name via `sanitizeDestination()`, weightLbs clamped 0-300, specialNeeds with medical-safe character set capped at 300 chars). Update `sanitizeTripPayload()` to include `pets`.

**Files to modify:**
- `src/backend/services/inputSafety.js` — add `sanitizePets()`, `sanitizeSpecialNeeds()`, update `sanitizeTripPayload()`

**Files to create:**
- None (extend existing file)

**Dependencies:** None

**Test requirements (RED first):**
- `tests/unit/sanitize.test.js` — add tests:
  - `sanitizePets() returns empty array for undefined/null input`
  - `sanitizePets() caps array at 5 pets`
  - `sanitizePets() rejects invalid pet type, defaults to "dog"`
  - `sanitizePets() clamps weightLbs to 0-300`
  - `sanitizePets() sanitizes breed with accented characters ("Bichon Frise")`
  - `sanitizeSpecialNeeds() allows medical dosages ("5mg twice daily")`
  - `sanitizeSpecialNeeds() strips injection patterns`
  - `sanitizeSpecialNeeds() caps at 300 chars`
  - `sanitizeTripPayload() includes sanitized pets array`

---

### Task 1.3 — Travel mode derivation utility

**Description:** Add a `deriveTravelMode()` function that determines "fly" or "drive" based on distance (using existing `haversineDistanceMiles` from `geocoding.js`) and country code. Under 500 miles domestic = "drive", international or over 500 miles = "fly". Accepts an optional override from the request body.

**Files to create:**
- `src/backend/services/travelMode.js` — `deriveTravelMode(originCoords, destCoords, countryCode, override?)`

**Dependencies:** Uses `haversineDistanceMiles` from `geocoding.js` (already exported)

**Test requirements (RED first):**
- `tests/unit/travelMode.test.js`:
  - `returns "drive" for domestic trip under 500 miles`
  - `returns "fly" for domestic trip over 500 miles`
  - `returns "fly" for international trip regardless of distance`
  - `respects explicit override "drive" even for long distance`
  - `respects explicit override "fly" even for short distance`
  - `defaults to "fly" when coords missing`

---

## Phase 2: Static Databases (Airline Rules, Entry Rules)

### Task 2.1 — Airline pet policy database

**Description:** Create the static airline pet policy database following the `carSeatRules.js` pattern. Cover Delta, United, American Airlines, Southwest, JetBlue, and Alaska Airlines. Export a lookup function `getAirlineRules(carrierCode)` and `getAllAirlineRules()`.

**Files to create:**
- `src/backend/data/petAirlineRules.js` — static data + lookup functions

**Dependencies:** None

**Test requirements (RED first):**
- `tests/unit/petAirlineRules.test.js`:
  - `getAllAirlineRules() returns exactly 6 carriers`
  - `getAirlineRules("DL") returns Delta rules with expected fields`
  - `getAirlineRules("INVALID") returns null`
  - `every carrier has required fields (cabinAllowed, cabinMaxWeightLbs, etc.)`
  - `bannedBreeds is an array for every carrier`
  - `source field is a valid URL string for every carrier`

**Human review required:** Airline policy data must be verified against official carrier websites before merge.

---

### Task 2.2 — International pet entry requirements database

**Description:** Create the static pet entry rules database for Tier 1 countries (US domestic, Canada, Mexico, UK, EU). Export `getEntryRules(countryCode)` and `getAllEntryRules()`.

**Files to create:**
- `src/backend/data/petEntryRules.js` — static data + lookup functions

**Dependencies:** None

**Test requirements (RED first):**
- `tests/unit/petEntryRules.test.js`:
  - `getEntryRules("US") returns domestic rules (no quarantine, no import permit)`
  - `getEntryRules("GB") returns UK rules with microchip required`
  - `getEntryRules("CA") returns Canada rules`
  - `getEntryRules("JP") returns null (not Tier 1)`
  - `getEntryRules("INVALID") returns null`
  - `quarantine countries have quarantineDays > 0`
  - `every entry has source URL`
  - `UK bannedBreeds includes expected breeds`

**Human review required:** Entry requirement data must be verified against official government sources before merge.

---

### Task 2.3 — Per-pet airline eligibility checker

**Description:** Create a pure function `checkPetAirlineEligibility(pet, airlineRules)` that returns `{ cabinEligible, cargoEligible, breedWarning, requiredDocuments }` for a single pet against a single airline's rules. Checks weight limits, breed bans, brachycephalic restrictions, type restrictions (cat, small animal).

**Files to create:**
- `src/backend/services/petEligibility.js` — `checkPetAirlineEligibility(pet, rules)`, `checkAllAirlines(pet)`

**Dependencies:** Task 2.1 (petAirlineRules.js)

**Test requirements (RED first):**
- `tests/unit/petEligibility.test.js`:
  - `20lb dog is cabin eligible on Delta (limit 20lb+carrier)`
  - `80lb dog is NOT cabin eligible, IS cargo eligible`
  - `pit bull triggers breed warning on airlines with brachycephalic ban`
  - `cat is eligible on airlines where catAllowed=true`
  - `small animal rejected on airlines where smallAnimalAllowed=false`
  - `checkAllAirlines returns results for all 6 carriers`
  - `required documents list includes health certificate`

---

## Phase 3: Pet Safety Orchestrator + API Route

### Task 3.1 — petSafety.js orchestrator service

**Description:** Create the orchestrator that combines airline eligibility, entry rules, and AI contextual summary. Uses DI pattern matching `safetyRules.js`. For `travelMode === "fly"`, checks all airlines. For `travelMode === "drive"`, skips airline rules. Looks up entry rules by `countryCode`. Generates AI summary using static results as constraints.

**Files to create:**
- `src/backend/services/petSafety.js` — `getPetTravelGuidance(pets, destination, travelMode, countryCode, deps)`

**Dependencies:** Task 2.1, Task 2.2, Task 2.3

**Test requirements (RED first):**
- `tests/unit/petSafety.test.js` (DI pattern, mock AI call):
  - `fly mode returns airline guidance for all carriers per pet`
  - `drive mode returns null airline guidance`
  - `returns entry requirements when countryCode found`
  - `returns null entry requirements for unknown country`
  - `handles multiple pets independently`
  - `passes static rules as constraints to AI prompt`
  - `returns structured response matching PetTravelCheckResponse shape`
  - `handles empty pets array with 422-style error`
  - `handles invalid travelMode with 422-style error`

---

### Task 3.2 — POST /api/v1/safety/pet-travel-check route

**Description:** Add the Express route in `server.js`. Validates request body (pets array required, travelMode must be "fly" or "drive"), calls `getPetTravelGuidance()`, returns structured JSON. Uses existing `apiLimiter`.

**Files to modify:**
- `src/backend/server.js` — add route, import petSafety service

**Dependencies:** Task 3.1

**Test requirements (RED first):**
- `tests/integration/api.integration.test.js` — add tests:
  - `POST /api/v1/safety/pet-travel-check returns 200 with valid pet data`
  - `POST /api/v1/safety/pet-travel-check returns 422 for empty pets array`
  - `POST /api/v1/safety/pet-travel-check returns 422 for invalid travelMode`
  - `POST /api/v1/safety/pet-travel-check returns airline guidance for fly mode`
  - `POST /api/v1/safety/pet-travel-check skips airlines for drive mode`

---

## Phase 4: AI Prompt Changes (Trip Plan + Packing List)

### Task 4.1 — Trip plan AI prompt: pet-aware planning

**Description:** Update `tripPlanAI.js` to inject pet context into the system prompt when `pets.length > 0`. Add the pet-aware planning rules (pet-friendly restaurants, dog parks, daycare suggestions, no vehicle warnings). Add `petFriendly` field to the `suggestedActivities` schema.

**Files to modify:**
- `src/backend/services/tripPlanAI.js` — update prompt builder to include pet section

**Dependencies:** Task 1.2 (sanitized pet data flows in)

**Test requirements (RED first):**
- `tests/unit/tripPlanAI.test.js` — add tests:
  - `prompt includes PETS TRAVELING section when pets present`
  - `prompt includes pet-aware planning rules when pets present`
  - `prompt omits pet section when no pets`
  - `prompt includes pet names and special needs`
  - `activity schema includes petFriendly field when pets present`

---

### Task 4.2 — Packing list AI prompt: pet packing category

**Description:** Update `packingListAI.js` to generate a per-pet packing category when `pets.length > 0`. The AI receives pet type, breed, weight, travel mode, climate, and trip length. Expected items include leash, carrier, food bowls, waste bags, vaccination records, medications, weather gear.

**Files to modify:**
- `src/backend/services/packingListAI.js` — update prompt builder to include pet packing section

**Dependencies:** Task 1.2 (sanitized pet data)

**Test requirements (RED first):**
- `tests/unit/packingListAI.test.js` — add tests:
  - `prompt includes pet packing section when pets present`
  - `prompt specifies per-pet items (name, type, travel mode)`
  - `prompt omits pet section when no pets`
  - `prompt includes travel mode for carrier type guidance`

---

### Task 4.3 — Places enrichment: pet-friendly restaurant queries

**Description:** Update `placesEnrich.js` to append "pet-friendly" to restaurant text queries when pets are present. Implement fallback: if pet-friendly query returns zero results, retry without the modifier.

**Files to modify:**
- `src/backend/services/placesEnrich.js` — modify restaurant query builder, add fallback logic

**Dependencies:** Task 1.2 (pets array in trip payload)

**Test requirements (RED first):**
- `tests/unit/placesEnrich.test.js` — add tests:
  - `restaurant query includes "pet-friendly" when pets present`
  - `non-restaurant queries unchanged when pets present`
  - `fallback retries without "pet-friendly" on zero results`
  - `queries unchanged when no pets`

---

## Phase 5: Frontend (FamilyStep, PetSafetyTile, Itinerary Updates)

### Task 5.1 — api.js: add pets to all payloads + petTravelCheck()

**Description:** Update the frontend API service to include `pets` array in trip-plan, packing-list, and safety payloads. Add new `petTravelCheck(pets, destination, countryCode, travelMode)` function.

**Files to modify:**
- `src/frontend/src/services/api.js` — add pets to existing calls, add `petTravelCheck()`

**Dependencies:** Task 3.2 (route must exist)

**Test requirements:** Manual verification via browser dev tools (frontend has 0% test coverage currently). Verify network tab shows pets in request payloads.

---

### Task 5.2 — KidsStep.jsx -> FamilyStep.jsx rename + pets input

**Description:** Rename `KidsStep.jsx` to `FamilyStep.jsx`. Keep the existing children section unchanged. Add a new "Pets" section below with add/remove pet cards. Each card has: type dropdown (dog/cat/small animal), name text input, breed text input, weight number input, special needs textarea.

**Files to create:**
- `src/frontend/src/components/wizard/FamilyStep.jsx` — unified kids + pets wizard step

**Files to modify:**
- `src/frontend/src/components/wizard/KidsStep.jsx` — delete (replaced by FamilyStep)
- `src/frontend/src/App.jsx` — update import from KidsStep to FamilyStep

**Dependencies:** None (frontend-only, can run in parallel with backend tasks)

**Test requirements:**
- Accessibility: `aria-label` on add/remove pet buttons, type dropdown
- Manual verification: add up to 5 pets, remove pets, verify form state flows to App.jsx

---

### Task 5.3 — PetSafetyTile.jsx component

**Description:** Create `PetSafetyTile` in the mosaic directory following `SafetyTile.jsx` patterns. Displays: airline eligibility comparison table per pet, international entry requirements, required documents checklist, timeline warnings for strict countries.

**Files to create:**
- `src/frontend/src/components/mosaic/PetSafetyTile.jsx`

**Dependencies:** Task 3.2 (API response shape)

**Test requirements:**
- Accessibility: table has proper headers, `aria-label` on the tile
- Manual verification: renders with mock data, displays comparison table, shows entry requirements

---

### Task 5.4 — ItineraryTile.jsx: pet-friendly badges

**Description:** Update `ItineraryTile.jsx` to show a paw print badge on pet-friendly activities and a no-pets warning on restricted venues. Add daycare suggestion card when family visits a no-pets venue.

**Files to modify:**
- `src/frontend/src/components/mosaic/ItineraryTile.jsx` — add pet badge rendering logic

**Dependencies:** Task 4.1 (petFriendly field in activity data)

**Test requirements:**
- Manual verification: activities with `petFriendly: true` show paw badge, `petFriendly: false` show warning

---

### Task 5.5 — PackingChecklist.jsx: pet packing category

**Description:** Update `PackingChecklist.jsx` to render the pet packing category alongside existing categories. Pet items use the same check state and item ID patterns.

**Files to modify:**
- `src/frontend/src/components/PackingChecklist.jsx` — render pet category section

**Dependencies:** Task 4.2 (pet packing items in API response)

**Test requirements:**
- Manual verification: pet packing items appear in their own section, checkboxes work

---

### Task 5.6 — ResultsScreen.jsx + App.jsx: wire pet flow

**Description:** Update `ResultsScreen.jsx` to render `PetSafetyTile` when `pets.length > 0`. Update `App.jsx` to pass the pets array through all API calls, call `petTravelCheck()`, and thread pet safety data to results.

**Files to modify:**
- `src/frontend/src/App.jsx` — add pets to state, pass through API calls, call pet-travel-check
- `src/frontend/src/components/ResultsScreen.jsx` (or equivalent results container) — render PetSafetyTile conditionally

**Dependencies:** Task 5.1, Task 5.2, Task 5.3

**Test requirements:**
- Manual E2E: submit wizard with pets, verify all tiles render with pet data

---

## Phase 6: E2E Tests

### Task 6.1 — E2E: PetSafetyTile rendering

**Description:** Playwright test that mocks the pet-travel-check API response and verifies the PetSafetyTile renders the airline comparison table, entry requirements, and document checklist.

**Files to create:**
- `tests/e2e/tiles/pet-safety-tile.spec.ts`

**Dependencies:** Task 5.3, Task 5.6

**Test requirements:**
- Mocked pet data renders airline comparison table
- Entry requirements section shows when present
- Document checklist renders with checkboxes
- Timeline warning shows for strict countries

---

### Task 6.2 — E2E: FamilyStep input screen

**Description:** Playwright test for the FamilyStep wizard component. Verifies both children and pets sections render, pets can be added/removed, and form validation works.

**Files to create or modify:**
- `tests/e2e/screens/input-screen.spec.ts` — update or create for FamilyStep

**Dependencies:** Task 5.2

**Test requirements:**
- FamilyStep renders both children and pets sections
- Add pet card populates fields
- Remove pet card works
- Max 5 pets enforced
- Type dropdown has 3 options

---

### Task 6.3 — E2E: Full pet trip flow

**Description:** End-to-end Playwright test for the complete flow: add a dog in the wizard, generate trip, verify pet-friendly badges in itinerary, pet packing category, and pet safety tile.

**Files to create:**
- `tests/e2e/flows/pet-trip.spec.ts`

**Dependencies:** All Phase 5 tasks

**Test requirements:**
- Add dog in wizard (golden retriever, 20 lbs)
- Generate trip plan
- Verify itinerary has pet-friendly badges
- Verify packing list has pet category
- Verify pet safety tile shows airline comparison

---

## Phase 7: Integration Testing

### Task 7.1 — Integration: pet-travel-check endpoint with DI

**Description:** Full integration test of the pet-travel-check endpoint using the `createApp(deps)` DI pattern. Mocks AI service but uses real static databases and eligibility checker.

**Files to modify:**
- `tests/integration/api.integration.test.js` — add pet-travel-check integration tests

**Dependencies:** Task 3.2

**Test requirements:**
- Real airline rules + real entry rules + mocked AI = correct response shape
- Multi-pet request returns per-pet guidance
- Drive mode skips airline guidance
- Unknown country returns null entry requirements but still returns airline guidance
- Request sanitization strips injection attempts from pet names/breeds

---

### Task 7.2 — Integration: trip-plan endpoint with pets

**Description:** Integration test verifying that the trip-plan endpoint correctly injects pet context into the AI prompt when pets are present in the payload.

**Files to modify:**
- `tests/integration/api.integration.test.js` — add trip-plan-with-pets tests

**Dependencies:** Task 4.1

**Test requirements:**
- POST /api/trip-plan with pets array includes pet context in AI prompt
- POST /api/trip-plan without pets omits pet context
- Sanitized pet data flows correctly (no raw user input in prompt)

---

## Dependency Graph

```
Phase 1 (no dependencies — start here)
  1.1 Type contracts
  1.2 sanitizePets()          ──┐
  1.3 deriveTravelMode()       │
                                │
Phase 2 (no dependencies — can run parallel with Phase 1)
  2.1 Airline rules DB         │
  2.2 Entry rules DB           │
  2.3 Eligibility checker ← 2.1│
                                │
Phase 3 (depends on Phase 1 + Phase 2)
  3.1 petSafety.js ← 1.2, 2.1, 2.2, 2.3
  3.2 API route ← 3.1
                                │
Phase 4 (depends on Phase 1)    │
  4.1 tripPlanAI ← 1.2         │
  4.2 packingListAI ← 1.2      │
  4.3 placesEnrich ← 1.2       │
                                │
Phase 5 (frontend, mixed dependencies)
  5.1 api.js ← 3.2
  5.2 FamilyStep.jsx (independent)
  5.3 PetSafetyTile.jsx ← 3.2
  5.4 ItineraryTile.jsx ← 4.1
  5.5 PackingChecklist.jsx ← 4.2
  5.6 Wire it all ← 5.1, 5.2, 5.3
                                │
Phase 6 (E2E, depends on Phase 5)
  6.1 PetSafetyTile E2E ← 5.3, 5.6
  6.2 FamilyStep E2E ← 5.2
  6.3 Full flow E2E ← all Phase 5
                                │
Phase 7 (integration, depends on Phase 3 + 4)
  7.1 pet-travel-check integration ← 3.2
  7.2 trip-plan-with-pets integration ← 4.1
```

---

## Parallelism Guide for Subagents

The following task groups can be assigned to independent subagents simultaneously:

**Batch A (no dependencies):**
- Task 1.1, Task 1.2, Task 1.3, Task 2.1, Task 2.2

**Batch B (after 2.1 completes):**
- Task 2.3

**Batch C (after Batch A + B complete):**
- Task 3.1, Task 4.1, Task 4.2, Task 4.3 (4.x only needs 1.2)

**Batch D (after 3.1 completes):**
- Task 3.2

**Batch E (frontend, after 3.2 and 4.x complete):**
- Task 5.1, Task 5.2 (independent), Task 5.3, Task 5.4, Task 5.5

**Batch F (after Batch E completes):**
- Task 5.6

**Batch G (after Phase 5 completes):**
- Task 6.1, Task 6.2, Task 6.3, Task 7.1, Task 7.2

---

## Files Summary

### New files (11)
| File | Task |
|------|------|
| `src/backend/services/travelMode.js` | 1.3 |
| `src/backend/data/petAirlineRules.js` | 2.1 |
| `src/backend/data/petEntryRules.js` | 2.2 |
| `src/backend/services/petEligibility.js` | 2.3 |
| `src/backend/services/petSafety.js` | 3.1 |
| `src/frontend/src/components/wizard/FamilyStep.jsx` | 5.2 |
| `src/frontend/src/components/mosaic/PetSafetyTile.jsx` | 5.3 |
| `tests/unit/travelMode.test.js` | 1.3 |
| `tests/unit/petAirlineRules.test.js` | 2.1 |
| `tests/unit/petEntryRules.test.js` | 2.2 |
| `tests/unit/petEligibility.test.js` | 2.3 |

### Modified files (12)
| File | Task(s) |
|------|---------|
| `src/shared/types/trip.ts` | 1.1 |
| `src/shared/types/api.ts` | 1.1 |
| `src/backend/services/inputSafety.js` | 1.2 |
| `src/backend/server.js` | 3.2 |
| `src/backend/services/tripPlanAI.js` | 4.1 |
| `src/backend/services/packingListAI.js` | 4.2 |
| `src/backend/services/placesEnrich.js` | 4.3 |
| `src/frontend/src/services/api.js` | 5.1 |
| `src/frontend/src/App.jsx` | 5.2, 5.6 |
| `src/frontend/src/components/mosaic/ItineraryTile.jsx` | 5.4 |
| `src/frontend/src/components/PackingChecklist.jsx` | 5.5 |
| `tests/unit/sanitize.test.js` | 1.2 |

### Deleted files (1)
| File | Task |
|------|------|
| `src/frontend/src/components/wizard/KidsStep.jsx` | 5.2 (replaced by FamilyStep.jsx) |

### New test files (7)
| File | Task |
|------|------|
| `tests/unit/travelMode.test.js` | 1.3 |
| `tests/unit/petAirlineRules.test.js` | 2.1 |
| `tests/unit/petEntryRules.test.js` | 2.2 |
| `tests/unit/petEligibility.test.js` | 2.3 |
| `tests/unit/petSafety.test.js` | 3.1 |
| `tests/e2e/tiles/pet-safety-tile.spec.ts` | 6.1 |
| `tests/e2e/screens/input-screen.spec.ts` | 6.2 |
| `tests/e2e/flows/pet-trip.spec.ts` | 6.3 |

### Modified test files (3)
| File | Task(s) |
|------|---------|
| `tests/unit/sanitize.test.js` | 1.2 |
| `tests/unit/tripPlanAI.test.js` | 4.1 |
| `tests/unit/packingListAI.test.js` | 4.2 |
| `tests/unit/placesEnrich.test.js` | 4.3 |
| `tests/integration/api.integration.test.js` | 3.2, 7.1, 7.2 |

---

## Human Review Gates

The following tasks produce user-visible safety/legal guidance and require human review before merge:

- **Task 2.1** — Airline pet policy data (verify against official carrier websites)
- **Task 2.2** — International entry requirement data (verify against official government sources)
- **Task 3.1** — AI contextual summary text (verify static data always overrides AI)

---

## Estimated Total Effort

| Phase | Tasks | Est. Time |
|-------|-------|-----------|
| 1. Data model & sanitization | 3 | 1.5 hrs |
| 2. Static databases | 3 | 1.5 hrs |
| 3. Orchestrator + API route | 2 | 1 hr |
| 4. AI prompt changes | 3 | 1.5 hrs |
| 5. Frontend | 6 | 3 hrs |
| 6. E2E tests | 3 | 1.5 hrs |
| 7. Integration testing | 2 | 1 hr |
| **Total** | **22** | **~11 hrs** |

With maximum parallelism (3-4 subagents), wall-clock time is approximately 4-5 hours.
