import test from "node:test";
import assert from "node:assert/strict";
import { runPackingAgent } from "../../src/backend/agents/packingAgent.js";

const retrieval = { weather: { summary: "Mild", forecast: [] } };

test("runPackingAgent generates a packing list from trip data and weather", async () => {
  const deps = {
    generatePackingListFn: async (tripData, weather) => {
      assert.equal(tripData.startDate, "2026-08-01");
      assert.equal(weather.summary, "Mild");
      return { categories: [{ name: "Clothing", items: [{ name: "Jacket", quantity: "1", reason: "Mild weather" }] }] };
    },
  };

  const result = await runPackingAgent(
    { startDate: "2026-08-01", endDate: "2026-08-04", activities: ["parks"], children: [{ age: 5 }], pets: [] },
    retrieval,
    deps,
  );

  assert.equal(result.packingList.categories.length, 1);
});

test("runPackingAgent defaults activities when none are provided", async () => {
  const deps = {
    generatePackingListFn: async (tripData) => {
      assert.deepEqual(tripData.activities, ["family-friendly", "parks", "city"]);
      return { categories: [] };
    },
  };

  await runPackingAgent(
    { startDate: "2026-08-01", endDate: "2026-08-02", activities: [], children: [], pets: [] },
    retrieval,
    deps,
  );
});
