# Architecture Documentation: SproutRoute (Web MVP)

## System Overview

SproutRoute is a **client-server web application** that helps parents transform trip intent into a detailed itinerary and AI-powered, weather-appropriate packing list. The system consists of:

- **Frontend (React/Vite):** Single-page application for user interaction
- **Backend (Node.js/Express):** API server that orchestrates external API calls
- **External APIs:** Weather.gov (forecast data), AI API (itinerary + packing lists), OpenStreetMap (Nominatim + Overpass for location resolution)
- **Storage:** Browser local storage (no database required for MVP)

**Architecture Pattern:** Simple 3-tier architecture (Presentation → API Layer → External Services)

---

## Component Diagram

```
┌──────────────────────────────────────────────────┐
│              User Browser                        │
│  ┌────────────────────────────────────────────┐ │
│  │         React Frontend (SPA)               │ │
│  │  - Step-by-step Trip Wizard                │ │
│  │  - Weather Display                         │ │
│  │  - Itinerary Display                        │ │
│  │  - Packing Checklist                       │ │
│  │  - Travel Safety Card                      │ │
│  │  - Local Storage Manager                   │ │
│  └────────────┬───────────────────────────────┘ │
└───────────────┼──────────────────────────────────┘
                │ HTTP/REST
                ▼
┌──────────────────────────────────────────────────┐
│        Backend API Server (Express)              │
│  ┌────────────────────────────────────────────┐ │
│  │  GET  /api/health                          │ │
│  │  POST /api/resolve-destination             │ │
│  │  POST /api/trip-plan                       │ │
│  │  POST /api/generate                        │ │
│  │  POST /api/safety/car-seat-check           │ │
│  └────┬──────────────────────┬────────────────┘ │
└───────┼──────────────────────┼───────────────────┘
        │                      │
        ▼                      ▼
┌──────────────────┐   ┌────────────────────┐
│   Weather.gov    │   │   AI API           │
│   (NWS API)      │   │                    │
│                  │   │  - Itinerary +     │
│  - Forecast data │   │    packing lists   │
│  - US locations  │   │  - Car seat law    │
└──────────────────┘   │    research        │
        ▲              └────────────────────┘
        │
┌────────────────────────────────────────┐
│ OpenStreetMap (Nominatim + Overpass)   │
│ - Geocoding + nearby city suggestions  │
└────────────────────────────────────────┘
```

---

## Data Flow

### Flow 1: Resolve Destination + Generate Plan (Happy Path)

1. **User enters destination intent** → Frontend calls `POST /api/resolve-destination`
2. **Backend → OpenStreetMap:** Geocode base city + fetch nearby city suggestions
3. **Frontend displays suggestions** → User selects a destination
4. **Frontend → Backend:** `POST /api/trip-plan` with destination + dates + kids
5. **Backend → Weather.gov:** Fetch 7-day forecast using lat/lon
6. **Backend → AI API:** Generate structured itinerary
7. **Frontend displays itinerary** → User reviews and optionally selects activities
8. **Frontend → Backend (parallel):**
   - `POST /api/generate` with selected activities → AI generates packing list
   - `POST /api/safety/car-seat-check` with children profiles → returns jurisdiction-specific guidance
9. **Frontend displays:** Weather, itinerary, car seat guidance, packing checklist
10. **Frontend saves:** Trip + packing list + checked items → browser local storage

### Flow 2: Load Saved List

1. **User returns to site** → Frontend checks local storage
2. **TTL check:** If `lastModified` is older than 7 days, purge and show fresh wizard
3. **If list is valid:** Load trip details, packing items, checked state
4. **Display saved list** → User continues packing

### Flow 3: Error Handling

- **Invalid location:** Backend returns 422 → Frontend shows "Please enter a US city"
- **Weather API down:** Backend returns graceful error → Frontend shows retry message
- **AI API timeout:** Frontend shows error after 30-second client timeout
- **Location suggestions unavailable:** Overpass failure falls back silently to direct city mode
- **Car seat jurisdiction missing:** Returns `status: "Unavailable"` with source link

---

