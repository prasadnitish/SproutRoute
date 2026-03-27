# Pet Travel Feature — Design Spec

**Date:** 2026-03-27
**Status:** Approved
**Author:** Nitish Prasad + Claude

---

## Problem

SproutRoute plans trips for families with children but ignores pets entirely. 68 million US households own dogs, 78% travel with them, and the pet travel market is $2.5B growing at 8.5% CAGR. Families currently juggle 4-5 separate tools for kid logistics AND pet logistics. No existing app combines both in one flow.

BringFido is the closest competitor but it is a directory — no itinerary building, no packing lists, no safety integration, no airline policy guidance. SproutRoute would be the first family trip planner to handle kids and pets together.

## Solution

Add pet-aware travel planning across all existing features: wizard input, AI itinerary generation, packing lists, safety guidance (airline policies + international entry requirements), and place discovery.

## Design

### 1. Pet Data Model & Input

#### Wizard (KidsStep → FamilyStep rename)

The existing `KidsStep.jsx` becomes `FamilyStep.jsx` with two sections: Children (unchanged) and Pets (new). Each pet entry captures:

```json
{
  "type": "dog | cat | small_animal",
  "name": "Max",
  "breed": "golden retriever",
  "weightLbs": 20,
  "specialNeeds": "anxiety medication"
}
```

Fields:
- `type` — dropdown: dog, cat, small animal (rabbit, bird, etc.)
- `name` — optional text, used for personalized output
- `breed` — free text, used for airline breed restrictions
- `weightLbs` — number, determines cabin vs cargo eligibility
- `specialNeeds` — free text (medications, anxiety, dietary restrictions)

#### Travel mode derivation

`travelMode` ("fly" or "drive") is **not a new wizard field**. It is derived automatically on the backend:
- If the destination is within 500 miles of the origin (using the existing `haversineDistanceMiles` from `geocoding.js`), default to `"drive"`
- If the destination is international (`countryCode !== "US"`), default to `"fly"`
- Otherwise, default to `"fly"` (most family trips >500 miles involve flights)
- The frontend can override this with an optional `travelMode` field in the request body

The `countryCode` is already resolved during the destination resolution step (`geocoding.js` returns it). It flows through the existing trip data payload and is passed to the pet safety endpoint the same way it reaches the car seat check endpoint today.

#### AI Parser (parse-input)

The NLP parser in `parseInput.js` detects pet mentions from free text: "traveling with our 20lb golden retriever" extracts `{ type: "dog", breed: "golden retriever", weightLbs: 20 }`. Added to the existing response alongside children, dates, and destination.

**Ambiguity handling:** If the parser cannot confidently distinguish a pet mention from other text (e.g., "bringing our lab" could mean Labrador or laboratory), it sets a `petDetected: true` flag with `confidence: "low"` and the frontend prompts the user to confirm in the FamilyStep.

#### API shape addition

The `pets` array is added to the trip data payload passed through all backend services:

```json
{
  "destination": "Maui, Hawaii",
  "startDate": "2026-05-21",
  "endDate": "2026-05-26",
  "children": [{ "age": 8 }],
  "pets": [
    { "type": "dog", "name": "Max", "breed": "golden retriever",
      "weightLbs": 20, "specialNeeds": "anxiety medication" }
  ],
  "countryCode": "US",
  "travelMode": "fly"
}
```

#### Input sanitization

New `sanitizePets()` function in `inputSafety.js`:
- `type` validated against allowlist: `["dog", "cat", "small_animal"]`
- `breed` sanitized through `sanitizeDestination()` (allows accented characters for international breed names like "Bichon Frisé"), capped at 80 chars
- `weightLbs` parsed as number, clamped to 0-300
- `specialNeeds` sanitized through a new `sanitizeSpecialNeeds()` function: strips injection patterns and HTML, allows `[a-zA-Z0-9\s,.\-'()&/+#:;mg]` (accommodates dosages like "5mg twice daily"), capped at 300 chars. Placed in the **user turn** of AI prompts, never the system turn.
- `name` sanitized through `sanitizeDestination()` (allows accented characters, periods for "Mr. Whiskers"), capped at 50 chars
- Array capped at 5 pets max

