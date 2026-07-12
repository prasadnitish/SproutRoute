const KEY = "sprout:recentTrips";
const MAX = 3;

export function loadRecentTrips() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.slice(0, MAX) : [];
  } catch {
    return [];
  }
}

export function addRecentTrip(entry) {
  if (!entry || !entry.destination) return;
  try {
    const existing = loadRecentTrips().filter(
      (t) => (t.destination || "").toLowerCase() !== entry.destination.toLowerCase(),
    );
    const next = [
      {
        destination: entry.destination,
        startDate: entry.startDate || null,
        endDate: entry.endDate || null,
        prompt: entry.prompt || "",
        savedAt: Date.now(),
      },
      ...existing,
    ].slice(0, MAX);
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* storage full or disabled */
  }
}

export function clearRecentTrips() {
  try { localStorage.removeItem(KEY); } catch { /* noop */ }
}
