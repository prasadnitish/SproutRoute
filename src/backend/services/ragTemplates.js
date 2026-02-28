/**
 * ragTemplates.js — Static packing and activity base templates (RAG-style)
 *
 * These lightweight lookup tables are injected into AI prompts as "base context",
 * letting the model focus on refinement rather than generation from scratch.
 * This reduces output tokens by ~30-40% and improves consistency.
 *
 * Templates are keyed by:
 *   - climateZone: "tropical" | "temperate" | "cold" | "desert"
 *   - tripType:    "beach" | "city" | "adventure" | "cruise" | "international" | "general"
 */

// ── Climate detection ─────────────────────────────────────────────────────────

/**
 * Infer climate zone from weather forecast data.
 * Returns: "tropical" | "temperate" | "cold" | "desert"
 */
export function detectClimateZone(forecast) {
  if (!Array.isArray(forecast) || forecast.length === 0) return "temperate";

  const avgHigh = forecast.reduce((sum, d) => sum + (d.high || 70), 0) / forecast.length;
  const avgRain = forecast.reduce((sum, d) => sum + (d.precipitation || 0), 0) / forecast.length;
  const minLow = Math.min(...forecast.map((d) => d.low ?? 50));

  if (avgHigh >= 82 && avgRain >= 40) return "tropical";
  if (avgHigh >= 85 && avgRain < 20) return "desert";
  if (minLow <= 35) return "cold";
  return "temperate";
}

// ── Base packing templates ────────────────────────────────────────────────────
// Each template provides a concise item list that the AI expands and personalises.
// Format: { [climateZone]: { [tripType | "general"]: string } }

const PACKING_BASE = {
  tropical: {
    general: `- Lightweight breathable clothing (moisture-wicking)
- Swimwear (2-3 sets)
- Rashguard / UV-protective top
- Wide-brim hat
- Reef-safe sunscreen SPF 50+
- Insect repellent (DEET or picaridin)
- Waterproof sandals
- Light rain jacket (afternoon showers common)
- Electrolyte packets (stay hydrated)
- Aloe vera gel (after-sun care)`,
    beach: `- Beach towels (quick-dry)
- Snorkel set
- Beach tent or umbrella
- Sand toys
- Dry bag for electronics
- Waterproof phone case
- Reef-safe sunscreen SPF 50+`,
    city: `- Light linen or cotton clothing
- Comfortable walking shoes
- Compact umbrella
- Portable fan or cooling towel
- Crossbody bag (anti-theft)`,
    adventure: `- Hiking sandals or trail shoes
- Lightweight trekking trousers
- Quick-dry shirts
- Waterproof day pack
- Water purification tablets
- First-aid kit`,
    cruise: `- Formal dinner outfit (1-2 sets)
- Casual resort wear
- Swimwear for sea days
- Walking shoes for port excursions
- Lanyard / card holder`,
    international: `- Universal power adapter
- Photocopies of passport
- Local currency (small bills)
- Travel insurance documents`,
  },

  temperate: {
    general: `- Layering system (base, mid, outer)
- Light jacket or fleece
- Comfortable walking shoes
- Compact umbrella or rain jacket
- Versatile clothing (mix and match)
- Sunscreen SPF 30+`,
    beach: `- Wetsuit or thermal rashguard
- Beach towels
- Water shoes
- Sand toys
- Light windbreaker`,
    city: `- Smart-casual outfits
- Comfortable walking shoes
- Small day backpack
- Reusable water bottle
- Transit card / small wallet`,
    adventure: `- Hiking boots (waterproof)
- Rain jacket (packable)
- Trekking poles
- Wool or synthetic base layer
- First-aid kit
- Headlamp`,
    cruise: `- Layered clothing for deck
- Formal dinner attire
- Lanyard / key card holder
- Motion sickness bands
- Walking shoes for ports`,
    international: `- Universal power adapter
- Passport + copies
- Travel insurance card
- Basic phrase book or translation app`,
  },

  cold: {
    general: `- Thermal base layers (top and bottom)
- Insulated mid layer (fleece or down)
- Waterproof outer shell jacket
- Waterproof insulated boots
- Wool or thermal socks (multiple pairs)
- Gloves, hat, scarf
- Hand warmers
- Lip balm and moisturiser`,
    beach: `- Layered system for wind
- Wetsuit if water activities planned
- Waterproof shoes
- Thermal fleece`,
    city: `- Warm coat
- Waterproof boots
- Scarf and gloves
- Comfortable but warm walking shoes`,
    adventure: `- 4-season sleeping bag (if camping)
- Crampons / microspikes
- Ski/snowboard gear or rental info
- Emergency whistle and reflective gear
- High-calorie snacks`,
    cruise: `- Heavy jacket for deck
- Layered indoor clothing
- Formal attire for dining
- Motion sickness medication`,
    international: `- Power adapter
- Passport + copies
- Travel insurance documents`,
  },

  desert: {
    general: `- Loose light-coloured long-sleeve shirts (sun protection)
- Lightweight trousers (long)
- Wide-brim hat
- UV sunglasses
- High-SPF sunscreen (SPF 50+)
- Multiple reusable water bottles
- Electrolyte tablets
- Lip balm (SPF)
- Light windbreaker (for evening chill)`,
    beach: `- Reef-safe sunscreen
- Rashguard
- Swimwear
- Water shoes`,
    city: `- Breathable walking shoes (closed toe)
- Comfortable breathable clothing
- Sunglasses
- Small crossbody bag`,
    adventure: `- Trekking poles
- Gaiters (for sand)
- Desert-specific first-aid kit
- Emergency whistle
- Navigation tools (offline maps)`,
    cruise: `- Lightweight resort wear
- Formal dinner outfit
- Sunscreen (SPF 50+)`,
    international: `- Power adapter
- Passport + copies
- Local currency`,
  },
};

