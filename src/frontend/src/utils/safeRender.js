/**
 * Safely convert any value to a renderable string.
 * Prevents React error #31 when AI returns objects instead of strings.
 */
export function safeText(value) {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(safeText).filter(Boolean).join(", ");
  if (typeof value === "object") {
    if (value.name) return String(value.name);
    if (value.text) return String(value.text);
    if (value.title) return String(value.title);
    if (value.description) return String(value.description);
    const vals = Object.values(value).map(safeText).filter(Boolean);
    return vals.length > 0 ? vals.join(" · ") : "";
  }
  return String(value);
}

/**
 * Format a meals field (string or {breakfast, lunch, dinner} object).
 */
export function formatMeals(meals) {
  if (!meals) return "";
  if (typeof meals === "string") return meals;
  if (typeof meals === "object") {
    return [meals.breakfast, meals.lunch, meals.dinner]
      .map((m) => (m && typeof m === "object" ? m.name || m.text || "" : safeText(m)))
      .filter(Boolean)
      .join(" · ");
  }
  return String(meals);
}
