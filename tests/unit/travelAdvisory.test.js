import test from "node:test";
import assert from "node:assert/strict";
import {
  getTravelAdvisory,
  parseAdvisoryLevel,
  __resetAdvisoryCacheForTests,
} from "../../src/backend/services/travelAdvisory.js";

const originalFetch = global.fetch;

test.afterEach(() => {
  global.fetch = originalFetch;
  __resetAdvisoryCacheForTests();
});

// Mock State Department API response matching their real schema.
const MOCK_ADVISORY_LIST = [
  {
    Title: "Mexico - Level 2: Exercise Increased Caution",
    Link: "https://travel.state.gov/content/travel/en/traveladvisories/traveladvisories/mexico-travel-advisory.html",
    Category: ["MX"],
    Summary:
      "<p>Reconsider travel to Mexico due to <strong>crime</strong> and <strong>kidnapping</strong>. Some areas have increased risk.</p>",
    id: "advisory-mx-001",
    Published: "2024-05-20T00:00:00Z",
    Updated: "2024-11-15T00:00:00Z",
  },
  {
    Title: "France - Level 2: Exercise Increased Caution",
    Link: "https://travel.state.gov/content/travel/en/traveladvisories/traveladvisories/france-travel-advisory.html",
    Category: ["FR"],
    Summary:
      "<p>Exercise increased caution in France due to <strong>terrorism</strong> and <strong>civil unrest</strong>.</p>",
    id: "advisory-fr-002",
    Published: "2024-03-10T00:00:00Z",
    Updated: "2024-09-01T00:00:00Z",
  },
  {
    Title: "Afghanistan - Level 4: Do Not Travel",
    Link: "https://travel.state.gov/content/travel/en/traveladvisories/traveladvisories/afghanistan-advisory.html",
    Category: ["AF"],
    Summary:
      "<p>Do not travel to Afghanistan due to <strong>terrorism</strong>, risk of <strong>kidnapping</strong>, and <strong>civil unrest</strong>.</p>",
    id: "advisory-af-003",
    Published: "2023-01-15T00:00:00Z",
    Updated: "2024-06-20T00:00:00Z",
  },
];

function mockStateDeptFetch() {
  return async () =>
    new Response(JSON.stringify(MOCK_ADVISORY_LIST), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
}

test("getTravelAdvisory returns advisory for known country code", async () => {
  global.fetch = mockStateDeptFetch();

  const result = await getTravelAdvisory("MX");

  assert.ok(result, "Expected non-null advisory for MX");
  assert.equal(result.level, 2);
  assert.equal(
    result.title,
    "Mexico - Level 2: Exercise Increased Caution",
  );
  assert.equal(typeof result.summary, "string");
  // Summary should have HTML tags stripped
  assert.ok(
    !result.summary.includes("<p>"),
    "Summary should not contain HTML tags",
  );
  assert.ok(
    !result.summary.includes("<strong>"),
    "Summary should not contain HTML tags",
  );
  assert.ok(Array.isArray(result.riskCategories), "riskCategories should be an array");
  assert.ok(
    result.riskCategories.includes("crime"),
    "Should detect 'crime' risk category",
  );
  assert.ok(
    result.riskCategories.includes("kidnapping"),
    "Should detect 'kidnapping' risk category",
  );
  assert.equal(result.lastUpdated, "2024-11-15T00:00:00Z");
  assert.equal(
    result.sourceUrl,
    "https://travel.state.gov/content/travel/en/traveladvisories/traveladvisories/mexico-travel-advisory.html",
  );
});

test("getTravelAdvisory caches the full advisory list", async () => {
  let fetchCalls = 0;
  global.fetch = async () => {
    fetchCalls += 1;
    return new Response(JSON.stringify(MOCK_ADVISORY_LIST), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  await getTravelAdvisory("MX");
  await getTravelAdvisory("FR");

  assert.equal(
    fetchCalls,
    1,
    "Should fetch advisory list only once (cache hit on second call)",
  );
});

test("getTravelAdvisory returns null for US destinations", async () => {
  global.fetch = mockStateDeptFetch();

  const result = await getTravelAdvisory("US");

  assert.equal(result, null, "US domestic travel should not return an advisory");
});

test("getTravelAdvisory returns null when API is down", async () => {
  global.fetch = async () => {
    throw new Error("Network error: connection refused");
  };

  const result = await getTravelAdvisory("MX");

  assert.equal(
    result,
    null,
    "Should return null (graceful degradation) when API is down",
  );
});

test("getTravelAdvisory returns null for unknown country code", async () => {
  global.fetch = mockStateDeptFetch();

  const result = await getTravelAdvisory("ZZ");

  assert.equal(result, null, "Unknown country code should return null");
});

test("parseAdvisoryLevel extracts level 1-4 from title", () => {
  assert.equal(
    parseAdvisoryLevel("Mexico - Level 2: Exercise Increased Caution"),
    2,
  );
  assert.equal(
    parseAdvisoryLevel("Afghanistan - Level 4: Do Not Travel"),
    4,
  );
  assert.equal(
    parseAdvisoryLevel("United Kingdom - Level 1: Exercise Normal Precautions"),
    1,
  );
  assert.equal(
    parseAdvisoryLevel("Somalia - Level 3: Reconsider Travel"),
    3,
  );
  assert.equal(
    parseAdvisoryLevel("Unparseable title without level info"),
    0,
    "Should return 0 when level cannot be parsed",
  );
});
