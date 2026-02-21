/**
 * Checklist utilities — ported from strollerscout/src/frontend/src/utils/checklist.js
 *
 * Key changes for React Native:
 * - loadCustomItems / saveCustomItems use AsyncStorage instead of localStorage
 * - Everything else is identical to the web version
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import type { PackingList } from "../types/trip";

const CUSTOM_ITEMS_KEY = "sproutroute_custom_items";
const CHECKED_ITEMS_KEY = "sproutroute_checked";
const TRIP_DATA_KEY = "sproutroute_trip";
const TRIP_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// ── Item ID ───────────────────────────────────────────────────────────────────

/**
 * Generate a stable content-hash ID for a packing item.
 * Format: "categoryname||itemname||quantity"
 * Survives list regeneration (unlike positional IDs).
 */
export function makeItemId(
  categoryName: string,
  itemName: string,
  quantity: string | number = "",
): string {
  const cat = (categoryName || "").toLowerCase().trim();
  const name = (itemName || "").toLowerCase().trim();
  const qty = String(quantity || "")
    .toLowerCase()
    .trim();
  return `${cat}||${name}||${qty}`;
}

// ── Packing item ID sets ──────────────────────────────────────────────────────

export interface CustomItems {
  [categoryName: string]: Array<{
    name: string;
    quantity: string;
    reason: string;
    source: "custom";
  }>;
}

/**
 * Build a Set of all valid item IDs from the AI-generated packing list
 * plus any custom items the user has added.
 */
export function getPackingItemIds(
  packingList: PackingList | null,
  customItems: CustomItems = {},
): Set<string> {
  const ids = new Set<string>();
  if (!packingList?.categories) return ids;

  for (const category of packingList.categories) {
    const categoryName = category.name || "";
    for (const item of category.items || []) {
      ids.add(makeItemId(categoryName, item.name, item.quantity));
    }
    // Add custom items for this category
    const custom = customItems[categoryName] || [];
    for (const item of custom) {
      ids.add(makeItemId(categoryName, item.name, item.quantity));
    }
  }

  return ids;
}

/**
 * Filter a checked-items Set to remove IDs that no longer exist in the packing list.
 * Call this after the packing list regenerates to prune stale checked state.
 */
export function filterCheckedItems(
  checkedItemIds: Set<string>,
  validItemIds: Set<string>,
): Set<string> {
  const result = new Set<string>();
  for (const id of checkedItemIds) {
    if (validItemIds.has(id)) result.add(id);
  }
  return result;
}

// ── AsyncStorage persistence ──────────────────────────────────────────────────

/** Load custom items from AsyncStorage (async — returns empty object on failure). */
export async function loadCustomItems(): Promise<CustomItems> {
  try {
    const json = await AsyncStorage.getItem(CUSTOM_ITEMS_KEY);
    return json ? JSON.parse(json) : {};
  } catch {
    return {};
  }
}

/** Save custom items to AsyncStorage. */
export async function saveCustomItems(customItems: CustomItems): Promise<void> {
  try {
    await AsyncStorage.setItem(CUSTOM_ITEMS_KEY, JSON.stringify(customItems));
  } catch {
    /* ignore write errors — non-critical */
  }
}

/** Load checked item IDs from AsyncStorage. */
export async function loadCheckedItems(): Promise<Set<string>> {
  try {
    const json = await AsyncStorage.getItem(CHECKED_ITEMS_KEY);
    const arr = json ? JSON.parse(json) : [];
    return new Set<string>(arr);
  } catch {
    return new Set<string>();
  }
}

/** Save checked item IDs to AsyncStorage. */
export async function saveCheckedItems(
  checkedItems: Set<string>,
): Promise<void> {
  try {
    await AsyncStorage.setItem(
      CHECKED_ITEMS_KEY,
      JSON.stringify([...checkedItems]),
    );
  } catch {
    /* ignore */
  }
}

/** Load saved trip from AsyncStorage. Returns null if not found or expired (> 7 days). */
export async function loadSavedTrip(): Promise<unknown | null> {
  try {
    const json = await AsyncStorage.getItem(TRIP_DATA_KEY);
    if (!json) return null;
    const parsed = JSON.parse(json);
    if (parsed.lastModified) {
      const ageMs = Date.now() - new Date(parsed.lastModified).getTime();
      if (ageMs > TRIP_TTL_MS) {
        await AsyncStorage.multiRemove([
          TRIP_DATA_KEY,
          CHECKED_ITEMS_KEY,
          CUSTOM_ITEMS_KEY,
        ]);
        return null;
      }
    }
    return parsed;
  } catch {
    return null;
  }
}

/** Save trip data to AsyncStorage with 7-day TTL. */
export async function saveTripData(tripData: unknown): Promise<void> {
  try {
    await AsyncStorage.setItem(TRIP_DATA_KEY, JSON.stringify(tripData));
  } catch {
    /* ignore */
  }
}

/** Clear all SproutRoute data from AsyncStorage. */
export async function clearAllData(): Promise<void> {
  try {
    await AsyncStorage.multiRemove([
      TRIP_DATA_KEY,
      CHECKED_ITEMS_KEY,
      CUSTOM_ITEMS_KEY,
    ]);
  } catch {
    /* ignore */
  }
}