`sanitizeTripPayload()` in `inputSafety.js` is updated to include `pets: sanitizePets(tripData.pets || [])` in its output.

### 2. Airline Pet Policies (Hybrid Static + AI)

#### Static database — `src/backend/data/petAirlineRules.js`

Located in the `data/` directory following the `carSeatRules.js` pattern. Covers 6 major US carriers with verified data:

| Field | Type | Description |
|-------|------|-------------|
| `carrier` | string | Airline name |
| `carrierCode` | string | IATA code (e.g., "DL", "UA") |
| `cabinAllowed` | boolean | Whether pets allowed in cabin |
| `cabinMaxWeightLbs` | number | Max weight for pet + carrier in cabin |
| `cabinFee` | string | Fee per direction |
| `cabinCarrierDimensions` | string | Required carrier size |
| `cargoAllowed` | boolean | Whether pets allowed in cargo |
| `cargoFee` | string | Fee range |
| `bannedBreeds` | string[] | Breeds restricted from cargo/cabin |
| `brachycephalicBan` | boolean | Whether snub-nosed breeds banned from cargo |
| `tempRestrictions` | string | Temperature-based cargo restrictions |
| `healthCertDays` | number | Days before travel vet certificate required |
| `minAgeWeeks` | number | Minimum pet age for travel |
| `catAllowed` | boolean | Whether cats allowed |
| `smallAnimalAllowed` | boolean | Whether birds/rabbits etc. allowed |
| `source` | string | URL to official airline policy page |

Initial carriers: Delta, United, American Airlines, Southwest, JetBlue, Alaska Airlines.

#### Authority model: static data is authoritative, AI is advisory

The static database is the **single source of truth** for hard facts: fees, weight limits, breed bans, document requirements. The AI contextual layer **only wraps these facts into actionable advice** — it cannot override, contradict, or invent policy details. If the AI generates guidance that conflicts with static data, the static data wins. The `petSafety.js` orchestrator enforces this by injecting the static rules into the AI prompt as non-negotiable constraints.

#### Airline selection: return ALL eligible carriers

