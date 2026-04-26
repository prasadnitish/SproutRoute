const THEME_PARK_RE = /\b(disneyland|disneysea|disney world|universal studios|universal orlando|legoland|six flags|theme park|amusement park)\b/i;

function minTime(left, right) {
  return left <= right ? left : right;
}

function matchesRule(rule, activity) {
  const name = String(activity?.name || activity?.title || "");
  const category = String(activity?.category || "").replace(/\s+/g, "_");
  return Boolean(rule.name?.test(name) || rule.category?.test(category));
}

const ACTIVITY_RULES = [
  {
    name: THEME_PARK_RE,
    category: /^theme_parks?$/,
    durationMinutes: 480,
    durationClass: "full_day",
    earliestStart: "09:00",
    latestEnd: "18:00",
    anchor: true,
    reservationRecommended: true,
  },
  {
    category: /museum|gallery/,
    durationMinutes: 150,
    durationClass: "timed",
    earliestStart: "10:00",
    latestEnd: "17:00",
    anchor: false,
    reservationRecommended: false,
  },
  {
    category: /zoo|aquarium|wildlife/,
    durationMinutes: 210,
    durationClass: "half_day",
    earliestStart: "09:30",
    latestEnd: "17:00",
    anchor: false,
    reservationRecommended: false,
  },
  {
    category: /day_trip|excursion/,
    durationMinutes: 420,
    durationClass: "full_day",
    earliestStart: "08:30",
    latestEnd: "18:00",
    anchor: true,
    reservationRecommended: false,
  },
  {
    category: /beach/,
    durationMinutes: 240,
    durationClass: "half_day",
    earliestStart: "09:00",
    latestEnd: "17:00",
    anchor: false,
    reservationRecommended: false,
  },
  {
    category: /dining|restaurant/,
    durationMinutes: 90,
    durationClass: "timed",
    earliestStart: "11:30",
    latestEnd: "21:00",
    anchor: false,
    reservationRecommended: true,
  },
];

export function classifyActivityConstraint(activity = {}, context = {}) {
  const rule = ACTIVITY_RULES.find((candidate) => matchesRule(candidate, activity)) || {
    durationMinutes: null,
    durationClass: "timed",
    earliestStart: "09:30",
    latestEnd: context.hasChildren ? "18:00" : "20:00",
    anchor: false,
    reservationRecommended: false,
  };
  const warnings = [];

  if (rule.reservationRecommended) {
    warnings.push({
      code: "reservation_recommended",
      severity: "info",
      message: `${activity.name || "This activity"} may need advance booking or timed entry.`,
    });
  }

  return {
    durationMinutes: rule.durationMinutes,
    durationClass: rule.durationClass,
    timeWindow: {
      earliestStart: rule.earliestStart,
      latestEnd: context.hasChildren ? minTime(rule.latestEnd, "18:00") : rule.latestEnd,
    },
    anchor: rule.anchor,
    warnings,
  };
}

export function isFullDayAnchorActivity(activity = {}) {
  return classifyActivityConstraint(activity).durationClass === "full_day";
}
