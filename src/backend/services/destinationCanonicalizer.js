export function normalizeDestinationKey(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b(japan|italy|france|spain|usa|united states|uk|united kingdom)\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function canonicalStopKey(stop = {}) {
  const city = normalizeDestinationKey(stop.name || stop.displayName);
  const region = normalizeDestinationKey(stop.regionCode || "");
  const country = normalizeDestinationKey(stop.countryCode || "");
  return [city, region, country].filter(Boolean).join(":");
}

export function titleCaseStopName(value) {
  return String(value || "")
    .split(",")[0]
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function dedupeCanonicalStops(stops = []) {
  const seen = new Map();
  const output = [];
  const warnings = [];

  for (const stop of stops) {
    const key = canonicalStopKey(stop);
    if (!key) continue;

    if (seen.has(key)) {
      const kept = seen.get(key);
      warnings.push(`${titleCaseStopName(stop.name)} was listed more than once, so it was kept once.`);
      kept.notes = [...new Set([...(kept.notes || []), "Duplicate stop removed."])];
      continue;
    }

    const normalized = {
      ...stop,
      name: titleCaseStopName(stop.name),
      canonicalKey: key,
    };
    seen.set(key, normalized);
    output.push(normalized);
  }

  return { stops: output, warnings };
}
