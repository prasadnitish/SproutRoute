# Architecture Documentation: StrollerScout (Web MVP)

## System Overview

StrollerScout is a **client-server web application** that helps parents generate AI-powered, weather-appropriate packing lists for trips with children. The system consists of:

- **Frontend (React/Vite):** Single-page application for user interaction
- **Backend (Node.js/Express):** API server that orchestrates external API calls
- **External APIs:** Weather.gov (forecast data), Claude API (AI-generated lists)
- **Storage:** Browser local storage (no database required for MVP)

**Architecture Pattern:** Simple 3-tier architecture (Presentation → API Layer → External Services)

---

## Component Diagram

```
┌──────────────────────────────────────────────────┐
│              User Browser                        │
│  ┌────────────────────────────────────────────┐ │
│  │         React Frontend (SPA)               │ │
│  │  - Trip Input Form                         │ │
│  │  - Weather Display                         │ │
│  │  - Packing Checklist                       │ │
│  │  - Local Storage Manager                   │ │
│  └────────────┬───────────────────────────────┘ │
└───────────────┼──────────────────────────────────┘
                │ HTTP/REST
                ▼
┌──────────────────────────────────────────────────┐
│        Backend API Server (Express)              │
│  ┌────────────────────────────────────────────┐ │
│  │  /api/weather   - Fetch forecast           │ │
│  │  /api/generate  - Generate packing list    │ │
│  │  /api/geocode   - Convert city to lat/lon  │ │
│  └────┬──────────────────────┬────────────────┘ │
└───────┼──────────────────────┼───────────────────┘
        │                      │
        ▼                      ▼
┌──────────────────┐   ┌────────────────────┐
│   Weather.gov    │   │   Claude API       │
│   (NWS API)      │   │   (Anthropic)      │
│                  │   │                    │
│  - Forecast data │   │  - AI-generated    │
│  - US locations  │   │    packing lists   │
└──────────────────┘   └────────────────────┘
```

---

## Data Flow

### Flow 1: Generate Packing List (Happy Path)

1. **User submits trip form** → Frontend validates input (destination, dates, activities)
2. **Frontend → Backend:** POST `/api/generate` with trip details
3. **Backend → Geocoding API:** Convert "Seattle, WA" → lat/lon coordinates
4. **Backend → Weather.gov:** Fetch 7-day forecast using lat/lon
5. **Backend processes weather data:** Extract high/low temps, precipitation, conditions
6. **Backend → Claude API:** Send structured prompt with trip context + weather summary
7. **Claude API returns:** JSON-formatted packing list with categories and items
8. **Backend → Frontend:** Return combined response (weather + packing list)
9. **Frontend displays:** Weather forecast + interactive checklist
10. **Frontend saves:** Packing list + checked items → browser local storage

### Flow 2: Load Saved List

1. **User returns to site** → Frontend checks local storage
2. **If list exists:** Load trip details, packing items, checked state
3. **Display saved list** → User continues packing

### Flow 3: Error Handling

- **Invalid location:** Backend returns error → Frontend shows "Please enter a US city"
- **Weather API down:** Backend uses cached data or returns graceful error
- **Claude API timeout:** Frontend shows retry button after 15 seconds

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
- **Easier deployment:** Vercel/Netlify vs App Store approval
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
- **Privacy:** Data stays on user's device
- **Cost:** Free (no database hosting)
- **Trade-off:** Data lost if user clears browser, no cross-device sync
- **V2 path:** Can add Firebase for cloud sync later

### Decision 3: Server-Side API Proxy (Backend)

**Context:** Need to call Weather.gov and Claude APIs.

**Options Considered:**

1. Call APIs directly from frontend (no backend)
2. Serverless functions (Vercel/Netlify functions)
3. Express.js backend server

**Decision:** Express.js backend server

**Rationale:**

- **Security:** Cannot expose Claude API key in frontend code
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

### Decision 5: Claude API for Packing List Generation

**Context:** Need AI to generate context-aware packing lists.

**Options Considered:**

1. Claude API (Anthropic)
2. OpenAI GPT-4
3. Rule-based logic (no AI)

**Decision:** Claude API

**Rationale:**

- **Quality:** Excellent at structured tasks (JSON output)
- **Context window:** Large enough for full weather + activities
- **Cost-effective:** Cheaper than GPT-4 for this use case
- **Portfolio value:** Shows modern AI integration
- **Personal factor:** Original brief already designed for Claude

---

## API Endpoints

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
  "trip": {
    "destination": "Seattle, WA",
    "duration": 5,
    "startDate": "2026-05-15",
    "endDate": "2026-05-20"
  },
  "weather": {
    "forecast": [
      {
        "date": "2026-05-15",
        "high": 62,
        "low": 50,
        "condition": "Partly Cloudy",
        "precipitation": 40
      }
      // ... 7 days
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
            "quantity": 2,
            "reason": "High rain probability Wed-Fri"
          },
          {
            "name": "Long pants",
            "quantity": 3,
            "reason": "Cool temperatures expected"
          }
        ]
      },
      {
        "name": "Toiletries",
        "items": [
          {
            "name": "Diapers",
            "quantity": "20-25",
            "reason": "For 2-year-old, 5 days"
          }
        ]
      }
      // ... more categories
    ]
  }
}
```

**Error Responses:**

- **400:** Invalid input (missing fields, invalid dates)
- **422:** Non-US location (Weather.gov limitation)
- **500:** API failure (weather or Claude unavailable)
- **504:** Timeout (Claude API took > 15 seconds)

### GET /api/geocode?location=Seattle,WA

**Description:** Convert city name to coordinates

**Response:**

```json
{
  "lat": 47.6062,
  "lon": -122.3321,
  "city": "Seattle",
  "state": "WA"
}
```

---

## Data Models

### Frontend State (React)

```typescript
interface TripInput {
  destination: string;
  startDate: string; // ISO date
  endDate: string;
  activities: string[]; // ['beach', 'hiking', 'city', 'indoor']
  children: { age: number }[];
}

