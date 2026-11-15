// Edits a traveler makes to a scheduled itinerary. Every function returns a new
// days array and leaves its input alone; when an edit is not possible it returns
// the same array, so callers can compare by identity.
//
// A day is { date, scheduled: [item] }. Times are the scheduler's strings ("9:00 AM").

const DEFAULT_MINUTES = 60;
const MAX_BLOCK_MINUTES = 12 * 60;
const GAP_AFTER_MOVE = 15;

export function parseClock(value) {
  const match = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(String(value ?? "").trim());
  if (!match) return null;
  const hour = Number(match[1]) % 12;
  const minutes = Number(match[2]);
  if (Number(match[1]) < 1 || Number(match[1]) > 12 || minutes > 59) return null;
  return (match[3].toUpperCase() === "PM" ? hour + 12 : hour) * 60 + minutes;
}

export function formatClock(totalMinutes) {
  const minutes = ((Math.round(totalMinutes) % 1440) + 1440) % 1440;
  const hour = Math.floor(minutes / 60);
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${hour12}:${String(minutes % 60).padStart(2, "0")} ${hour >= 12 ? "PM" : "AM"}`;
}

const itemsOf = (day) => (Array.isArray(day?.scheduled) ? day.scheduled : []);
const isTimed = (item) => parseClock(item?.scheduledStart) !== null;

function lengthOf(item) {
  const start = parseClock(item.scheduledStart);
  const end = parseClock(item.scheduledEnd);
  if (start !== null && end !== null) return end >= start ? end - start : end + 1440 - start;
  return Number(item.duration) > 0 ? Number(item.duration) : DEFAULT_MINUTES;
}

function endOf(item) {
  const start = parseClock(item.scheduledStart);
  return start === null ? null : start + lengthOf(item);
}

const withTimes = (item, start) => ({
  ...item,
  scheduledStart: formatClock(start),
  scheduledEnd: formatClock(start + lengthOf(item)),
});

// The day's rhythm before an edit: when it starts, and the pause after each timed stop.
function rhythmOf(items) {
  const timed = items.filter(isTimed);
  const gaps = timed.slice(0, -1).map((item, i) => Math.max(0, parseClock(timed[i + 1].scheduledStart) - endOf(item)));
  return { start: timed.length ? parseClock(timed[0].scheduledStart) : null, gaps };
}

// Lays timed stops out again in their new order, each keeping its own length.
function retime(items, { start, gaps }, gapAt = (i) => gaps[i] ?? 0) {
  if (start === null) return items;
  let clock = start;
  let position = 0;
  return items.map((item) => {
    if (!isTimed(item)) return item;
    const placed = withTimes(item, clock);
    clock += lengthOf(item) + gapAt(position);
    position += 1;
    return placed;
  });
}

const replaceDay = (days, dayIndex, scheduled) =>
  days.map((day, i) => (i === dayIndex ? { ...day, scheduled } : day));

export function canMoveItem(days, dayIndex, itemIndex, delta) {
  const items = itemsOf(days?.[dayIndex]);
  const target = itemIndex + delta;
  return itemIndex >= 0 && itemIndex < items.length && target >= 0 && target < items.length && delta !== 0;
}

export function moveItem(days, dayIndex, itemIndex, delta) {
  if (!canMoveItem(days, dayIndex, itemIndex, delta)) return days;
  const items = itemsOf(days[dayIndex]);
  const reordered = [...items];
  const [moved] = reordered.splice(itemIndex, 1);
  reordered.splice(itemIndex + delta, 0, moved);
  return replaceDay(days, dayIndex, retime(reordered, rhythmOf(items)));
}

export function moveItemToDay(days, fromDay, itemIndex, toDay) {
  const source = itemsOf(days?.[fromDay]);
  if (fromDay === toDay || !days?.[toDay] || itemIndex < 0 || itemIndex >= source.length) return days;
  const moved = source[itemIndex];
  const target = itemsOf(days[toDay]);
  const lastEnd = Math.max(-1, ...target.map((item) => endOf(item) ?? -1));
  const placed = isTimed(moved) && lastEnd >= 0 ? withTimes(moved, lastEnd + GAP_AFTER_MOVE) : moved;
  return days.map((day, i) => {
    if (i === fromDay) return { ...day, scheduled: source.filter((_, index) => index !== itemIndex) };
    if (i === toDay) return { ...day, scheduled: [...target, placed] };
    return day;
  });
}

export function removeItem(days, dayIndex, itemIndex) {
  const items = itemsOf(days?.[dayIndex]);
  if (itemIndex < 0 || itemIndex >= items.length) return days;
  return replaceDay(days, dayIndex, items.filter((_, index) => index !== itemIndex));
}

// A traveler's own block (a nap, a call, pool time) placed right after a stop.
// Later stops move back by the block's length.
export function addBlockAfter(days, dayIndex, itemIndex, { title, durationMinutes } = {}) {
  const items = itemsOf(days?.[dayIndex]);
  const name = String(title ?? "").trim().slice(0, 80);
  const minutes = Math.round(Number(durationMinutes));
  const anchor = items[itemIndex];
  if (!anchor || !name || !(minutes > 0) || minutes > MAX_BLOCK_MINUTES) return days;

  const anchorEnd = endOf(anchor);
  const block = {
    name,
    category: "custom",
    status: "custom",
    isCustom: true,
    duration: minutes,
    scheduledStart: anchorEnd === null ? null : formatClock(anchorEnd),
    scheduledEnd: anchorEnd === null ? null : formatClock(anchorEnd + minutes),
  };
  const inserted = [...items.slice(0, itemIndex + 1), block, ...items.slice(itemIndex + 1)];
  if (anchorEnd === null) return replaceDay(days, dayIndex, inserted);

  // The block starts the moment its anchor ends; the pause that followed the
  // anchor now follows the block.
  const rhythm = rhythmOf(items);
  const anchorPosition = items.slice(0, itemIndex + 1).filter(isTimed).length - 1;
  const gaps = [...rhythm.gaps.slice(0, anchorPosition), 0, ...rhythm.gaps.slice(anchorPosition)];
  return replaceDay(days, dayIndex, retime(inserted, { start: rhythm.start, gaps }));
}
