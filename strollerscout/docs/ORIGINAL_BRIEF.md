# CLAUDE.md - StrollerScout Project Brief

## Project Overview

**StrollerScout** — _Smart trips for busy parents_

StrollerScout is an AI-powered mobile trip planning app that generates weather-appropriate packing lists and provides Amazon product recommendations for items users need to purchase.

**Core User Flow:**

1. User inputs trip details (destination, dates, activities)
2. App fetches weather forecast and generates AI packing list
3. User marks items as "Have" or "Need to Buy"
4. App shows Amazon product recommendations for items to buy

## Tech Stack

- **Frontend:** React Native with Expo (iOS + Android)
- **Backend:** Node.js + Express
- **Database:** PostgreSQL (production) / SQLite (development)
- **Cache:** Redis
- **APIs:** Weather.gov, Claude API, Amazon PA-API 5.0
- **Deployment:** AWS (EC2, RDS, ElastiCache)

## Project Structure

```
strollerscout/
├── apps/
│   └── mobile/              # React Native Expo app
│       ├── src/
│       │   ├── screens/     # Trip, PackingList, Shopping screens
│       │   ├── components/  # Reusable UI components
│       │   ├── hooks/       # Custom hooks
│       │   ├── services/    # API service layers
│       │   ├── store/       # State management
│       │   └── utils/       # Helper functions
│       └── app.json
├── packages/
│   └── api/                 # Express backend
│       ├── src/
│       │   ├── routes/      # API endpoints
│       │   ├── services/    # Business logic
│       │   ├── integrations/# External API wrappers
│       │   └── db/          # Database models
│       └── package.json
└── CLAUDE.md
```

## Phase 1: MVP Features

### 1.1 Trip Input Screen

- Destination input with autocomplete (use Google Places or simple text)
- Date range picker (start/end dates)
- Activity selection (checkboxes: hiking, beach, business, sightseeing, etc.)
- "Plan My Trip" button

### 1.2 Weather Integration

- **API:** Weather.gov (free, US-focused)
- **Endpoint:** `https://api.weather.gov/points/{lat},{lon}` → get forecast URL → fetch forecast
- Display 7-day forecast with:
  - Daily high/low temperatures
  - Precipitation probability
  - Weather conditions (sunny, rainy, cloudy)
- Cache forecasts for 1 hour

### 1.3 AI Packing List Generation

- **API:** Claude API (claude-sonnet-4-20250514)
- **Prompt context includes:**
  - Destination and dates
  - Weather forecast summary
  - Selected activities
  - Trip duration
- **Output:** Categorized packing list (Clothing, Toiletries, Electronics, Gear, Documents)
- Each item has: name, quantity suggestion, category

### 1.4 Interactive Checklist

- Three-state toggle per item: ✓ Have | 🛒 Need to Buy | ✗ Not Needed
- Category collapse/expand
- "Shop Selected Items" button (enabled when items marked "Need to Buy")
- Progress bar showing packing completion

### 1.5 Amazon Product Recommendations

- **API:** Amazon Product Advertising API 5.0
- **Requires:** Amazon Associates account
- Transform packing items into search queries with context:
  - "Rain jacket" + Seattle November → "packable waterproof rain jacket"
  - "Hiking boots" + mountain trails → "waterproof hiking boots ankle support"
- Display per product:
  - Image, title, price, rating, Prime badge
  - "View on Amazon" deep link
- Filter options: price range, rating, Prime only

## API Integration Details

### Weather.gov API

```javascript
// 1. Get grid point from coordinates
const pointsUrl = `https://api.weather.gov/points/${lat},${lon}`;
// Response includes forecast URL

