// Turns the car seat response (POST /api/safety/car-seat-check) into what the
// card shows. Same rules and wording as the iOS app's SafetyPresentation.
// Nothing here writes guidance: every restraint and source comes from the server.

const SEAT_POSITIONS = {
  rear_seat_required_if_available: "Back seat required when the vehicle has one",
  rear_seat_required: "Back seat required",
  rear_seat_required_under_8: "Back seat required under age 8",
  rear_seat_required_under_9: "Back seat required under age 9",
  rear_seat_required_under_12: "Back seat required under age 12",
  rear_seat_preferred: "Back seat recommended",
  rear_seat_recommended: "Back seat recommended",
};

const PLACEHOLDER = "Not found in repo";
const clean = (value) => {
  const text = typeof value === "string" ? value.trim() : "";
  return text && text !== PLACEHOLDER ? text : "";
};
const same = (a, b) => String(a || "").toLowerCase() === b;
const isUnavailable = (guidance) => same(guidance?.status, "unavailable");
// The server marks a match made on age alone "Needs review".
const isAgeOnly = (status) => same(status, "needs review");

function humanize(code) {
  const spaced = String(code || "").replace(/_/g, " ").trim();
  return spaced ? spaced[0].toUpperCase() + spaced.slice(1) : "";
}

function seatPositionLabel(code) {
  const value = clean(code);
  if (!value || value === "not_found") return "";
  return SEAT_POSITIONS[value] || (/^[a-z0-9_]+$/.test(value) ? humanize(value) : value);
}

function displayDate(raw) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(clean(raw));
  if (!match) return "";
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

function webUrl(raw) {
  try {
    const url = new URL(clean(raw));
    return url.protocol === "https:" || url.protocol === "http:" ? url : null;
  } catch {
    return null;
  }
}

function rowsOf(guidance) {
  if (!Array.isArray(guidance?.results) || isUnavailable(guidance)) return [];
  return guidance.results.map((child, index) => {
    const age = Number(child?.ageYears);
    const heading = child?.ageYears != null && Number.isFinite(age) ? `Age ${age}` : `Child ${index + 1}`;
    const restraint = clean(child?.requiredRestraintLabel) || humanize(clean(child?.requiredRestraint));
    // An age-only match repeats the same "details are incomplete" rationale for every child; the note says it once.
    const rationale = isAgeOnly(child?.status ?? guidance.status) ? "" : clean(child?.rationale);
    return { heading, detail: [restraint, seatPositionLabel(child?.seatPosition), rationale].filter(Boolean).join(". ") };
  });
}

export function carSeatRowCount(guidance) {
  return rowsOf(guidance).length;
}

export function carSeatCard(guidance, destination = "") {
  if (!guidance || !Array.isArray(guidance.results)) return null;

  if (isUnavailable(guidance)) {
    const place = String(destination || "").trim() || "this destination";
    return {
      title: "Car seats",
      message: `SproutRoute doesn't have car seat rules for ${place} yet. Check the local rules and your rental or taxi company before you travel.`,
      rows: [],
      note: null,
      sourceLine: null,
      sourceUrl: null,
    };
  }

  const place = clean(guidance.jurisdictionName);
  const summary = place ? `A summary of ${place} car seat rules` : "A summary of local car seat rules";
  const url = webUrl(guidance.sourceUrl);
  const authority = clean(guidance.sourceAuthority) || (url ? url.hostname.replace(/^www\./, "") : "");
  const updated = displayDate(guidance.lastReviewed) || displayDate(guidance.lastUpdated);

  return {
    title: place ? `Car seats: ${place}` : "Car seats",
    message: clean(guidance.message) || null,
    rows: rowsOf(guidance),
    note: isAgeOnly(guidance.status)
      ? `${summary}, based on age. Weight and height can change which seat is required, so confirm with the official source before you travel.`
      : `${summary}. Confirm with the official source before you travel.`,
    sourceLine: authority ? `Source: ${authority}${updated ? `, rules updated ${updated}` : ""}` : null,
    sourceUrl: url ? url.href : null,
  };
}