## Key Design Decisions

### Decision 1: Web App vs Mobile App for MVP

**Context:** Original plan was React Native mobile app, but timeline is 6 months for 5 projects.

**Options Considered:**

1. React Native mobile app (original plan)
2. Web app with React
3. Hybrid (PWA - Progressive Web App)

**Decision:** Web app (React + Vite) for MVP

**Rationale:**

- **Faster development:** 1-2 weeks vs 4-6 weeks for mobile
- **Easier deployment:** Cloudflare Pages vs App Store approval
- **Better for demos:** Share URL in interviews vs installing app
- **Still mobile-friendly:** Responsive design works on phone browsers
- **Future extensibility:** Can build React Native app in V2 using same backend

### Decision 2: No Database for MVP

**Context:** Need to store packing lists and user progress.

**Options Considered:**

1. PostgreSQL database (original plan)
2. SQLite file database
3. Browser local storage only
4. Firebase/Supabase

**Decision:** Browser local storage only

**Rationale:**

- **Simplicity:** No database setup, migrations, or hosting
- **MVP sufficient:** Users only need 1 trip at a time
- **Privacy:** Data stays on user's device; 7-day TTL auto-purges children's data
- **Cost:** Free (no database hosting)
- **Trade-off:** Data lost if user clears browser, no cross-device sync
- **V2 path:** Can add Firebase for cloud sync later

### Decision 3: Server-Side API Proxy (Backend)

**Context:** Need to call Weather.gov and the AI API.

**Options Considered:**

1. Call APIs directly from frontend (no backend)
2. Serverless functions (Vercel/Netlify functions)
3. Express.js backend server

**Decision:** Express.js backend server

**Rationale:**

- **Security:** Cannot expose AI API key in frontend code
- **Rate limiting:** Control API usage from single point
- **Caching:** Cache weather data for 1 hour to reduce API calls
- **Error handling:** Graceful fallbacks and retries
- **Learning value:** Shows backend architecture understanding for TPM portfolio

### Decision 4: Weather.gov API (US-Only)

**Context:** Need weather data for packing list generation.

**Options Considered:**

1. OpenWeatherMap (free tier, international)
2. Weather.gov (free, US-only, unlimited)
3. WeatherAPI.com (free tier, international)

**Decision:** Weather.gov (National Weather Service)

**Rationale:**

- **Free & unlimited:** No API key required, no rate limits
- **Reliable:** Government service, high uptime
- **MVP scope:** US-only acceptable for portfolio project
- **Trade-off:** Non-US users see error message
- **V2 path:** Can add OpenWeatherMap for international support

### Decision 5: AI API for Packing List and Itinerary Generation

**Context:** Need AI to generate context-aware packing lists and itineraries.

**Options Considered:**

1. Anthropic AI API
2. OpenAI GPT-4
3. Rule-based logic (no AI)

**Decision:** Anthropic AI API

**Rationale:**

- **Quality:** Excellent at structured tasks (JSON output)
- **Context window:** Large enough for full weather + activities
- **Cost-effective:** Haiku model is fast and economical for this use case
- **Portfolio value:** Shows modern AI integration

### Decision 6: Natural-Language Location + Suggestions

**Context:** Users may type "2 hour drive from Seattle" instead of a city.

**Options Considered:**

1. Require strict city/state input only
2. Natural-language parsing with suggested destinations (MVP)
3. Full routing-based destination inference (V2)

**Decision:** Natural-language parsing with 1-3 suggested destinations

**Rationale:**

- **Portfolio value:** Shows thoughtful UX and NLP integration
- **Risk-managed:** Suggestions keep results reliable without complex routing
- **Extensible:** Can add routing APIs later for true drive-time inference

---

## API Endpoints

### GET /api/health

**Description:** Liveness probe for hosting health checks

**Response:**

```json
{
  "status": "ok",
  "message": "SproutRoute API is running",
  "timestamp": "2026-02-15T10:00:00.000Z"
}
```

### POST /api/resolve-destination

**Description:** Resolve natural-language destination intent into concrete suggestions

**Request:**

