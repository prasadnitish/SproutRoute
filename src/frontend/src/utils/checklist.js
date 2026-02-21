/**
 * Checklist utilities — content-hash IDs survive list regeneration.
 *
 * IDs are derived from category name + item name + quantity so that
 * re-generated lists with the same items preserve check state, even if
 * the item order within a category changes.
 *
 * Custom items added by the user are stored in localStorage under
 * "sproutroute_custom_items" keyed by category name.
 */

/**
 * Generate a stable item ID from its content — not its position.
 * Format: "<categoryName>||<itemName>||<quantity>"
 * Characters are lowercased + trimmed for resilience to minor AI wording changes.
 */
export function makeItemId(categoryName, itemName, quantity = "") {
  const cat = (categoryName || "").toLowerCase().trim();
  const name = (itemName || "").toLowerCase().trim();
  const qty = String(quantity || "").toLowerCase().trim();
  return `${cat}||${name}||${qty}`;
}

/**
 * Get all valid item IDs from a packing list (AI-generated + custom).
 * Returns a Set of content-hash IDs.
 */
export function getPackingItemIds(packingList, customItems = {}) {
  if (!packingList?.categories) return new Set();

  const ids = new Set();
  packingList.categories.forEach((category) => {
    // AI-generated items
    category.items.forEach((item) => {
      ids.add(makeItemId(category.name, item.name, item.quantity));
    });
    // Custom items for this category
    const customs = customItems[category.name] || [];
    customs.forEach((item) => {
      ids.add(makeItemId(category.name, item.name, item.quantity));
    });
  });
  return ids;
}

/**
 * Filter saved checked IDs to only those that exist in the current list.
 * Drops stale IDs from previous list versions.
 */
export function filterCheckedItems(checkedItemIds, validItemIds) {
  return checkedItemIds.filter((itemId) => validItemIds.has(itemId));
}

/**
 * Load custom items from localStorage.
 * Returns: { [categoryName]: Array<{ name, quantity, reason, source: "custom" }> }
 */
export function loadCustomItems() {
  try {
    const raw = localStorage.getItem("sproutroute_custom_items");
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/**
 * Persist custom items to localStorage.
 */
export function saveCustomItems(customItems) {
  try {
    localStorage.setItem(
      "sproutroute_custom_items",
      JSON.stringify(customItems),
    );
  } catch {
    // Storage quota or private browsing — fail silently.
  }
}
