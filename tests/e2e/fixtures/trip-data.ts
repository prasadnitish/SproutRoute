// tests/e2e/fixtures/trip-data.ts
// All mock payloads match exact shapes returned by the SproutRoute backend.

export const MOCK_PARSED_INPUT = {
  destination: "Maui, Hawaii",
  startDate: "2026-04-12",
  endDate: "2026-04-19",
  adults: 2,
  childrenAges: [4, 8],
  vibe: "beach",
  suggestedDestinations: [],
  detectedRegion: null,
};

// Vague input — no destination resolved, 3 suggestions returned
export const MOCK_DESTINATIONS = {
  destination: null,
  suggestedDestinations: [
    { name: "Maui, Hawaii",   emoji: "🌴", description: "Stunning beaches",       season_note: "Perfect spring weather" },
    { name: "Cancun, Mexico", emoji: "🏖", description: "All-inclusive resorts",   season_note: "Warm and sunny" },
    { name: "San Diego, CA",  emoji: "☀️", description: "Family-friendly coast",   season_note: "Mild spring temps" },
  ],
  startDate: "2026-04-12",
  endDate: "2026-04-19",
  adults: 2,
  childrenAges: [],
  vibe: "beach",
  detectedRegion: null,
};

// Full /api/trip-plan response — includes scheduledItinerary for all itinerary tile tests
export const MOCK_TRIP_PLAN = {
  trip: {
    destination: "Maui, Hawaii",
    lat: 20.7984,
    lon: -156.3319,
    startDate: "2026-04-12",
    endDate: "2026-04-19",
    countryCode: "US",
    duration: 7,
    children: [{ age: 4 }, { age: 8 }],
    activities: ["beach"],
  },
  weather: {
    forecast: [
      { date: "2026-04-12", name: "Saturday", high: 76, low: 68, condition: "Sunny",         precipitation: 5  },
      { date: "2026-04-13", name: "Sunday",   high: 75, low: 67, condition: "Partly cloudy", precipitation: 10 },
    ],
    summary: "Expect warm, sunny weather.",
  },
  tripPlan: {
    overview: "A beautiful beach trip to Maui.",
    suggestedActivities: [
      { id: "act-1", name: "Road to Hana",          category: "hiking", description: "Scenic drive with waterfalls", duration: "full day",  kidFriendly: true, weatherDependent: false },
      { id: "act-2", name: "Snorkeling at Molokini", category: "water",  description: "Great for kids",              duration: "3 hours",   kidFriendly: true, weatherDependent: true  },
    ],
    dailyItinerary: [
      {
        day: "Day 1 (2026-04-12)",
        activities: ["act-1"],
        meals: {
          breakfast: { name: "Kihei Cafe",        cuisine: "American",         note: "Great pancakes"      },
          lunch:     { name: "Mama's Fish House",  cuisine: "Seafood",          note: "Iconic oceanfront"   },
          dinner:    { name: "Monkeypod Kitchen",  cuisine: "Hawaiian",         note: "Local craft beer"    },
        },
        notes: "Start early to beat traffic on the Hana highway.",
      },
      {
        day: "Day 2 (2026-04-13)",
        activities: ["act-2"],
        meals: {
          breakfast: { name: "Gazebo Restaurant", cuisine: "American",         note: "Oceanfront views"    },
          lunch:     { name: "Leoda's Kitchen",   cuisine: "Comfort Food",     note: "Best pies on Maui"   },
          dinner:    { name: "Merriman's Maui",   cuisine: "Hawaiian Regional",note: "Farm to table"       },
        },
        notes: null,
      },
    ],
    tips: ["Book snorkeling tours in advance.", "Sunscreen is a must."],
  },
  scheduledItinerary: [
    {
      date: "2026-04-12",
      scheduled: [
        {
          id: "act-1",
          name: "Road to Hana",
          category: "hiking",
          description: "Scenic drive with waterfalls",
          scheduledStart: "9:00 AM",
          scheduledEnd: "5:00 PM",
          duration: 480,
          status: "scheduled",
          warning: null,
          openingHours: "8:00 AM - 6:00 PM",
          enriched: {
            rating: 4.8,
            priceLevel: 1,
            address: "Hana Hwy, Maui, HI 96713",
            photos: ["https://picsum.photos/seed/hana/80/80"],
            mapsUrl: "https://maps.google.com/?q=Road+to+Hana",
            latitude: 20.7984,
            longitude: -156.3319,
          },
        },
        {
          name: "Closed Attraction",
          category: "museums",
          description: "Closed today",
          scheduledStart: null,
          scheduledEnd: null,
          duration: 120,
          status: "closed",
          warning: "Closed on this day — consider swapping",
          enriched: null,
        },
        {
          name: "Mama's Fish House",
          category: "dining",
          mealType: "dinner",
          cuisine: "Seafood",
          note: "Iconic oceanfront",
          scheduledStart: "6:00 PM",
          scheduledEnd: "7:30 PM",
          duration: 90,
          status: "meal",
          isMeal: true,
          enriched: {
            rating: 4.7,
            priceLevel: 3,
            address: "799 Poho Pl, Paia, HI 96779",
            photos: [],
            mapsUrl: "https://maps.google.com/?q=Mamas+Fish+House",
            latitude: 20.9295,
            longitude: -156.3673,
          },
        },
      ],
      warnings: [
        { activity: "Closed Attraction", type: "closed", message: "Closed Attraction is closed on this day" },
      ],
      notes: "Start early to beat traffic.",
      routeMeta: {
        orderedBy: "input",
        mappedStopCount: 2,
        totalDistanceMiles: 10,
        totalTravelMinutes: 28,
      },
    },
    {
      date: "2026-04-13",
      scheduled: [
        {
          id: "act-2",
          name: "Snorkeling at Molokini",
          category: "water",
          description: "Great for kids",
          scheduledStart: "9:00 AM",
          scheduledEnd: "12:00 PM",
          duration: 180,
          status: "scheduled",
          warning: null,
          enriched: {
            rating: 4.6,
            priceLevel: 2,
            address: "Molokini Crater, Maui, HI",
            photos: [],
            mapsUrl: null,
            latitude: 20.6319,
            longitude: -156.4961,
          },
        },
      ],
      warnings: [],
      notes: null,
      routeMeta: {
        orderedBy: "input",
        mappedStopCount: 1,
        totalDistanceMiles: 0,
        totalTravelMinutes: 0,
      },
    },
  ],
  enrichedMap: {},
};

