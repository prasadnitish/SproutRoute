export const STORAGE_KEYS = {
  theme: "sproutroute-theme",
  trip: "sproutroute_trip",
  checked: "sproutroute_checked",
  customItems: "sproutroute_custom_items",
};

export function loadJSON(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function saveJSON(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* quota exceeded */ }
}