The endpoint does **not** pick a single airline. It checks the pet against **all 6 carriers** and returns eligibility results for each. The frontend `PetSafetyTile` displays a comparison table so the user can choose. The AI advisory section may highlight the best option (e.g., cheapest fee, most accommodating for the pet's size).

#### AI contextual layer

The trip plan AI prompt receives pet data + the full airline eligibility results and generates a contextual summary: "Max is 20 lbs — he qualifies for cabin on Delta ($95), United ($125), and JetBlue ($100). Delta is cheapest. Bring a soft-sided carrier under 18x14x8 inches." For road trips (`travelMode === "drive"`), airline rules are skipped and the AI focuses on rest stops, pet-friendly hotels along the route, and vehicle safety.

### 3. International Pet Entry Requirements

#### Static database — `src/backend/data/petEntryRules.js`

Located in the `data/` directory. Covers the top international destinations US families fly to.

| Field | Type | Description |
|-------|------|-------------|
| `countryCode` | string | ISO 3166-1 alpha-2 |
| `countryName` | string | Display name |
| `microchipRequired` | boolean | ISO 15-digit microchip needed |
| `rabiesVaccineRequired` | boolean | Rabies vaccination needed |
| `rabiesWaitDays` | number | Days between vaccination and travel |
| `healthCertificate` | string | Description of required health cert |
| `quarantine` | boolean | Whether quarantine applies |
| `quarantineDays` | number | Duration if quarantine required |
| `bannedBreeds` | string[] | Breeds banned from entry |
| `additionalTests` | string[] | Extra tests required (titer test, etc.) |
| `importPermit` | boolean | Whether import permit needed |
| `advanceNoticeDays` | number | Minimum days to start paperwork |
| `notes` | string | Country-specific gotchas |
| `source` | string | URL to official government page |

Country tiers for launch:
- **Tier 1 (launch):** US domestic, Canada, Mexico, UK, EU (standardized rules)
- **Tier 2 (Phase 4):** Japan, Australia, New Zealand (strict quarantine), Singapore, UAE
- **Tier 3 (future):** South America, Southeast Asia, Africa

For strict quarantine countries (Australia: 10+ day quarantine, Japan: 180-day rabies titer wait), the AI generates a **timeline warning**: "Traveling to Japan with Max requires starting paperwork 7 months before departure."

#### Orchestrator — `src/backend/services/petSafety.js`

Combines airline rules + entry rules + AI contextual advice. Same DI pattern as `safetyRules.js`:

```js
export async function getPetTravelGuidance(pets, destination, travelMode, countryCode, deps = {}) {
  // 1. Look up airline rules for ALL carriers if travelMode === "fly"
  // 2. Look up entry rules by countryCode (return null if not in database)
  // 3. Per pet: check eligibility against each airline (weight, breed, type)
  // 4. Generate AI contextual summary using static results as constraints
  // 5. Return structured guidance with warnings
}
```

#### New API route

`POST /api/v1/safety/pet-travel-check` — uses `apiLimiter` (no AI call in base path; AI summary is optional enrichment).

Request:
```json
{
  "pets": [{ "type": "dog", "breed": "golden retriever", "weightLbs": 20 }],
  "destination": "London, UK",
  "countryCode": "GB",
  "travelMode": "fly"
}
```

Response:
```json
{
  "airlineGuidance": [
    {
      "pet": "Max",
      "airlines": [
        {
          "carrier": "Delta",
          "carrierCode": "DL",
          "cabinEligible": true,
          "cabinFee": "$95 each way",
          "cargoEligible": true,
          "cargoFee": "$300-$700",
          "breedWarning": null,
          "requiredDocuments": ["Vet certificate within 10 days"]
        }
      ],
      "recommendation": "Max qualifies for cabin travel on Delta, United, and JetBlue. Delta is cheapest at $95 each way."
    }
  ],
  "entryRequirements": {
    "country": "United Kingdom",
    "microchipRequired": true,
    "rabiesVaccine": "Required, administered 21+ days before travel",
    "quarantine": false,
    "bannedBreeds": ["Pit Bull Terrier", "Japanese Tosa", "Dogo Argentino", "Fila Brasileiro"],
    "healthCertificate": "USDA-endorsed veterinary certificate within 10 days",
    "advanceNoticeDays": 30,
    "timelineWarning": null
  },
  "source": "gov.uk/bring-pet-to-great-britain"
}
```

Error responses follow the existing `v1Error` pattern:
- `422` — pets array empty or invalid, travelMode not in `["fly", "drive"]`
- `404` — countryCode not in database (entry requirements return `null`, airline guidance still returned)
- `500` — server error with `{ code: "PET_SAFETY_FAILED", message: "...", retryable: true }`

### 4. AI Prompt Changes & Pet-Friendly Discovery

#### Trip plan AI prompt (`tripPlanAI.js`)

When `pets.length > 0`, the system prompt includes:

```
PETS TRAVELING:
- Max: golden retriever, 20 lbs, anxiety medication

PET-AWARE PLANNING RULES:
1. All restaurant suggestions MUST be pet-friendly (outdoor seating or explicitly pet-welcoming)
2. Include at least 2 off-leash dog parks or pet exercise areas per day for dogs
3. For cats/small animals: suggest activities where pet stays safely at accommodation
4. Suggest one pet daycare/boarding option per day for activities that don't allow pets
5. Never suggest leaving pets in vehicles
6. Note pet-restricted venues clearly with a warning
7. Consider pet anxiety/energy levels when planning activity density
8. Include pet supply stores near accommodation for emergencies
```

The `suggestedActivities` schema gains a `petFriendly` boolean field alongside the existing `kidFriendly`. This field is **AI-generated** based on the model's knowledge of the venue. When pets are not present in the trip, `petFriendly` defaults to `null` (omitted from output). The Places enrichment step does not set this field — it remains AI-determined.

#### Packing list AI prompt (`packingListAI.js`)

New pet packing category generated per pet. AI receives pet type, breed, weight, travel mode, climate, and trip length. Expected items include: leash, carrier (soft/hard depending on travel mode), food and water bowls, waste bags, vaccination records, any medications, cooling vest (hot climate), paw booties (snow/hot pavement), pet first aid kit, familiar blanket/toy (anxiety reduction).

#### Google Places enrichment

For pet trips, `placesEnrich.js` appends "pet-friendly" to restaurant queries **only** (not all queries). This modifies the `textQuery` string passed to the Google Places Text Search API.

**Fallback strategy:** If the "pet-friendly" enriched query returns zero results, retry the query without the "pet-friendly" modifier and let the AI determine pet-friendliness from the venue description and outdoor seating availability. This prevents empty results in destinations with limited pet data in Google Places.

### 5. Frontend Components

#### New files

- `src/frontend/src/components/mosaic/PetSafetyTile.jsx` — displays airline eligibility comparison table per pet, international entry requirements, required documents checklist, and timeline warnings. Mirrors `TravelSafetyCard` layout.

#### Modified files

- `KidsStep.jsx` → renamed to `FamilyStep.jsx` — unified kids + pets input. Pets section has add/remove cards with type dropdown, breed text input, weight number input, special needs textarea.
- `ItineraryTile.jsx` — adds pet-friendly badge (🐾) on pet-welcoming activities, no-pets warning on restricted venues, and daycare suggestion cards when family visits a no-pets venue.
- `PackingChecklist.jsx` — renders pet packing category with per-pet items. Shop links work the same way (affiliate search URLs for pet travel gear).
- `ResultsScreen.jsx` — renders `PetSafetyTile` when `pets.length > 0`.
- `App.jsx` — passes pets array through all API calls.
- `api.js` — adds `pets` to trip-plan, packing-list, and safety payloads. New `petTravelCheck()` function.

#### Type contracts

Update `src/shared/types/trip.ts`:
- Add `Pet` interface: `{ type, name?, breed, weightLbs, specialNeeds? }`
- Add `PetAirlineGuidance` interface
- Add `PetEntryRequirements` interface
- Update `TripRequest` to include `pets: Pet[]`

Update `src/shared/types/api.ts`:
- Add `PetTravelCheckResponse` interface

### 6. Testing

#### Unit tests

- `tests/unit/petAirlineRules.test.js` — cabin eligibility by weight, breed ban detection, carrier-specific rules, cat/small animal handling, all-airlines comparison
- `tests/unit/petEntryRules.test.js` — quarantine country detection, required documents list, timeline warning generation for strict countries (Japan 180-day wait), banned breed detection by country, unknown country returns null
- `tests/unit/petSafety.test.js` — orchestrator with DI pattern (same as `safetyRules.test.js`), fly vs drive mode branching, multi-pet handling, error cases (empty pets, invalid travelMode)
- `tests/unit/inputSafety.test.js` — update: test `sanitizePets()` and `sanitizeSpecialNeeds()` with injection attempts, breed with accented characters, weight bounds

#### E2E tests

- `tests/e2e/tiles/pet-safety-tile.spec.ts` — mocked pet data renders airline comparison table, entry requirements, document checklist
- `tests/e2e/screens/input-screen.spec.ts` — update: verify FamilyStep renders both children and pets sections, add/remove pet cards
- `tests/e2e/flows/pet-trip.spec.ts` — full flow: add dog in wizard, generate trip, verify pet-friendly badges in itinerary, pet packing category, pet safety tile

### 7. Data Flow

```
User submits trip (with pets)
→ App.jsx calls api.js → POST /api/v1/trip/parse-input (detects pets from text)
→ Backend derives travelMode from distance + countryCode
→ api.js → POST /api/v1/trip/plan (pets injected into AI prompt → pet-friendly itinerary)
→ api.js → POST /api/v1/trip/packing (pets → pet packing category)
→ api.js → POST /api/v1/safety/pet-travel-check (airline + entry rules for all carriers)
→ App.jsx renders: ItineraryTile (🐾 badges) + PackingChecklist (pet items) + PetSafetyTile
```

### 8. Out of Scope (Future)

- Pet insurance recommendations
- Vet finder at destination
- Real-time BringFido API integration
- Pet hotel booking integration
- Pet-specific weather alerts (hot pavement warnings, extreme cold)
- Emotional support animal (ESA) / service animal rules (complex legal landscape)
