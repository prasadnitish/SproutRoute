// The ages question, asked when the server had to guess the children's ages
// (parse returns childrenAgesAssumed: true). Mirrors the iOS app's ChildAgesModel.

export const MAX_CHILDREN = 8;
export const AGE_OPTIONS = Array.from({ length: 18 }, (_, age) => age);

export function needsAgeConfirmation(parsed) {
  return parsed?.childrenAgesAssumed === true;
}

// One unset row per guessed child. The guessed age is never pre-selected.
export function initialAgeRows(parsed) {
  const guessed = Array.isArray(parsed?.childrenAges) ? parsed.childrenAges.length : 0;
  return Array(Math.min(Math.max(guessed, 1), MAX_CHILDREN)).fill(null);
}

export function agesComplete(rows) {
  return rows.length > 0 && rows.every((age) => Number.isInteger(age));
}

export function ageLabel(age) {
  if (age === 0) return "Under 1";
  return age === 1 ? "1 year" : `${age} years`;
}

export function withConfirmedAges(parsed, ages) {
  return { ...parsed, childrenAges: [...ages], childrenAgesAssumed: false, carSeatSuppressed: false };
}

// Planning goes ahead with the guess, but car seat guidance is left out.
export function withSkippedAges(parsed) {
  return { ...parsed, carSeatSuppressed: true };
}

export function shouldFetchCarSeat(parsed) {
  return (parsed?.childrenAges || []).length > 0 && !parsed?.carSeatSuppressed;
}

// A guessed age is not shown back to the traveler as if they had said it.
export function showsChildAges(parsed) {
  return (parsed?.childrenAges || []).length > 0 && !parsed?.childrenAgesAssumed;
}
