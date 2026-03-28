export const STORAGE_KEYS = {
  theme: "sproutroute-theme",
  trip: "sproutroute_trip",
  checked: "sproutroute_checked",
  customItems: "sproutroute_custom_items",
};

const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export function loadJSON(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const wrapper = JSON.parse(raw);
    // Support both TTL-wrapped and legacy unwrapped values
    if (wrapper && typeof wrapper === "object" && wrapper.__expiresAt) {
      if (Date.now() > wrapper.__expiresAt) {
        localStorage.removeItem(key);
        return null;
      }
      return wrapper.value;
    }
    return wrapper;
  } catch { return null; }
}

export function saveJSON(key, value, ttlMs = DEFAULT_TTL_MS) {
  try {
    const wrapper = { value, __expiresAt: Date.now() + ttlMs };
    localStorage.setItem(key, JSON.stringify(wrapper));
  } catch { /* quota exceeded */ }
}
