// Ephemeral per-submission IDs; never stored alongside a user or profile identifier.
const journeys = new WeakMap();
export function beginJourney(signal) {
  if (!signal) return;
  const id = crypto.randomUUID().replaceAll("-", "");
  journeys.set(signal, {
    id,
    start: performance.now(),
    started_at: new Date().toISOString(),
    events: [],
  });
  markJourney(signal, "submitted");
}
export function journeyHeaders(signal) {
  const j = signal && journeys.get(signal);
  return j ? { "X-Journey-Id": j.id } : {};
}
export function markJourney(signal, name) {
  const j = signal && journeys.get(signal);
  if (j && !j.events.some((e) => e.name === name) && j.events.length < 16)
    j.events.push({ name, ms: performance.now() - j.start });
}
export function exportJourney(signal) {
  const j = signal && journeys.get(signal);
  return j
    ? { journey_id: j.id, events: j.events.map((e) => ({ ...e })) }
    : null;
}