```json
{
  "query": "2 hour drive from Seattle"
}
```

**Response (suggestions):**

```json
{
  "mode": "suggestions",
  "origin": "Seattle, WA",
  "suggestions": [
    {
      "name": "Tacoma",
      "displayName": "Tacoma, WA",
      "distanceMiles": 32
    }
  ]
}
```

**Response (direct):**

```json
{
  "mode": "direct",
  "destination": "Seattle, WA"
}
```

### POST /api/trip-plan

**Description:** Generate a detailed itinerary using destination, dates, and kids

**Request:**

```json
{
  "destination": "Seattle, WA",
  "startDate": "2026-05-15",
  "endDate": "2026-05-20",
  "children": [{ "age": 2 }]
}
```

**Response:**

```json
{
  "trip": {
    "destination": "Seattle, WA",
    "duration": 5,
    "startDate": "2026-05-15",
    "endDate": "2026-05-20",
    "jurisdictionCode": "WA",
    "jurisdictionName": "Washington"
  },
  "weather": {
    "summary": "Expect temperatures between 52°F and 66°F with possible rain."
  },
  "tripPlan": {
    "overview": "A balanced family-friendly itinerary...",
    "suggestedActivities": [
      {
        "id": "activity-1",
        "name": "Pike Place Market",
        "category": "city",
        "duration": "2-3 hours",
        "kidFriendly": true,
        "weatherDependent": false
      }
    ],
    "dailyItinerary": [...],
    "tips": [...]
  }
}
```

### POST /api/generate

**Description:** Generate complete packing list with weather forecast

**Request:**

```json
{
  "destination": "Seattle, WA",
  "startDate": "2026-05-15",
  "endDate": "2026-05-20",
  "activities": ["hiking", "city"],
  "children": [{ "age": 2 }, { "age": 4 }]
}
```

**Response:**

```json
{
  "trip": { "destination": "Seattle, WA", "duration": 5, ... },
  "weather": {
    "forecast": [
      {
        "date": "2026-05-15",
        "high": 62,
        "low": 50,
        "condition": "Partly Cloudy",
        "precipitation": 40
      }
    ],
    "summary": "Expect cool temps (50-65°F) with 40-70% rain chance"
  },
  "packingList": {
    "categories": [
      {
        "name": "Clothing",
        "items": [
          {
            "name": "Rain jackets",
            "quantity": "2",
            "reason": "High rain probability Wed-Fri"
          }
        ]
      }
    ]
  }
}
```

### POST /api/safety/car-seat-check

**Description:** Return jurisdiction-specific car seat and booster guidance for each child

**Request:**

```json
{
  "destination": "Seattle, WA",
  "jurisdictionCode": "WA",
  "tripDate": "2026-05-15",
  "children": [{ "age": 2, "weightLb": 28, "heightIn": 34 }]
}
```

**Response:**

```json
{
  "status": "Needs review",
  "jurisdictionCode": "WA",
  "jurisdictionName": "Washington",
  "sourceUrl": "https://wtsc.wa.gov/child-passenger-safety/",
  "effectiveDate": "Not found in repo",
  "lastUpdated": "2026-02-15",
  "results": [
    {
      "childId": "child-1",
      "ageYears": 2,
      "status": "Needs review",
      "requiredRestraint": "rear_facing",
      "requiredRestraintLabel": "Rear-facing car seat",
      "seatPosition": "rear_seat_required_if_available",
      "rationale": "Age matched but weight/height details are incomplete.",
      "sourceUrl": "https://wtsc.wa.gov/child-passenger-safety/"
    }
  ]
}
```

**Error Responses:**

- **400:** Missing or empty children array
- **500:** Internal evaluation failure

---

## Data Models

### Frontend State (React)

```typescript
interface TripInput {
  destination: string;
  startDate: string; // ISO date string (e.g. "2026-05-15")
  endDate: string;
  activities: string[];
  children: { age: number; weightLb?: number; heightIn?: number }[];
}

interface WeatherForecast {
  date: string;
  high: number;
  low: number | null; // null when night period is unavailable
  condition: string;
  precipitation: number; // percentage 0-100
}

interface PackingItem {
  name: string;
  quantity: string;
  reason: string;
  // Note: item IDs are computed client-side as "${category.name}-${catIndex}-${itemIndex}"
  // and are not part of the API response.
}

interface PackingCategory {
  name: string;
  items: PackingItem[];
}
```

