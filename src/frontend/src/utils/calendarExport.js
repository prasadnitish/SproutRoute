// Builds an .ics file from a scheduled itinerary. Times are "floating" (no time
// zone), which calendars read as local time wherever the traveler is: the right
// meaning for "9:00 AM at the beach".
import { parseClock } from "./planEdits.js";

const pad = (n) => String(n).padStart(2, "0");

const escapeText = (value) =>
  String(value ?? "").replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/([,;])/g, "\\$1");

// RFC 5545: lines are at most 75 bytes; longer ones continue on a line that starts with a space.
function fold(line) {
  const out = [];
  let current = "";
  for (const char of line) {
    const limit = out.length === 0 ? 75 : 74;
    if (new TextEncoder().encode(current + char).length > limit) {
      out.push(current);
      current = "";
    }
    current += char;
  }
  out.push(current);
  return out.map((part, i) => (i === 0 ? part : ` ${part}`));
}

function stamp(date, minutes) {
  const [y, m, d] = date.split("-").map(Number);
  const local = new Date(Date.UTC(y, m - 1, d, 0, minutes));
  return `${local.getUTCFullYear()}${pad(local.getUTCMonth() + 1)}${pad(local.getUTCDate())}T${pad(local.getUTCHours())}${pad(local.getUTCMinutes())}00`;
}

function eventsOf(days) {
  const events = [];
  (days || []).forEach((day, dayIndex) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(day?.date || ""))) return;
    (day.scheduled || []).forEach((item, itemIndex) => {
      const start = parseClock(item?.scheduledStart);
      if (start === null || item.status === "closed") return;
      const rawEnd = parseClock(item.scheduledEnd);
      const end = rawEnd === null ? start + 60 : rawEnd > start ? rawEnd : rawEnd + 1440;
      events.push({ day, dayIndex, item, itemIndex, start, end });
    });
  });
  return events;
}

export function calendarEventCount(days) {
  return eventsOf(days).length;
}

export function buildIcs({ days, destination = "", now = new Date() }) {
  const dtstamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//SproutRoute//Trip Plan//EN", "CALSCALE:GREGORIAN"];
  for (const { day, dayIndex, item, itemIndex, start, end } of eventsOf(days)) {
    const description = item.description || item.note || "";
    const location = item.enriched?.address || destination;
    lines.push(
      "BEGIN:VEVENT",
      `UID:${day.date}-${dayIndex}-${itemIndex}@sproutroute.app`,
      `DTSTAMP:${dtstamp}`,
      `DTSTART:${stamp(day.date, start)}`,
      `DTEND:${stamp(day.date, end)}`,
      `SUMMARY:${escapeText(item.name || item.title || "Trip stop")}`,
      ...(description ? [`DESCRIPTION:${escapeText(description)}`] : []),
      ...(location ? [`LOCATION:${escapeText(location)}`] : []),
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.flatMap(fold).join("\r\n") + "\r\n";
}

export function icsFilename(destination) {
  const slug = String(destination || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
  return `sproutroute-${slug || "trip"}.ics`;
}

export function downloadIcs({ days, destination }) {
  const url = URL.createObjectURL(new Blob([buildIcs({ days, destination })], { type: "text/calendar;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = icsFilename(destination);
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
