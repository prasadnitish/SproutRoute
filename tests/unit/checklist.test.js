import test from "node:test";
import assert from "node:assert/strict";
import {
  filterCheckedItems,
  getPackingItemIds,
  makeItemId,
  loadCustomItems,
  saveCustomItems,
} from "../../src/frontend/src/utils/checklist.js";

// ── Fixtures ────────────────────────────────────────────────────────────────

const packingList = {
  categories: [
    {
      name: "Clothing",
      items: [
        { name: "Jacket", quantity: "1" },
        { name: "Socks", quantity: "3 pairs" },
      ],
    },
    {
      name: "Gear",
      items: [{ name: "Stroller", quantity: "1" }],
    },
  ],
};

// ── makeItemId ──────────────────────────────────────────────────────────────

test("makeItemId produces a stable content-hash string", () => {
  const id = makeItemId("Clothing", "Jacket", "1");
  assert.equal(id, "clothing||jacket||1");
});

test("makeItemId is case-insensitive and trims whitespace", () => {
  const a = makeItemId("  Clothing  ", "Jacket ", "1");
  const b = makeItemId("clothing", "jacket", "1");
  assert.equal(a, b);
});

test("makeItemId handles empty quantity gracefully", () => {
  const id = makeItemId("Clothing", "Jacket", "");
  assert.equal(id, "clothing||jacket||");
});

// ── getPackingItemIds ───────────────────────────────────────────────────────

test("getPackingItemIds returns content-hash IDs for all list items", () => {
  const ids = getPackingItemIds(packingList);

  // Content-hash IDs, not position-based
  assert.ok(ids.has("clothing||jacket||1"), "Jacket ID must be present");
  assert.ok(ids.has("clothing||socks||3 pairs"), "Socks ID must be present");
  assert.ok(ids.has("gear||stroller||1"), "Stroller ID must be present");
  assert.equal(ids.size, 3);
});

test("getPackingItemIds survives list regeneration with same items", () => {
  // Simulate regeneration: same items, different order within category
  const regeneratedList = {
    categories: [
      {
        name: "Clothing",
        items: [
          { name: "Socks", quantity: "3 pairs" }, // ← swapped order
          { name: "Jacket", quantity: "1" },
        ],
      },
      {
        name: "Gear",
        items: [{ name: "Stroller", quantity: "1" }],
      },
    ],
  };

  const ids = getPackingItemIds(regeneratedList);
  // IDs must be identical to original order — content-hash, not position-based
  assert.ok(ids.has("clothing||jacket||1"));
  assert.ok(ids.has("clothing||socks||3 pairs"));
  assert.ok(ids.has("gear||stroller||1"));
});

test("getPackingItemIds includes custom items per category", () => {
  const customItems = {
    Clothing: [{ name: "Formula", quantity: "2 cans", reason: "Custom" }],
  };
  const ids = getPackingItemIds(packingList, customItems);
  assert.ok(ids.has("clothing||formula||2 cans"), "Custom item ID must be included");
  assert.equal(ids.size, 4); // 3 AI + 1 custom
});

// ── filterCheckedItems ──────────────────────────────────────────────────────

test("filterCheckedItems removes stale IDs after list regeneration", () => {
  const validIds = new Set([
    "clothing||jacket||1",
    "gear||stroller||1",
  ]);
  const savedChecked = [
    "clothing||jacket||1",
    "clothing||socks||3 pairs", // stale — not in validIds
    "gear||stroller||1",
  ];

  const filtered = filterCheckedItems(savedChecked, validIds);

  assert.deepEqual(filtered, ["clothing||jacket||1", "gear||stroller||1"]);
});

test("filterCheckedItems returns empty array when all IDs are stale", () => {
  const validIds = new Set(["clothing||jacket||1"]);
  const savedChecked = ["old-format-0-0", "another-old-id"];

  const filtered = filterCheckedItems(savedChecked, validIds);
  assert.deepEqual(filtered, []);
});

// ── loadCustomItems / saveCustomItems ───────────────────────────────────────

test("loadCustomItems returns empty object when localStorage is empty", () => {
  // Node environment has no localStorage — the function should catch the error and return {}
  const result = loadCustomItems();
  assert.deepEqual(result, {});
});

test("saveCustomItems does not throw in environments without localStorage", () => {
  // Should fail silently in Node test environment
  assert.doesNotThrow(() => {
    saveCustomItems({ Clothing: [{ name: "Test", quantity: "1" }] });
  });
});