interface WeatherForecast {
  date: string;
  high: number;
  low: number;
  condition: string;
  precipitation: number; // percentage
}

interface PackingItem {
  id: string;
  name: string;
  quantity: string | number;
  reason: string;
  checked: boolean; // user's progress
}

interface PackingCategory {
  name: string;
  items: PackingItem[];
  collapsed: boolean; // UI state
}
```

### Local Storage Structure

```json
{
  "strollerscout_trip": {
    "trip": { ...TripInput },
    "weather": { forecast: [...], summary: "..." },
    "packingList": { categories: [...] },
    "lastModified": "2026-05-10T14:32:00Z"
  }
}
```

**Storage limits:** ~5-10MB (local storage limit), should store 1 trip easily

---

## Security Considerations

### API Key Protection

- ✅ **Claude API key stored in environment variables** (`.env` file)
- ✅ **Never exposed to frontend** (backend proxy pattern)
- ✅ **`.env` in `.gitignore`** (never committed)
- ✅ **`.env.example` provided** (without real keys)

### Input Validation

- ✅ **Frontend validation:** Date ranges, required fields
- ✅ **Backend validation:** Sanitize user input before API calls
- ✅ **Rate limiting:** Limit requests per IP (prevent abuse)

### XSS Prevention

- ✅ **React auto-escapes:** User input automatically sanitized
- ✅ **No `dangerouslySetInnerHTML`:** Avoid unsafe HTML rendering

### CORS Configuration

- ✅ **Specific origin:** Only allow frontend domain
- ✅ **Production:** Restrict to deployed frontend URL

### Weather.gov API

- ✅ **No authentication required** (public API)
- ✅ **Respect rate limits:** Cache responses for 1 hour

---

## Performance Considerations

### Caching Strategy

- **Weather data:** Cache for 1 hour per location (in-memory or Redis)
- **Geocoding:** Cache city → coordinates (rarely changes)
- **Claude API:** No caching (each list is unique per trip)

### Response Times

- **Weather API:** ~500ms
- **Claude API:** ~3-5 seconds (LLM generation)
- **Total:** ~5-6 seconds for packing list generation
- **Optimization:** Show weather immediately, stream packing list as it generates

### Bundle Size

- **React:** ~45KB (gzipped with tree-shaking)
- **Total frontend:** < 200KB (target)
- **Lazy loading:** Split packing list view into separate chunk

---

## Trade-offs

### MVP vs Future Vision

| Feature              | MVP (Web)     | Future V2 (Mobile)  |
| -------------------- | ------------- | ------------------- |
| Platform             | Web (React)   | React Native        |
| Storage              | Local storage | Cloud database      |
| Weather              | US-only       | International       |
| Packing list         | AI-generated  | + User templates    |
| Shopping             | Not included  | Amazon integration  |
| Offline              | No            | Yes (cached data)   |
| Cross-device sync    | No            | Yes (user accounts) |
| **Development time** | **1-2 weeks** | **4-6 weeks**       |

### Technical Debt Accepted for Speed

1. **No user authentication:** Can't save lists across devices
2. **No database:** Data lost if browser cleared
3. **US-only:** Non-US users can't use the app
4. **No offline mode:** Requires internet connection
5. **Simple styling:** Focus on functionality over polish

**Mitigation:** All these are planned for V2 and clearly documented as future enhancements

---

## Deployment Architecture

```
┌─────────────────────────────────────────┐
│          Vercel/Netlify CDN             │
│  ┌───────────────────────────────────┐  │
│  │     Frontend (Static Files)       │  │
│  │     - React bundle                │  │
│  │     - HTML, CSS, JS               │  │
│  └───────────────────────────────────┘  │
└─────────────────┬───────────────────────┘
                  │ HTTPS
                  ▼
┌─────────────────────────────────────────┐
│     Vercel/Railway/Render               │
│  ┌───────────────────────────────────┐  │
│  │     Backend API (Node.js)         │  │
│  │     - Express server              │  │
│  │     - Environment variables       │  │
│  └───────────────────────────────────┘  │
└─────────────────────────────────────────┘
```

**Hosting Options:**

- **Frontend:** Vercel (free tier) or Netlify
- **Backend:** Vercel serverless functions OR Railway/Render (free tier)
- **Domain:** Custom domain (optional)

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

| Layer    | Technology        | Rationale                       |
| -------- | ----------------- | ------------------------------- |
| Frontend | React 18 + Vite   | Fast dev experience, modern     |
| Backend  | Node.js + Express | Simple, widely understood       |
| AI       | Claude API        | Best for structured JSON output |
| Weather  | Weather.gov       | Free, reliable, unlimited       |
| Storage  | Local Storage     | Simple, no hosting needed       |
| Hosting  | Vercel/Netlify    | Free, easy deployment           |
| Styling  | Tailwind CSS      | Rapid UI development            |

### External Dependencies

**Frontend:**

- `react`, `react-dom` - UI framework
- `date-fns` - Date handling
- `tailwindcss` - Styling

**Backend:**

- `express` - Web server
- `@anthropic-ai/sdk` - Claude API client
- `node-fetch` - HTTP requests
- `dotenv` - Environment variables
- `cors` - CORS handling

**Total:** ~10 dependencies (keeping it minimal)

---

## References

- [Weather.gov API Docs](https://www.weather.gov/documentation/services-web-api)
- [Claude API Docs](https://docs.anthropic.com/claude/reference)
- [React Docs](https://react.dev/)
- [Vercel Deployment](https://vercel.com/docs)
