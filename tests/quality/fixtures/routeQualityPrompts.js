export const routeQualityPrompts = [
  {
    id: "japan-2-weeks-child",
    intent: {
      tripShape: "country_tour",
      destination: "Japan",
      startDate: "2026-12-01",
      endDate: "2026-12-14",
      childrenAges: [5],
      stops: [],
      countryTour: {
        country: "Japan",
        countryCode: "JP",
        requestedRegions: [],
        suggestedStopCount: 4,
      },
    },
    expectations: {
      noDuplicateStops: true,
      minStopNights: 2,
      maxStops: 4,
      feasibilityLabels: ["easy", "balanced"],
    },
  },
  {
    id: "europe-10-days-friends",
    intent: {
      tripShape: "multi_stop",
      destination: "Europe multi-city trip",
      startDate: "2026-06-01",
      endDate: "2026-06-10",
      childrenAges: [],
      stops: [
        { name: "Amsterdam", role: "must_visit" },
        { name: "Greece", role: "must_visit", notes: ["Broad region; confirm exact city"] },
        { name: "Berlin", role: "must_visit" },
        { name: "Budapest", role: "must_visit" },
      ],
      countryTour: null,
    },
    expectations: {
      mustIncludeStops: ["Amsterdam", "Greece", "Berlin", "Budapest"],
      suggestedOrder: ["Amsterdam", "Berlin", "Budapest", "Greece"],
      mustWarnPacked: true,
      mustWarnBroad: true,
    },
  },
  {
    id: "usa-family-road-trip",
    intent: {
      tripShape: "country_tour",
      destination: "United States",
      startDate: "2026-07-01",
      endDate: "2026-07-12",
      childrenAges: [5],
      stops: [],
      countryTour: {
        country: "United States",
        countryCode: "US",
        requestedRegions: ["California"],
        suggestedStopCount: 4,
      },
    },
    expectations: {
      mustIncludeStops: ["San Francisco", "Monterey", "Los Angeles", "San Diego"],
      noDuplicateStops: true,
      minStopNights: 2,
    },
  },
  {
    id: "italy-honeymoon",
    intent: {
      tripShape: "country_tour",
      destination: "Italy",
      startDate: "2026-09-01",
      endDate: "2026-09-12",
      childrenAges: [],
      stops: [],
      countryTour: {
        country: "Italy",
        countryCode: "IT",
        requestedRegions: [],
        suggestedStopCount: 4,
      },
    },
    expectations: {
      mustIncludeStops: ["Rome", "Florence", "Venice"],
      noDuplicateStops: true,
      feasibilityLabels: ["easy", "balanced"],
    },
  },
  {
    id: "tokyo-disney-child",
    schedulerPlan: {
      suggestedActivities: [
        { id: "disney", name: "Tokyo Disneyland", category: "theme_parks", duration: "2 hours" },
        { id: "museum", name: "Tokyo National Museum", category: "museums", duration: "2 hours" },
      ],
      dailyItinerary: [
        {
          day: "Day 1",
          activities: ["disney", "museum"],
          meals: { dinner: { name: "Family Dinner" } },
          notes: "",
        },
      ],
    },
    expectations: {
      anchorName: "Tokyo Disneyland",
      anchorDuration: 480,
      noTwoHourDisney: true,
      latestChildNonMealEndMinutes: 1080,
    },
  },
];