// ── Activity suggestion templates ─────────────────────────────────────────────
// Seeded activity ideas by trip type — AI uses these as a starting point.

const ACTIVITY_BASE = {
  beach: [
    "Swimming and snorkelling",
    "Beach volleyball",
    "Kayaking or paddleboarding",
    "Sandcastle building",
    "Sunset walk",
    "Local seafood dining",
  ],
  city: [
    "Historical landmarks tour",
    "Museum visits",
    "Local food market",
    "Architecture walk",
    "Public gardens or parks",
    "Cooking class",
  ],
  adventure: [
    "Hiking local trails",
    "Rock climbing",
    "Mountain biking",
    "Wildlife spotting tour",
    "Camping",
    "Whitewater rafting",
  ],
  cruise: [
    "Shore excursion — city highlights",
    "Snorkelling or scuba at port",
    "Sea day — poolside relaxation",
    "Onboard entertainment (shows)",
    "Specialty dining experience",
    "Port shopping / local crafts",
  ],
  international: [
    "Cultural heritage site tour",
    "Local cooking class",
    "Street food exploration",
    "Museum of national history",
    "Language / cultural workshop",
    "Day trip to nearby town",
  ],
  general: [
    "Local parks and playgrounds",
    "Family dining out",
    "Scenic drive or walk",
    "Shopping at local markets",
    "Cultural experiences",
  ],
};

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Returns a base packing item list as a formatted string.
 * Used to seed the AI packing prompt, reducing generation tokens.
 *
 * @param {string} climateZone - "tropical" | "temperate" | "cold" | "desert"
 * @param {string} tripType    - "beach" | "city" | "adventure" | "cruise" | "international" | null
 * @returns {string}
 */
export function getPackingBaseTemplate(climateZone, tripType) {
  const zone = PACKING_BASE[climateZone] || PACKING_BASE.temperate;
  const generalItems = zone.general || "";
  const typeItems = (tripType && zone[tripType]) ? zone[tripType] : "";

  const combined = [generalItems, typeItems].filter(Boolean).join("\n");
  return combined;
}

/**
 * Returns base activity suggestions for a trip type.
 *
 * @param {string} tripType - "beach" | "city" | "adventure" | "cruise" | "international" | null
 * @returns {string[]}
 */
export function getActivityBaseTemplate(tripType) {
  return ACTIVITY_BASE[tripType] || ACTIVITY_BASE.general;
}
