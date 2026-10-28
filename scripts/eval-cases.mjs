// The golden-set cases and the calls each client makes for them, shared by scripts/run-eval-traces.mjs and its tests.
// Every case is a made-up trip. A trip is several calls, not one, so each case lists its steps in the order the
// client makes them; the runner sends them all under one journey id.

// Dates are relative to today so trips are always in the future.
export const day = (offset) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

const trip = (id, rubric, startOffset, nights, { countryCode = "US", travelMode = "car", ...fields }) => ({
  id,
  rubric,
  kind: "trip",
  countryCode,
  travelMode,
  body: { startDate: day(startOffset), endDate: day(startOffset + nights), ...fields },
});

// Ten cases, matching the rubric's "human-score about 10 traces" step.
// `rubric` names the lines each case mainly exercises.
export const CASES = [
  { id: "parse-vegas-explicit", rubric: ["O1", "T1"], kind: "parse", body: { text: "Plan a 3-day trip to Las Vegas with two adults and my 6-year-old. We want shows and pools." } },
  { id: "parse-vague-beach-pet", rubric: ["T1", "O1"], kind: "parse", body: { text: "I want a beach trip near Bellevue with my 3-year-old and dog named Max next weekend." } },
  { id: "parse-tokyo-vegetarian", rubric: ["O1"], kind: "parse", body: { text: "Five days in Tokyo with my 8-year-old. We are vegetarian and want to avoid crowds." } },
  trip("trip-vegas-family", ["O2", "O3", "X2"], 30, 1, { destination: "Las Vegas, Nevada", activities: ["family museums", "outdoor gardens"], children: [{ age: 6 }] }),
  trip("trip-san-diego-dog", ["O3", "G1"], 32, 1, { destination: "San Diego, California", activities: ["beaches", "parks"], children: [{ age: 4 }], pets: [{ type: "dog", name: "Max", weightLb: 20 }] }),
  trip("trip-tokyo-five-day", ["O1", "O2", "X1"], 40, 4, { countryCode: "JP", destination: "Tokyo, Japan", activities: ["museums", "parks", "vegetarian food"], children: [{ age: 8 }] }),
  trip("trip-seattle-toddler-rain", ["X2", "O3"], 34, 2, { destination: "Seattle, Washington", activities: ["indoor play", "aquarium"], children: [{ age: 2 }] }),
  trip("trip-london-car-seat", ["G1", "O3"], 45, 3, { countryCode: "GB", destination: "London, United Kingdom", activities: ["parks", "museums"], children: [{ age: 4 }] }),
  trip("trip-yellowstone-six-day", ["O2", "T3", "X1"], 60, 5, { destination: "Yellowstone National Park, Wyoming", activities: ["wildlife", "easy hikes"], children: [{ age: 7 }, { age: 10 }] }),
  trip("trip-nyc-two-kids", ["O1", "O2", "X2"], 38, 2, { destination: "New York City, New York", activities: ["playgrounds", "museums"], children: [{ age: 5 }, { age: 9 }] }),
];

/**
 * The calls one client makes for a case, in order.
 *   web: parse-input; or stream, packing, then car seat and pet checks when the family needs them.
 *   ios: parse-input; or stream, then the pet check. The iOS app packs on the device and calls neither
 *        packing nor the car seat check, and it never calls the bundle endpoint.
 * @returns {Array<{step: string, path: string, body: object}>}
 */
export function stepsFor(testCase, client) {
  if (testCase.kind === "parse") {
    return [{ step: "parse", path: "/api/v1/trip/parse-input", body: { ...testCase.body, clientDate: day(0) } }];
  }
  const { body } = testCase;
  const steps = [{ step: "stream", path: "/api/v1/trip/stream", body: { ...body, client } }];
  if (client === "web") steps.push({ step: "packing", path: "/api/v1/trip/packing", body: { ...body, client } });
  if (client === "web" && body.children?.length) {
    steps.push({
      step: "car-seat",
      path: "/api/v1/safety/car-seat-check",
      body: { destination: body.destination, tripDate: body.startDate, children: body.children, countryCode: testCase.countryCode },
    });
  }
  if (body.pets?.length) {
    steps.push({
      step: "pet",
      path: "/api/v1/safety/pet-travel-check",
      body: { pets: body.pets, destination: body.destination, countryCode: testCase.countryCode, travelMode: testCase.travelMode },
    });
  }
  return steps;
}
