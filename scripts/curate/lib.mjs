// Shared schema and prompt for the curated family-attraction database.
export const MODEL = "claude-opus-5-5";

const str = { type: "string" };
const bool = { type: "boolean" };
const int = { type: "integer" };
const en = (...values) => ({ type: "string", enum: values });

const attraction = {
  type: "object",
  additionalProperties: false,
  properties: {
    canonical_name: { ...str, description: "Official name as shown on its own website or Google Maps, no marketing words" },
    short_summary: { ...str, description: "One plain sentence: what it is" },
    category: en("theme_park", "water_park", "zoo_aquarium", "museum", "science_center", "park_garden", "beach",
      "playground", "landmark", "nature_outdoors", "neighborhood_walk", "market_food", "show_entertainment",
      "boat_tour", "farm_animals", "sports_activity", "day_trip", "other"),
    age_bands: { type: "array", items: en("0-2", "3-5", "6-9", "10-12", "13-17") },
    indoor_outdoor: en("indoor", "outdoor", "mixed"),
    duration_bucket: en("under_1h", "1_2h", "half_day", "full_day"),
    pace_fit: en("relaxed", "moderate", "active"),
    crowd_level: en("low", "medium", "high"),
    budget_tier: en("free", "low", "medium", "high"),
    stroller_friendly: bool,
    rainy_day_fit: bool,
    pet_friendly: bool,
    booking_needed: bool,
    kid_appeal_score: { ...int, description: "1-5" },
    parent_appeal_score: { ...int, description: "1-5" },
    must_do: { ...bool, description: "True for the 8-10 things most families would regret skipping" },
    area: { ...str, description: "Neighborhood, district, park or resort it sits in" },
    km_from_center: { ...int, description: "Rough driving distance from the destination center" },
    official_url: { ...str, description: "Official website URL if you are confident, else empty string" },
    wikidata_id: { ...str, description: "Wikidata Q-id only if you are confident it is this exact place, else empty string" },
    why_recommended: { ...str, description: "Why families with kids like it, concrete, 1-2 sentences" },
    timing_tip: { ...str, description: "Best time of day/week/season, how to avoid queues or heat" },
    hours_pattern: { ...str, description: "Typical opening pattern in general terms (e.g. 'Daily, morning to early evening; closed Mondays'). Not exact times." },
    seasonal_note: { ...str, description: "Seasonal closures or events, else empty string" },
    confidence: { type: "number", description: "0-1: how sure you are this place exists, is open in 2026, and the facts above are right" },
  },
  required: ["canonical_name", "short_summary", "category", "age_bands", "indoor_outdoor", "duration_bucket", "pace_fit",
    "crowd_level", "budget_tier", "stroller_friendly", "rainy_day_fit", "pet_friendly", "booking_needed",
    "kid_appeal_score", "parent_appeal_score", "must_do", "area", "km_from_center", "official_url", "wikidata_id",
    "why_recommended", "timing_tip", "hours_pattern", "seasonal_note", "confidence"],
};

export const DESTINATION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    destination: str,
    country_code: str,
    destination_summary: { ...str, description: "Two sentences for a parent deciding whether to go" },
    best_months: { type: "array", items: int },
    family_base_areas: { type: "array", items: str, description: "Where families usually stay" },
    getting_around: str,
    typical_trip_days: int,
    attractions: { type: "array", items: attraction },
  },
  required: ["destination", "country_code", "destination_summary", "best_months", "family_base_areas", "getting_around",
    "typical_trip_days", "attractions"],
};

export const SYSTEM = `You build the reference database for SproutRoute, a trip planner for families with children (babies to teens).
For a destination, list the real places a family would actually consider, ranked from most to least important.
Rules:
- Only places that exist and operate as of 2026. If you think a place closed, was renamed, or you are unsure, leave it out or give a low confidence.
- Use the name a family would see on Google Maps or the place's own sign. One row per place; do not split a park into its lands unless they are separate tickets (e.g. Disney's four parks are separate rows).
- Mix the big-ticket sights with free and low-cost local favorites: playgrounds, beaches, markets, easy walks, rainy-day options.
- Include a few classic day trips within about 2 hours if families commonly do them; mark them category day_trip.
- Never invent URLs or Wikidata ids. Empty string is better than a guess.
- Write plainly. No marketing language.`;

export function userPrompt({ name, country, count }) {
  return `Destination: ${name} (${country}). List about ${count} places for families, most important first.`;
}

export function requestParams(dest) {
  return {
    model: MODEL,
    max_tokens: 32000,
    system: SYSTEM,
    output_config: { effort: "medium", format: { type: "json_schema", schema: DESTINATION_SCHEMA } },
    messages: [{ role: "user", content: userPrompt(dest) }],
  };
}

// Opus 5.5 batch price: 50% of $4 / $20 per MTok.
export const cost = (u, batch = true) => ((u.input_tokens * 4 + u.output_tokens * 20) / 1e6) * (batch ? 0.5 : 1);
