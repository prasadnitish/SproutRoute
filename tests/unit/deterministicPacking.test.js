import test from "node:test";
import assert from "node:assert/strict";
import { generatePackingList } from "../../src/backend/services/deterministicPacking.js";

const warmWeather = {
  summary: "Warm and sunny with one breezy evening",
  forecast: [
    { name: "Mon", high: 82, low: 64, condition: "Sunny", precipitation: 10 },
    { name: "Tue", high: 84, low: 65, condition: "Partly Cloudy", precipitation: 10 },
    { name: "Wed", high: 81, low: 63, condition: "Sunny", precipitation: 5 },
    { name: "Thu", high: 80, low: 62, condition: "Sunny", precipitation: 0 },
    { name: "Fri", high: 79, low: 61, condition: "Clear", precipitation: 0 },
    { name: "Sat", high: 78, low: 60, condition: "Clear", precipitation: 0 },
    { name: "Sun", high: 77, low: 59, condition: "Clear", precipitation: 0 },
  ],
};

const rainyWeather = {
  summary: "Cool and rainy most afternoons",
  forecast: [
    { name: "Mon", high: 59, low: 47, condition: "Rain", precipitation: 80 },
    { name: "Tue", high: 58, low: 46, condition: "Showers", precipitation: 70 },
    { name: "Wed", high: 60, low: 45, condition: "Rain", precipitation: 85 },
  ],
};

test("deterministic packing builds a complete week-long family list", async () => {
  const result = await generatePackingList(
    {
      destination: "San Diego, CA",
      startDate: "2026-06-01",
      endDate: "2026-06-08",
      activities: ["beach", "parks", "relaxing"],
      children: [{ age: 2 }],
      pets: [],
      foodPreferences: { dietary: [], avoidances: [], cuisines: [], kidFoods: [], budget: "moderate" },
    },
    warmWeather,
  );

  assert.ok(result.categories.length >= 5, "should return at least five categories");
  const totalItems = result.categories.reduce((sum, category) => sum + category.items.length, 0);
  assert.ok(totalItems >= 18, "should include a useful number of items for a week-long trip");

  const categoryNames = result.categories.map((category) => category.name);
  assert.ok(categoryNames.includes("Clothing"));
  assert.ok(categoryNames.includes("Toiletries"));
  assert.ok(categoryNames.includes("Gear"));
  assert.ok(categoryNames.includes("Documents"));

  const allItemNames = result.categories.flatMap((category) => category.items.map((item) => item.name));
  assert.ok(allItemNames.includes("Sunscreen"));
  assert.ok(allItemNames.includes("Stroller"));
  assert.ok(allItemNames.includes("Snacks"));
  assert.ok(allItemNames.includes("Extra toddler outfit"));
});

test("deterministic packing adds pet and rainy-weather gear when needed", async () => {
  const result = await generatePackingList(
    {
      destination: "Portland, OR",
      startDate: "2026-10-01",
      endDate: "2026-10-04",
      activities: ["parks", "city"],
      children: [{ age: 5 }],
      pets: [{ type: "dog", name: "Max", breed: "golden retriever", weightLb: 45 }],
      foodPreferences: null,
    },
    rainyWeather,
  );

  const petCategory = result.categories.find((category) => category.name === "Pet Supplies");
  assert.ok(petCategory, "should include a pet supplies category");
  assert.ok(petCategory.items.some((item) => item.name === "Leash and ID tag"));
  assert.ok(petCategory.items.some((item) => item.name === "Pet food and treats"));

  const gearCategory = result.categories.find((category) => category.name === "Gear");
  assert.ok(gearCategory.items.some((item) => item.name === "Rain jacket"));
  assert.ok(gearCategory.items.some((item) => item.name === "Compact umbrella"));
});