export const MOCK_PACKING_LIST = {
  categories: [
    {
      name: "Beach Essentials",
      items: [
        {
          name: "Sunscreen SPF 50",
          searchQuery: "reef safe sunscreen SPF 50 kids",
          shopLinks: [
            { store: "Amazon",  url: "https://www.amazon.com/s?k=reef%20safe%20sunscreen&tag=test-20", color: "#ff9900" },
            { store: "Walmart", url: "https://www.walmart.com/search?q=reef%20safe%20sunscreen",       color: "#0071dc" },
            { store: "Target",  url: "https://www.target.com/s?searchTerm=reef%20safe%20sunscreen",    color: "#cc0000" },
          ],
        },
        { name: "Beach towels" },
      ],
    },
    { name: "Kids", items: [{ name: "Life jackets" }, { name: "Sand toys" }] },
  ],
};

// Matches travelSafety.js output shape consumed by SafetyTile
export const MOCK_SAFETY = {
  advisoryLevel:  "low",
  emergencyNumber: "911",
  healthTips:     ["Stay hydrated in the heat.", "Apply sunscreen every 2 hours."],
  familyTips:     ["Kids under 12 should wear life jackets when snorkeling."],
  waterSafety:    "Safe to drink tap water",
  carSeatLaw:     "Children under 4 must use a rear-facing car seat.",
  localCustoms:   ["Remove shoes before entering homes."],
  source:         "ai-generated",
};

export const MOCK_GEO = { lat: 41.8781, lon: -87.6298, region: "Chicago, IL" };

// Vegan food preference trip — for food-preferences flow test
export const MOCK_VEGAN_TRIP_PLAN = {
  ...MOCK_TRIP_PLAN,
  tripPlan: {
    ...MOCK_TRIP_PLAN.tripPlan,
    dailyItinerary: [
      {
        ...MOCK_TRIP_PLAN.tripPlan.dailyItinerary[0],
        meals: {
          breakfast: { name: "Down to Earth Cafe",  cuisine: "Vegan",        note: "100% plant-based menu" },
          lunch:     { name: "Alive & Well",        cuisine: "Vegan Ramen",  note: "Local favourite"       },
          dinner:    { name: "Café Mambo",          cuisine: "Plant-based",  note: "Creative vegan dishes" },
        },
      },
    ],
  },
  scheduledItinerary: [
    {
      ...MOCK_TRIP_PLAN.scheduledItinerary[0],
      scheduled: [
        MOCK_TRIP_PLAN.scheduledItinerary[0].scheduled[0],
        {
          name: "Alive & Well",
          category: "dining",
          mealType: "lunch",
          cuisine: "Vegan Ramen",
          note: "Local favourite",
          scheduledStart: "12:00 PM",
          scheduledEnd: "1:30 PM",
          duration: 90,
          status: "meal",
          isMeal: true,
          enriched: null,
        },
      ],
    },
  ],
};