// 2. Get forecast
const forecastUrl = response.properties.forecast;
// Returns 7-day forecast with periods
```

### Claude API (Packing List)

```javascript
const response = await anthropic.messages.create({
  model: "claude-sonnet-4-20250514",
  max_tokens: 1024,
  messages: [
    {
      role: "user",
      content: `Generate a packing list for a ${duration}-day trip to ${destination}.

Weather forecast: ${weatherSummary}
Planned activities: ${activities.join(", ")}

Return JSON format:
{
  "categories": [
    {
      "name": "Clothing",
      "items": [{"name": "Rain jacket", "quantity": 1, "reason": "70% rain chance"}]
    }
  ]
}`,
    },
  ],
});
```

### Amazon PA-API 5.0

```javascript
// SearchItems operation
const searchParams = {
  Keywords: enhancedSearchQuery,
  SearchIndex: "All",
  ItemCount: 5,
  Resources: [
    "Images.Primary.Large",
    "ItemInfo.Title",
    "Offers.Listings.Price",
    "CustomerReviews",
  ],
};
```

## Database Schema

```sql
-- Trips
CREATE TABLE trips (
  id UUID PRIMARY KEY,
  user_id UUID,
  destination VARCHAR(255),
  start_date DATE,
  end_date DATE,
  activities TEXT[], -- array of activity types
  created_at TIMESTAMP DEFAULT NOW()
);

-- Packing Lists
CREATE TABLE packing_lists (
  id UUID PRIMARY KEY,
  trip_id UUID REFERENCES trips(id),
  generated_at TIMESTAMP DEFAULT NOW()
);

-- Packing Items
CREATE TABLE packing_items (
  id UUID PRIMARY KEY,
  packing_list_id UUID REFERENCES packing_lists(id),
  name VARCHAR(255),
  category VARCHAR(100),
  quantity INTEGER DEFAULT 1,
  status VARCHAR(20) DEFAULT 'pending', -- 'have', 'need_to_buy', 'not_needed'
  ai_reason TEXT -- why this item was suggested
);

-- Weather Cache
CREATE TABLE weather_cache (
  location_key VARCHAR(100) PRIMARY KEY,
  forecast_data JSONB,
  fetched_at TIMESTAMP,
  expires_at TIMESTAMP
);
```

## Environment Variables

```env
# Backend
DATABASE_URL=postgresql://user:pass@localhost:5432/strollerscout
REDIS_URL=redis://localhost:6379
ANTHROPIC_API_KEY=sk-ant-...
AMAZON_ACCESS_KEY=...
AMAZON_SECRET_KEY=...
AMAZON_PARTNER_TAG=strollerscout-20

# Mobile App
EXPO_PUBLIC_API_URL=http://localhost:3000
```

## Development Commands

```bash
# Install dependencies
npm install

# Start backend (from packages/api)
npm run dev

# Start mobile app (from apps/mobile)
npx expo start

# Run database migrations
npm run db:migrate

# Run tests
npm test
```

## Key Coding Guidelines

1. **Use TypeScript** for type safety across frontend and backend
2. **Error handling:** Graceful fallbacks when APIs fail (show cached data or helpful message)
3. **Loading states:** Skeleton loaders for weather and product fetches
4. **Offline support:** Cache last trip and packing list locally
5. **Accessibility:** Proper labels, touch targets, color contrast

## MVP Success Criteria

- [ ] User can input trip details and see weather forecast
- [ ] AI generates relevant packing list based on weather + activities
- [ ] User can mark items with three-state toggle
- [ ] "Need to Buy" items show Amazon product recommendations
- [ ] Deep links open Amazon app/website for purchase
- [ ] App works on both iOS and Android

## Out of Scope for MVP

- User authentication (use device storage for MVP)
- Inventory management (tracking what user owns)
- International weather (Weather.gov is US-only for now)
- Push notifications
- Social sharing
- Premium subscriptions

## Getting Started

1. Set up Expo project: `npx create-expo-app strollerscout-mobile`
2. Set up Express backend: `mkdir api && cd api && npm init -y`
3. Install key dependencies
4. Create basic navigation structure
5. Build Trip Input screen first
6. Integrate Weather.gov API
7. Add Claude API for packing list generation
8. Build checklist UI
9. Integrate Amazon PA-API last (requires Associates account approval)

## Resources

- [Weather.gov API Docs](https://www.weather.gov/documentation/services-web-api)
- [Claude API Docs](https://docs.anthropic.com/claude/reference/messages_post)
- [Amazon PA-API 5.0 Docs](https://webservices.amazon.com/paapi5/documentation/)
- [Expo Documentation](https://docs.expo.dev/)
- [React Native](https://reactnative.dev/docs/getting-started)
