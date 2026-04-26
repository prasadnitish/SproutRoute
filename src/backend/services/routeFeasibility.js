export function scoreRouteFeasibility({
  totalDays = 1,
  stopCount = 1,
  longTransferCount = 0,
  flightLegCount = 0,
  hasChildren = false,
  anchorCount = 0,
} = {}) {
  let score = 100;
  const reasons = [];

  const daysPerStop = totalDays / Math.max(1, stopCount);
  if (daysPerStop < 2) {
    score -= 25;
    reasons.push("Less than two days per overnight base.");
  }
  if (longTransferCount > 0) {
    score -= longTransferCount * 16;
    reasons.push("Long transfers reduce usable sightseeing time.");
  }
  if (flightLegCount > 0) {
    score -= flightLegCount * 10;
    reasons.push("Flights add airport, security, and check-in friction.");
  }
  if (hasChildren && stopCount > Math.ceil(totalDays / 3)) {
    score -= 25;
    reasons.push("Too many base changes for a trip with children.");
  }
  if (hasChildren && daysPerStop < 2.5) {
    score -= 10;
    reasons.push("Family trips need slower pacing and recovery time.");
  }
  if (anchorCount > 0 && daysPerStop < 2.5) {
    score -= 8;
    reasons.push("Full-day anchors need buffer days around them.");
  }

  const bounded = Math.max(0, Math.min(100, Math.round(score)));
  const label = bounded >= 82 ? "easy" : bounded >= 60 ? "balanced" : bounded >= 35 ? "packed" : "unrealistic";
  return { score: bounded, label, reasons };
}