### Local Storage Structure

```json
{
  "sproutroute_trip": {
    "trip": { "destination": "...", "startDate": "...", "endDate": "...", "children": [...], "jurisdictionCode": "WA", "jurisdictionName": "Washington", "duration": 5 },
    "weather": { "forecast": [...], "summary": "..." },
    "tripPlan": { "overview": "...", "suggestedActivities": [...], "dailyItinerary": [...], "tips": [...] },
    "packingList": { "categories": [...] },
    "safetyGuidance": { "status": "Needs review", "results": [...] },
    "lastModified": "2026-05-10T14:32:00Z"
  },
  "sproutroute_checked": ["Clothing-0-0", "Clothing-0-1", ...]
}
```

**Storage limits:** ~5-10MB (local storage limit), well within bounds for one trip.

**TTL:** Data older than 7 days is automatically purged on next page load.

---

## Security Considerations

### API Key Protection

- ✅ **AI API key stored in environment variables** (`.env` file)
- ✅ **Never exposed to frontend** (backend proxy pattern)
- ✅ **`.env` in `.gitignore`** (never committed)
- ✅ **`.env.example` provided** (without real keys)
- ✅ **Startup validation:** Server exits immediately if key is missing or placeholder

### Input Validation

- ✅ **Frontend validation:** Date ranges, required fields, client-side clamping
- ✅ **Backend sanitization:** All string fields through `sanitizeString`; dates sanitized and injection-stripped before reaching AI prompts
- ✅ **Rate limiting:** 30 requests per 15 minutes per IP across all AI endpoints
- ✅ **Request body size limit:** 10 KB cap to prevent payload exhaustion

### AI Prompt Security

- ✅ **System/user separation:** Static instructions sent via `system:` parameter; only trip data in user message
- ✅ **Injection marker stripping:** `IGNORE PREVIOUS`, `SYSTEM:`, `ASSISTANT:` removed from all user inputs
- ✅ **Temperature 0:** Deterministic structured JSON output minimises off-rails responses

### XSS Prevention

- ✅ **React auto-escapes:** User input automatically sanitized
- ✅ **No `dangerouslySetInnerHTML`:** Avoid unsafe HTML rendering
- ✅ **Security headers:** `X-Content-Type-Options`, `X-Frame-Options`, `X-XSS-Protection`, HSTS in production

### CORS Configuration

- ✅ **Production:** Enforces explicit `ALLOWED_ORIGINS` allowlist
- ✅ **Dev:** Only allows localhost origins
- ✅ **Startup guard:** Server exits if `ALLOWED_ORIGINS` is empty in production mode

### Weather.gov API

- ✅ **No authentication required** (public API)
- ✅ **Respect rate limits:** Cache responses for 1 hour (in-memory)
- ✅ **Timeout:** Both Weather.gov fetch calls have a 10-second AbortController timeout

---

## Performance Considerations

### Caching Strategy

- **Weather data:** In-memory cache, 1 hour TTL, max 100 entries (LRU eviction)
- **Geocoding:** In-memory cache, 6 hour TTL, max 500 entries
- **AI API:** No caching (each list is unique per trip)

### Response Times

- **Weather API:** ~500ms
- **AI API:** ~3-5 seconds (LLM generation)
- **Total:** ~5-7 seconds for initial plan generation
- **Car seat check:** ~50ms for in-repo jurisdictions; ~3-5s if AI research fallback triggers

### Bundle Size

- **React:** ~45KB (gzipped with tree-shaking)
- **Total frontend:** < 200KB (target)

---

## Trade-offs

### MVP vs Future Vision

