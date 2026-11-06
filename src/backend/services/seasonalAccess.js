/**
 * Seasonal access for places whose roads and lodges close for part of the year.
 *
 * Google's opening hours are weekly, so they can't say that a park road is closed to cars from November to
 * April or that a lodge shuts in October. Without this, every model planned a late-December Yellowstone trip as
 * if it were summer (see docs/benchmarks/2026-11-05-yellowstone-winter-case.md).
 *
 * Each entry is a small, hand-maintained table checked against the operator's own pages. Dates are month-day,
 * so an entry holds for every year; check them each autumn.
 */

const YELLOWSTONE = {
  key: "yellowstone",
  name: "Yellowstone National Park",
  match: /\byellowstone\b/i,
  sources: [
    "NPS news release, Nov 1 2026 winter road closures",
    "NPS Park Roads page (closed to regular vehicles early November to late April; oversnow mid-December to mid-March)",
    "Yellowstone National Park Lodges opening and closing dates",
  ],
  seasons: [
    {
      // Most roads close to regular vehicles on Nov 1. The NPS gives the spring reopening only as "late April".
      from: "11-01",
      to: "04-24",
      label: "winter",
      note: [
        "Most park roads are closed to private cars. The only road open to cars runs from the North Entrance at Gardiner past Mammoth Hot Springs, Tower Junction and Lamar Valley to Cooke City.",
        "Old Faithful, the geyser basins, Canyon, Hayden Valley, Lake and West Thumb are reached only on a guided snowcoach or snowmobile tour, from mid-December to mid-March, and not at all from November to mid-December or from mid-March to late April.",
        "Lamar Valley is the park's main winter wildlife area and can be driven.",
        "Open lodging: Mammoth Hot Springs Hotel until early March, and Old Faithful Snow Lodge (reached by snowcoach) from mid-December to early March. From early March to late April no lodge in the park is open. Old Faithful Inn, Old Faithful Lodge, Canyon Lodge, Lake Lodge, Lake Yellowstone Hotel, Grant Village and Roosevelt Lodge are closed all season.",
        "Daylight is short, so plan 2 to 4 stops a day and finish outdoor stops before sunset.",
      ],
      openCorridor: ["mammoth", "lamar", "tower junction", "roosevelt arch", "gardiner", "cooke city", "silver gate", "yellowstone hot springs", "boiling river"],
      interior: [
        "old faithful", "grand prismatic", "midway geyser", "morning glory", "black sand basin", "biscuit basin", "upper geyser",
        "lower geyser", "fairy falls", "excelsior", "fountain paint pot", "firehole", "canyon", "lower falls", "upper falls",
        "artist point", "lookout point", "inspiration point", "mud volcano", "hayden valley", "west thumb", "grant village",
        "lewis falls", "kepler", "gibbon falls", "norris", "lake lodge", "lake yellowstone", "fishing bridge", "tower fall",
        "thumb geyser", "dunraven",
      ],
      // A stop or meal here is never right in this season, whatever the plan says about access.
      closedProperties: ["old faithful inn", "old faithful lodge", "canyon lodge", "lake lodge", "lake yellowstone hotel", "grant village", "roosevelt lodge"],
      access: /snow ?coach|snowmobile|over-?snow/i,
    },
  ],
};

const DESTINATIONS = [YELLOWSTONE];

const toMonthDay = (date) => date.slice(5, 10);

function inSeason(monthDay, { from, to }) {
  return from <= to ? monthDay >= from && monthDay <= to : monthDay >= from || monthDay <= to;
}

function tripDates(startDate, endDate) {
  const dates = [];
  const start = new Date(`${startDate}T12:00:00Z`);
  const end = new Date(`${endDate || startDate}T12:00:00Z`);
  for (let d = start; d <= end && dates.length < 60; d = new Date(d.getTime() + 86400000)) {
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

const nameOf = (item) => String(item?.canonical_name || item?.canonicalName || item?.name || "").toLowerCase();
const mentions = (text, terms) => terms.some((term) => text.includes(term));

/**
 * The seasonal rules that apply to a trip, or null. Only seasons that overlap the trip's dates are returned, with
 * the dates each one covers.
 */
export function seasonalAccessFor(destination, startDate, endDate) {
  const place = DESTINATIONS.find((d) => d.match.test(String(destination || "")));
  if (!place || !startDate) return null;
  const dates = tripDates(startDate, endDate);
  const seasons = place.seasons
    .map((season) => ({ ...season, dates: dates.filter((date) => inSeason(toMonthDay(date), season)) }))
    .filter((season) => season.dates.length);
  return seasons.length ? { key: place.key, name: place.name, seasons } : null;
}

/** Prompt text for the itinerary step. Empty when no season applies. */
export function buildSeasonalAccessNote(access) {
  if (!access) return "";
  return access.seasons.map((season) => `
**SEASONAL ACCESS — ${access.name}, ${season.label} (applies to ${season.dates[0]} to ${season.dates.at(-1)}):**
${season.note.map((line) => `- ${line}`).join("\n")}
- These seasonal rules override the shortlist and its weekly hours. Do not plan a drive to a place that is closed to cars; say how the family gets there (a booked snowcoach or snowmobile tour) or leave it out.
- Never plan a meal or a stay at a lodge that is closed in this season.`).join("\n");
}

/** Drops shortlisted places that are closed for every day of the trip. */
export function filterSeasonalShortlist(attractions, access) {
  if (!access || !Array.isArray(attractions)) return attractions;
  const closed = access.seasons.flatMap((season) => season.closedProperties);
  return attractions.filter((attraction) => !mentions(nameOf(attraction), closed));
}

/**
 * The winter-closure check: every way a plan breaks the seasonal rules, one string each. An empty list passes.
 * Day n of the plan is taken to fall on startDate + n - 1, because day labels are model-written.
 */
export function checkSeasonalAccess(tripPlan, { destination, startDate, endDate } = {}) {
  const access = seasonalAccessFor(destination, startDate, endDate);
  if (!access) return [];
  const names = new Map((tripPlan?.suggestedActivities || []).map((a) => [String(a.id), a.name]));
  const dates = tripDates(startDate, endDate);
  const failures = [];
  (tripPlan?.dailyItinerary || []).forEach((day, index) => {
    const date = dates[index];
    const season = date && access.seasons.find((s) => s.dates.includes(date));
    if (!season) return;
    const dayText = JSON.stringify(day);
    const meals = Object.values(day?.meals || {}).map((meal) => String(meal?.name || meal || ""));
    for (const meal of meals) {
      if (mentions(meal.toLowerCase(), season.closedProperties)) failures.push(`${date}: meal at a lodge closed in ${season.label}: ${meal}`);
    }
    for (const id of day?.activities || []) {
      const name = names.get(String(id)) || String(id);
      const lower = name.toLowerCase();
      const activity = (tripPlan.suggestedActivities || []).find((a) => String(a.id) === String(id));
      if (mentions(lower, season.closedProperties)) {
        failures.push(`${date}: stop at a lodge closed in ${season.label}: ${name}`);
      } else if (mentions(lower, season.interior) && !mentions(lower, season.openCorridor)
        && !season.access.test(dayText) && !season.access.test(JSON.stringify(activity || {}))) {
        failures.push(`${date}: ${name} is closed to cars in ${season.label} and the plan gives no snowcoach or snowmobile access`);
      }
    }
  });
  return failures;
}
