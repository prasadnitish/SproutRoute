#!/usr/bin/env node
// Paid, synthetic golden-set run that produces Langfuse eval traces.
// Sends made-up trips (no real users) to a deployed backend with the eval
// token, so each request is captured in full and tagged with its client.
//
//   EVAL_CAPTURE_TOKEN=... node scripts/run-eval-traces.mjs \
//     --base=https://<your-backend> --client=web --confirm-spend
//
// Options: --client=web|ios (default web), --only=<case-id,...>,
// --run=<label> (groups the run as one Langfuse session), --delay-ms=<n>.
// Each case calls real models and spends provider credit, hence --confirm-spend.
const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [key, ...rest] = arg.replace(/^--/, "").split("=");
    return [key, rest.length ? rest.join("=") : true];
  }),
);

const token = process.env.EVAL_CAPTURE_TOKEN;
const base = String(args.base || "").replace(/\/$/, "");
const client = args.client || "web";
const runId = args.run || `${client}-${new Date().toISOString().slice(0, 16).replace(/[^0-9]/g, "")}`;
const delayMs = Number(args["delay-ms"] ?? 3000);

if (!token || !base || !["web", "ios"].includes(client)) {
  console.error("Usage: EVAL_CAPTURE_TOKEN=... node scripts/run-eval-traces.mjs --base=<url> --client=web|ios --confirm-spend");
  process.exit(2);
}
if (!args["confirm-spend"]) {
  console.error("This calls paid models on the target backend. Re-run with --confirm-spend.");
  process.exit(2);
}

// Dates are relative to today so trips are always in the future.
const day = (offset) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
const trip = (id, rubric, startOffset, nights, fields) => ({
  id,
  rubric,
  kind: "trip",
  body: { startDate: day(startOffset), endDate: day(startOffset + nights), ...fields },
});

// Ten cases, matching the rubric's "human-score about 10 traces" step.
// `rubric` names the lines each case mainly exercises.
const CASES = [
  { id: "parse-vegas-explicit", rubric: ["O1", "T1"], kind: "parse", body: { text: "Plan a 3-day trip to Las Vegas with two adults and my 6-year-old. We want shows and pools." } },
  { id: "parse-vague-beach-pet", rubric: ["T1", "O1"], kind: "parse", body: { text: "I want a beach trip near Bellevue with my 3-year-old and dog named Max next weekend." } },
  { id: "parse-tokyo-vegetarian", rubric: ["O1"], kind: "parse", body: { text: "Five days in Tokyo with my 8-year-old. We are vegetarian and want to avoid crowds." } },
  trip("trip-vegas-family", ["O2", "O3", "X2"], 30, 1, { destination: "Las Vegas, Nevada", activities: ["family museums", "outdoor gardens"], children: [{ age: 6 }] }),
  trip("trip-san-diego-dog", ["O3", "G1"], 32, 1, { destination: "San Diego, California", activities: ["beaches", "parks"], children: [{ age: 4 }], pets: [{ type: "dog", name: "Max", weightLb: 20 }] }),
  trip("trip-tokyo-five-day", ["O1", "O2", "X1"], 40, 4, { destination: "Tokyo, Japan", activities: ["museums", "parks", "vegetarian food"], children: [{ age: 8 }] }),
  trip("trip-seattle-toddler-rain", ["X2", "O3"], 34, 2, { destination: "Seattle, Washington", activities: ["indoor play", "aquarium"], children: [{ age: 2 }] }),
  trip("trip-london-car-seat", ["G1", "O3"], 45, 3, { destination: "London, United Kingdom", activities: ["parks", "museums"], children: [{ age: 4 }] }),
  trip("trip-yellowstone-six-day", ["O2", "T3", "X1"], 60, 5, { destination: "Yellowstone National Park, Wyoming", activities: ["wildlife", "easy hikes"], children: [{ age: 7 }, { age: 10 }] }),
  trip("trip-nyc-two-kids", ["O1", "O2", "X2"], 38, 2, { destination: "New York City, New York", activities: ["playgrounds", "museums"], children: [{ age: 5 }, { age: 9 }] }),
];

// The web app streams the plan; the mobile app asks for the whole bundle.
const tripPath = client === "web" ? "/api/v1/trip/stream" : "/api/v1/trip/bundle";
const pathFor = (kind) => (kind === "parse" ? "/api/v1/trip/parse-input" : tripPath);

const only = args.only ? new Set(String(args.only).split(",")) : null;
const selected = CASES.filter((c) => !only || only.has(c.id));

let failures = 0;
for (const [index, testCase] of selected.entries()) {
  const started = performance.now();
  const body = testCase.kind === "parse" ? { ...testCase.body, clientDate: day(0) } : { ...testCase.body, client };
  try {
    const res = await fetch(`${base}${pathFor(testCase.kind)}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-eval-capture": token,
        "x-eval-client": client,
        "x-eval-case": testCase.id,
        "x-eval-run": runId,
        "x-eval-rubric": testCase.rubric.join(","),
      },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    const streamError = /^event: error$/m.test(text);
    if (!res.ok || streamError) failures++;
    console.log(JSON.stringify({
      case: testCase.id,
      client,
      rubric: testCase.rubric,
      status: res.status,
      stream_error: streamError,
      ms: Math.round(performance.now() - started),
    }));
  } catch (error) {
    failures++;
    console.log(JSON.stringify({ case: testCase.id, client, error: error.message }));
  }
  if (index < selected.length - 1) await new Promise((resolve) => setTimeout(resolve, delayMs));
}
console.log(`Run ${runId}: ${selected.length - failures}/${selected.length} requests finished. Open Langfuse > Sessions > ${runId}.`);
if (failures) process.exitCode = 1;
