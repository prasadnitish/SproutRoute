// The golden-set cases and the calls each client makes for them, shared by scripts/run-eval-traces.mjs and its tests.
// Every case is a made-up trip. A trip is several calls, not one, so each case lists its steps in the order the
// client makes them; the runner sends them all under one journey id.

// Dates are relative to today so trips are always in the future.
export const day = (offset) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

const trip = (id, rubric, startOffset, nights, { countryCode = "US", ...fields }) => ({
  id,
  rubric,
  kind: "trip",
  countryCode,
  body: { startDate: day(startOffset), endDate: day(startOffset + nights), ...fields },
});

// Seventeen cases: ten parses and seven trips. `rubric` names the lines each case mainly exercises. A parse case
// also carries `expect`, what the request actually says, so the parse can be scored without a person.
// The first three parse cases and the seven trips are the original golden set.
export const CASES = [
  { id: "parse-vegas-explicit", rubric: ["O1", "T1"], kind: "parse", body: { text: "Plan a 3-day trip to Las Vegas with two adults and my 6-year-old. We want shows and pools." }, expect: { destinationIncludes: ["Las Vegas"], childrenAges: [6], adults: 2, dayCount: 3 } },
  { id: "parse-vague-beach-pet", rubric: ["T1", "O1"], kind: "parse", body: { text: "I want a beach trip near Bellevue with my 3-year-old and dog named Max next weekend." }, expect: { destinationNull: true, childrenAges: [3], petTypes: ["dog"] } },
  { id: "parse-tokyo-vegetarian", rubric: ["O1"], kind: "parse", body: { text: "Five days in Tokyo with my 8-year-old. We are vegetarian and want to avoid crowds." }, expect: { destinationIncludes: ["Tokyo"], childrenAges: [8], dietary: ["vegetarian"], dayCount: 5 } },
  { id: "parse-maui-two-dogs", rubric: ["O1"], kind: "parse", body: { text: "A week in Maui with our two dogs and two kids, ages 4 and 7." }, expect: { destinationIncludes: ["Maui"], childrenAges: [4, 7], petTypes: ["dog", "dog"], dayCount: [7, 8] } },
  { id: "parse-europe-multi-stop", rubric: ["O1"], kind: "parse", body: { text: "Ten days covering Amsterdam, Berlin and Budapest with our 9-year-old." }, expect: { tripShape: "multi_stop", stops: ["Amsterdam", "Berlin", "Budapest"], childrenAges: [9] } },
  { id: "parse-japan-country-tour", rubric: ["O1"], kind: "parse", body: { text: "Two weeks in Japan with our teenager." }, expect: { tripShape: "country_tour", country: "Japan", childrenAges: [14] } },
  { id: "parse-napa-no-kids", rubric: ["O1"], kind: "parse", body: { text: "Anniversary weekend in Napa, just the two of us. We love wine and fine dining." }, expect: { destinationIncludes: ["Napa"], childrenAges: [], adults: 2, budget: "fine_dining" } },
  { id: "parse-orlando-toddler", rubric: ["O1"], kind: "parse", body: { text: "Orlando theme parks with our toddler." }, expect: { destinationIncludes: ["Orlando"], childrenAges: [2] } },
  { id: "parse-vague-warm-spring", rubric: ["T1", "O1"], kind: "parse", body: { text: "Somewhere warm for spring break with our 10 and 12 year olds." }, expect: { destinationNull: true, childrenAges: [10, 12] } },
  { id: "parse-portland-cat-gluten", rubric: ["O1"], kind: "parse", body: { text: "Long weekend in Portland with our cat and our 5-year-old. We eat gluten-free." }, expect: { destinationIncludes: ["Portland"], childrenAges: [5], petTypes: ["cat"], dietary: ["gluten-free"] } },
  trip("trip-vegas-family", ["O2", "O3", "X2"], 30, 1, { destination: "Las Vegas, Nevada", activities: ["family museums", "outdoor gardens"], children: [{ age: 6 }] }),
  trip("trip-san-diego-dog", ["O3", "G1"], 32, 1, { destination: "San Diego, California", activities: ["beaches", "parks"], children: [{ age: 4 }], pets: [{ type: "dog", name: "Max", weightLb: 20 }] }),
  trip("trip-tokyo-five-day", ["O1", "O2", "X1"], 40, 4, { countryCode: "JP", destination: "Tokyo, Japan", activities: ["museums", "parks", "vegetarian food"], children: [{ age: 8 }] }),
  trip("trip-seattle-toddler-rain", ["X2", "O3"], 34, 2, { destination: "Seattle, Washington", activities: ["indoor play", "aquarium"], children: [{ age: 2 }] }),
  trip("trip-london-car-seat", ["G1", "O3"], 45, 3, { countryCode: "GB", destination: "London, United Kingdom", activities: ["parks", "museums"], children: [{ age: 4 }] }),
  trip("trip-yellowstone-six-day", ["O2", "T3", "X1"], 60, 5, { destination: "Yellowstone National Park, Wyoming", activities: ["wildlife", "easy hikes"], children: [{ age: 7 }, { age: 10 }] }),
  trip("trip-nyc-two-kids", ["O1", "O2", "X2"], 38, 2, { destination: "New York City, New York", activities: ["playgrounds", "museums"], children: [{ age: 5 }, { age: 9 }] }),
];

/**
 * The calls the apps make for a case, in order. The web app and the iOS app make the same ones, except that
 * packing goes to a different route (see below), and the `client` field differs.
 *   parse case: parse-input.
 *   trip case:  stream, then packing, travel tips, the car seat check (children) and the pet check (pets).
 * The bundle endpoint is not used: the iOS app calls it only when streaming fails.
 * @returns {Array<{step: string, path: string, body: object}>}
 */
export function stepsFor(testCase, client) {
  if (testCase.kind === "parse") {
    return [{ step: "parse", path: "/api/v1/trip/parse-input", body: { ...testCase.body, clientDate: day(0) } }];
  }
  const { body, countryCode } = testCase;
  const steps = [
    { step: "stream", path: "/api/v1/trip/stream", body: { ...body, client } },
    // The web app packs through the legacy /api/generate (lighter limiter); the iOS app uses the v1 route.
    { step: "packing", path: client === "web" ? "/api/generate" : "/api/v1/trip/packing", body: { ...body, client } },
    {
      step: "travel-tips",
      path: "/api/safety/travel-tips",
      body: { destination: body.destination, childrenAges: (body.children || []).map((c) => c.age), countryCode, client, schemaVersion: "1" },
    },
  ];
  if (body.children?.length) {
    steps.push({
      step: "car-seat",
      path: "/api/safety/car-seat-check",
      body: { destination: body.destination, tripDate: body.startDate, children: body.children, client, schemaVersion: "1" },
    });
  }
  if (body.pets?.length) {
    steps.push({
      step: "pet",
      path: "/api/v1/safety/pet-travel-check",
      // The iOS app's rule: drive at home, fly abroad. The backend accepts only these two modes.
      body: { pets: body.pets, destination: body.destination, countryCode, travelMode: countryCode === "US" ? "drive" : "fly", client, schemaVersion: "1" },
    });
  }
  return steps;
}