| Feature              | MVP (Web)              | Future V2 (Mobile)  |
| -------------------- | ---------------------- | ------------------- |
| Platform             | Web (React)            | React Native        |
| Storage              | Local storage          | Cloud database      |
| Weather              | US-only                | International       |
| Packing list         | AI-generated           | + User templates    |
| Car seat guidance    | 5 states + AI fallback | All 50 states       |
| Shopping             | Not included           | Amazon integration  |
| Offline              | No                     | Yes (cached data)   |
| Cross-device sync    | No                     | Yes (user accounts) |
| **Development time** | **1-2 weeks**          | **4-6 weeks**       |

### Technical Debt Accepted for Speed

1. **No user authentication:** Can't save lists across devices
2. **No database:** Data lost if browser cleared (mitigated by 7-day TTL auto-purge)
3. **US-only:** Non-US users can't use the app
4. **No offline mode:** Requires internet connection
5. **Car seat data covers 5 states:** AI fallback handles others but with "Needs review" status

**Mitigation:** All these are planned for V2 and clearly documented as future enhancements

---

## Deployment Architecture

```
┌─────────────────────────────────────────┐
│        Cloudflare Pages (CDN)           │
│  ┌───────────────────────────────────┐  │
│  │     Frontend (Static Files)       │  │
│  │     - React bundle                │  │
│  │     - HTML, CSS, JS               │  │
│  └───────────────────────────────────┘  │
└─────────────────┬───────────────────────┘
                  │ HTTPS
                  ▼
┌─────────────────────────────────────────┐
│           Railway                       │
│  ┌───────────────────────────────────┐  │
│  │     Backend API (Node.js)         │  │
│  │     - Express server              │  │
│  │     - Environment variables       │  │
│  │     - PORT auto-assigned          │  │
│  └───────────────────────────────────┘  │
└─────────────────────────────────────────┘
```

**Environment variables required:**

| Variable            | Where            | Value                               |
| ------------------- | ---------------- | ----------------------------------- |
| `ANTHROPIC_API_KEY` | Railway          | Live key from console.anthropic.com |
| `NODE_ENV`          | Railway          | `production`                        |
| `ALLOWED_ORIGINS`   | Railway          | Your Cloudflare Pages URL           |
| `VITE_API_URL`      | Cloudflare Pages | Your Railway backend URL            |

---

## Future Architecture (V2)

When scaling to mobile app + full features:

```
[React Native Mobile] ←→ [React Web]
          ↓                     ↓
      [GraphQL API Gateway]
          ↓
   [Microservices]
   - Auth Service
   - Packing Service
   - Weather Service
   - Shopping Service
          ↓
   [PostgreSQL + Redis]
```

**V2 Enhancements:**

- User authentication (Firebase Auth or Auth0)
- Cloud database (Supabase or Firebase)
- Amazon PA-API integration
- Push notifications
- Social sharing

---

## Appendix

### Technology Stack Summary

| Layer    | Technology                 | Rationale                                              |
| -------- | -------------------------- | ------------------------------------------------------ |
| Frontend | React 18 + Vite            | Fast dev experience, modern                            |
| Backend  | Node.js + Express          | Simple, widely understood                              |
| AI       | Anthropic API              | Best for structured JSON output                        |
| Weather  | Weather.gov                | Free, reliable, unlimited                              |
| Storage  | Local Storage              | Simple, no hosting needed                              |
| Hosting  | Railway + Cloudflare Pages | Railway for Node; Cloudflare Pages for static frontend |
| Styling  | Tailwind CSS               | Rapid UI development                                   |

### External Dependencies

**Frontend:**

- `react`, `react-dom` - UI framework
- `date-fns` - Date handling
- `tailwindcss` - Styling

**Backend:**

- `express` - Web server
- `@anthropic-ai/sdk` - AI API client
- `dotenv` - Environment variables
- `cors` - CORS handling
- `express-rate-limit` - Request rate limiting

**Total:** ~9 dependencies (keeping it minimal)

---

## References

- [Weather.gov API Docs](https://www.weather.gov/documentation/services-web-api)
- [React Docs](https://react.dev/)
- [Railway Deployment](https://docs.railway.app/)
- [Cloudflare Pages Docs](https://developers.cloudflare.com/pages/)
