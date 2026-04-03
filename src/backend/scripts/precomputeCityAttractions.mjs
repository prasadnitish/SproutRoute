#!/usr/bin/env node
/**
 * precomputeCityAttractions.mjs — Offline precompute for Wave 1 cities
 *
 * Uses a rich LLM (Sonnet 4.6) to discover 20-30 family-relevant attractions
 * per city, tag them by age suitability, and store in city_attractions.
 *
 * Usage:
 *   node src/backend/scripts/precomputeCityAttractions.mjs --wave 1
 *   node src/backend/scripts/precomputeCityAttractions.mjs --city "San Diego"
 *   node src/backend/scripts/precomputeCityAttractions.mjs --wave 1 --dry-run
 *
 * Requires: SUPABASE_URL, SUPABASE_SERVICE_KEY, ANTHROPIC_API_KEY (or GOOGLE_GEMINI_API_KEY)
 */

import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";

// ── Config ──────────────────────────────────────────────────────────────────

const WAVE_1_CITIES = [
  { name: "San Diego", country: "US", region: "CA", lat: 32.7157, lon: -117.1611 },
  { name: "Los Angeles", country: "US", region: "CA", lat: 34.0522, lon: -118.2437 },
  { name: "Anaheim", country: "US", region: "CA", lat: 33.8366, lon: -117.9143 },
  { name: "San Francisco", country: "US", region: "CA", lat: 37.7749, lon: -122.4194 },
  { name: "Seattle", country: "US", region: "WA", lat: 47.6062, lon: -122.3321 },
  { name: "Orlando", country: "US", region: "FL", lat: 28.5383, lon: -81.3792 },
  { name: "New York City", country: "US", region: "NY", lat: 40.7128, lon: -74.0060 },
  { name: "Washington DC", country: "US", region: "DC", lat: 38.9072, lon: -77.0369 },
  { name: "Miami", country: "US", region: "FL", lat: 25.7617, lon: -80.1918 },
  { name: "Chicago", country: "US", region: "IL", lat: 41.8781, lon: -87.6298 },
  { name: "London", country: "GB", region: "ENG", lat: 51.5074, lon: -0.1278 },
  { name: "Tokyo", country: "JP", region: "TK", lat: 35.6762, lon: 139.6503 },
  { name: "Dubai", country: "AE", region: "DU", lat: 25.2048, lon: 55.2708 },
  { name: "Singapore", country: "SG", region: "SG", lat: 1.3521, lon: 103.8198 },
  { name: "Bali", country: "ID", region: "BA", lat: -8.3405, lon: 115.0920 },
];

const WAVE_2_CITIES = [
  { name: "Santa Barbara", country: "US", region: "CA", lat: 34.4208, lon: -119.6982 },
  { name: "Monterey", country: "US", region: "CA", lat: 36.6002, lon: -121.8947 },
  { name: "Lake Tahoe", country: "US", region: "CA", lat: 39.0968, lon: -120.0324 },
  { name: "Portland", country: "US", region: "OR", lat: 45.5152, lon: -122.6784 },
  { name: "Honolulu", country: "US", region: "HI", lat: 21.3069, lon: -157.8583 },
  { name: "Boston", country: "US", region: "MA", lat: 42.3601, lon: -71.0589 },
  { name: "Philadelphia", country: "US", region: "PA", lat: 39.9526, lon: -75.1652 },
  { name: "Atlanta", country: "US", region: "GA", lat: 33.7490, lon: -84.3880 },
  { name: "Charleston", country: "US", region: "SC", lat: 32.7765, lon: -79.9311 },
  { name: "Paris", country: "FR", region: "IDF", lat: 48.8566, lon: 2.3522 },
  { name: "Rome", country: "IT", region: "RM", lat: 41.9028, lon: 12.4964 },
  { name: "Vancouver", country: "CA", region: "BC", lat: 49.2827, lon: -123.1207 },
  { name: "Toronto", country: "CA", region: "ON", lat: 43.6532, lon: -79.3832 },
  { name: "Cancun", country: "MX", region: "QR", lat: 21.1619, lon: -86.8515 },
  { name: "Goa", country: "IN", region: "GA", lat: 15.2993, lon: 74.1240 },
  { name: "Jaipur", country: "IN", region: "RJ", lat: 26.9124, lon: 75.7873 },
  { name: "Udaipur", country: "IN", region: "RJ", lat: 24.5854, lon: 73.7125 },
  { name: "Kochi", country: "IN", region: "KL", lat: 9.9312, lon: 76.2673 },
  { name: "Mysuru", country: "IN", region: "KA", lat: 12.2958, lon: 76.6394 },
  { name: "Ooty", country: "IN", region: "TN", lat: 11.4102, lon: 76.6950 },
  { name: "Kyoto", country: "JP", region: "KY", lat: 35.0116, lon: 135.7681 },
  { name: "Osaka", country: "JP", region: "OS", lat: 34.6937, lon: 135.5023 },
  { name: "Maui", country: "US", region: "HI", lat: 20.7984, lon: -156.3319 },
  { name: "Kauai", country: "US", region: "HI", lat: 22.0964, lon: -159.5261 },
  { name: "Big Island Hawaii", country: "US", region: "HI", lat: 19.8968, lon: -155.5828 },
  { name: "Barcelona", country: "ES", region: "CT", lat: 41.3874, lon: 2.1686 },
  { name: "Mexico City", country: "MX", region: "DF", lat: 19.4326, lon: -99.1332 },
];

// Wave 3: Top 100 North American tourist destinations (cities we don't already cover)
const WAVE_3_CITIES = [
  // Major US cities
  { name: "Nashville", country: "US", region: "TN", lat: 36.1627, lon: -86.7816 },
  { name: "New Orleans", country: "US", region: "LA", lat: 29.9511, lon: -90.0715 },
  { name: "Denver", country: "US", region: "CO", lat: 39.7392, lon: -104.9903 },
  { name: "Austin", country: "US", region: "TX", lat: 30.2672, lon: -97.7431 },
  { name: "San Antonio", country: "US", region: "TX", lat: 29.4241, lon: -98.4936 },
  { name: "Houston", country: "US", region: "TX", lat: 29.7604, lon: -95.3698 },
  { name: "Dallas", country: "US", region: "TX", lat: 32.7767, lon: -96.7970 },
  { name: "Phoenix", country: "US", region: "AZ", lat: 33.4484, lon: -112.0740 },
  { name: "Scottsdale", country: "US", region: "AZ", lat: 33.4942, lon: -111.9261 },
  { name: "Sedona", country: "US", region: "AZ", lat: 34.8697, lon: -111.7610 },
  { name: "Minneapolis", country: "US", region: "MN", lat: 44.9778, lon: -93.2650 },
  { name: "St. Louis", country: "US", region: "MO", lat: 38.6270, lon: -90.1994 },
  { name: "Kansas City", country: "US", region: "MO", lat: 39.0997, lon: -94.5786 },
  { name: "Cleveland", country: "US", region: "OH", lat: 41.4993, lon: -81.6944 },
  { name: "Pittsburgh", country: "US", region: "PA", lat: 40.4406, lon: -79.9959 },
  { name: "Baltimore", country: "US", region: "MD", lat: 39.2904, lon: -76.6122 },
  { name: "Detroit", country: "US", region: "MI", lat: 42.3314, lon: -83.0458 },
  { name: "Milwaukee", country: "US", region: "WI", lat: 43.0389, lon: -87.9065 },
  { name: "Indianapolis", country: "US", region: "IN", lat: 39.7684, lon: -86.1581 },
  { name: "Salt Lake City", country: "US", region: "UT", lat: 40.7608, lon: -111.8910 },
  // Beach & resort destinations
  { name: "Myrtle Beach", country: "US", region: "SC", lat: 33.6891, lon: -78.8867 },
  { name: "Virginia Beach", country: "US", region: "VA", lat: 36.8529, lon: -75.9780 },
  { name: "Savannah", country: "US", region: "GA", lat: 32.0809, lon: -81.0912 },
  { name: "Key West", country: "US", region: "FL", lat: 24.5551, lon: -81.7800 },
  { name: "Palm Beach", country: "US", region: "FL", lat: 26.7056, lon: -80.0364 },
  { name: "Destin", country: "US", region: "FL", lat: 30.3935, lon: -86.4958 },
  { name: "Gulf Shores", country: "US", region: "AL", lat: 30.2460, lon: -87.7008 },
  { name: "Outer Banks", country: "US", region: "NC", lat: 35.5585, lon: -75.4665 },
  { name: "Hilton Head Island", country: "US", region: "SC", lat: 32.2163, lon: -80.7526 },
  { name: "Cape May", country: "US", region: "NJ", lat: 38.9351, lon: -74.9060 },
  // National park gateway cities
  { name: "Jackson Hole", country: "US", region: "WY", lat: 43.4799, lon: -110.7624 },
  { name: "Moab", country: "US", region: "UT", lat: 38.5733, lon: -109.5498 },
  { name: "Gatlinburg", country: "US", region: "TN", lat: 35.7143, lon: -83.5102 },
  { name: "Bar Harbor", country: "US", region: "ME", lat: 44.3876, lon: -68.2039 },
  { name: "Estes Park", country: "US", region: "CO", lat: 40.3772, lon: -105.5217 },
  { name: "Yellowstone", country: "US", region: "WY", lat: 44.4280, lon: -110.5885 },
  { name: "Grand Canyon Village", country: "US", region: "AZ", lat: 36.0544, lon: -112.1401 },
  // Historic & cultural
  { name: "Williamsburg", country: "US", region: "VA", lat: 37.2707, lon: -76.7075 },
  { name: "St. Augustine", country: "US", region: "FL", lat: 29.9012, lon: -81.3124 },
  { name: "Napa Valley", country: "US", region: "CA", lat: 38.2975, lon: -122.2869 },
  { name: "Santa Fe", country: "US", region: "NM", lat: 35.6870, lon: -105.9378 },
  { name: "Asheville", country: "US", region: "NC", lat: 35.5951, lon: -82.5515 },
  // West Coast
  { name: "San Jose", country: "US", region: "CA", lat: 37.3382, lon: -121.8863 },
  { name: "Sacramento", country: "US", region: "CA", lat: 38.5816, lon: -121.4944 },
  { name: "Palm Springs", country: "US", region: "CA", lat: 33.8303, lon: -116.5453 },
  { name: "Carmel-by-the-Sea", country: "US", region: "CA", lat: 36.5554, lon: -121.9233 },
  // Pacific Northwest
  { name: "Bend", country: "US", region: "OR", lat: 44.0582, lon: -121.3153 },
  { name: "Cannon Beach", country: "US", region: "OR", lat: 45.8918, lon: -123.9615 },
  // Alaska
  { name: "Anchorage", country: "US", region: "AK", lat: 61.2181, lon: -149.9003 },
  { name: "Juneau", country: "US", region: "AK", lat: 58.3005, lon: -134.4197 },
  // Canada
  { name: "Montreal", country: "CA", region: "QC", lat: 45.5017, lon: -73.5673 },
  { name: "Quebec City", country: "CA", region: "QC", lat: 46.8139, lon: -71.2080 },
  { name: "Calgary", country: "CA", region: "AB", lat: 51.0447, lon: -114.0719 },
  { name: "Ottawa", country: "CA", region: "ON", lat: 45.4215, lon: -75.6972 },
  { name: "Victoria", country: "CA", region: "BC", lat: 48.4284, lon: -123.3656 },
  { name: "Banff", country: "CA", region: "AB", lat: 51.1784, lon: -115.5708 },
  { name: "Whistler", country: "CA", region: "BC", lat: 50.1163, lon: -122.9574 },
  { name: "Niagara Falls", country: "CA", region: "ON", lat: 43.0896, lon: -79.0849 },
  // Mexico
  { name: "Playa del Carmen", country: "MX", region: "QR", lat: 20.6296, lon: -87.0739 },
  { name: "Puerto Vallarta", country: "MX", region: "JA", lat: 20.6534, lon: -105.2253 },
  { name: "Cabo San Lucas", country: "MX", region: "BS", lat: 22.8905, lon: -109.9167 },
  { name: "Tulum", country: "MX", region: "QR", lat: 20.2115, lon: -87.4654 },
];

const PRECOMPUTE_PROMPT = (cityName, countryCode) => ({
  system: `You are a family travel expert. Generate a comprehensive list of family-friendly attractions for a specific city. Return ONLY valid JSON.

For each attraction, provide detailed structured data that helps a trip planner rank and filter attractions for different family types.

Return JSON with this exact structure:
{
  "attractions": [
    {
      "name": "Exact real name of the attraction",
      "category": "one of: beach, hiking, city, museums, parks, dining, shopping, sports, water, wildlife, theme_park, camping, cultural, nature, entertainment",
      "shortSummary": "1-2 sentence description",
      "ageBands": [
        {"label": "infant", "minAge": 0, "maxAge": 1, "suitability": "great|good|okay|poor"},
        {"label": "toddler", "minAge": 2, "maxAge": 3, "suitability": "great|good|okay|poor"},
        {"label": "preschool", "minAge": 4, "maxAge": 5, "suitability": "great|good|okay|poor"},
        {"label": "school_age", "minAge": 6, "maxAge": 12, "suitability": "great|good|okay|poor"},
        {"label": "teen", "minAge": 13, "maxAge": 17, "suitability": "great|good|okay|poor"}
      ],
      "indoorOutdoor": "indoor|outdoor|both",
      "durationBucket": "under_1h|1_2h|2_4h|half_day|full_day",
      "paceFit": "slow|moderate|fast|any",
      "crowdLevel": "low|moderate|high|varies",
      "budgetTier": "free|budget|moderate|premium",
      "strollerFriendly": true|false,
      "rainyDayFit": true|false,
      "parentAppealScore": 1-10,
      "kidAppealScore": 1-10,
      "petFriendly": true|false,
      "bookingNeeded": true|false,
      "whyFamilyFriendly": "Brief reason why families love this",
      "timingTip": "Best time to visit or booking advice"
    }
  ]
}

Requirements:
- Include 20-25 real, currently operating attractions
- Mix of free and paid options
- Mix of indoor and outdoor
- Include at least 3 options great for toddlers
- Include at least 3 options great for teens
- Include parks, museums, beaches/nature, and entertainment
- Only include REAL places that currently exist and are open
- Be specific to ${cityName} and surrounding area — no generic suggestions
- IMPORTANT: Include attractions within a 35-mile / 55km radius of the city center. Families visiting a city will drive to nearby attractions. For example: San Diego should include Legoland (Carlsbad), Orlando should include Kennedy Space Center, LA should include Santa Monica Pier, etc.
- For each attraction, note if it's in a nearby town (e.g., "Legoland California (Carlsbad, 30 min from downtown)")`,

  user: `Generate a comprehensive family attraction list for ${cityName}${countryCode !== "US" ? ` (${countryCode})` : ""}. Include attractions within a 35-mile radius of the city, not just within city limits.`,
});

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const waveArg = args.indexOf("--wave");
  const cityArg = args.indexOf("--city");
  const dryRun = args.includes("--dry-run");
  const wave = waveArg >= 0 ? parseInt(args[waveArg + 1]) : null;
  const singleCity = cityArg >= 0 ? args[cityArg + 1] : null;

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  let cities;
  if (singleCity) {
    const allCities = [...WAVE_1_CITIES, ...WAVE_2_CITIES, ...WAVE_3_CITIES];
    cities = allCities.filter(c => c.name.toLowerCase().includes(singleCity.toLowerCase()));
    if (cities.length === 0) { console.error(`City "${singleCity}" not found in seed list`); process.exit(1); }
  } else if (wave === 1) {
    cities = WAVE_1_CITIES;
  } else if (wave === 2) {
    cities = WAVE_2_CITIES;
  } else if (wave === 3) {
    cities = WAVE_3_CITIES;
  } else {
    console.log("Usage: --wave 1|2|3 or --city 'City Name' [--dry-run]");
    process.exit(0);
  }

  console.log(`\nPrecomputing ${cities.length} cities${dryRun ? " (DRY RUN)" : ""}...\n`);

  for (const city of cities) {
    console.log(`\n=== ${city.name} (${city.country}) ===`);

    // Ensure city record exists
    let { data: existing } = await supabase
      .from("cities")
      .select("id")
      .eq("country_code", city.country)
      .ilike("city_name", city.name)
      .limit(1);

    let cityId;
    if (existing?.length) {
      cityId = existing[0].id;
      console.log(`  City exists: ${cityId}`);
    } else {
      const { data: inserted, error } = await supabase
        .from("cities")
        .insert({
          country_code: city.country,
          region_code: city.region,
          city_name: city.name,
          display_name: `${city.name}, ${city.region}`,
          lat: city.lat,
          lon: city.lon,
          priority_tier: wave === 1 ? "tier1" : "tier2",
        })
        .select("id");

      if (error) { console.error(`  Failed to create city: ${error.message}`); continue; }
      cityId = inserted[0].id;
      console.log(`  Created city: ${cityId}`);
    }

    // Check existing attraction count
    const { count } = await supabase
      .from("city_attractions")
      .select("id", { count: "exact", head: true })
      .eq("city_id", cityId);

    if (count >= 15) {
      console.log(`  Already has ${count} attractions — skipping precompute`);
      continue;
    }

    if (dryRun) {
      console.log(`  Would generate attractions (dry run)`);
      continue;
    }

    // Generate attractions via LLM
    console.log(`  Generating attractions via Claude Sonnet 4.6...`);
    const prompt = PRECOMPUTE_PROMPT(city.name, city.country);
    const t0 = Date.now();

    try {
      const message = await anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 48000,
        temperature: 0,
        system: prompt.system,
        messages: [{ role: "user", content: prompt.user }],
      });

      const text = message.content.map(b => b.text).join("");
      const ms = Date.now() - t0;
      console.log(`  LLM response: ${text.length} chars in ${(ms/1000).toFixed(1)}s`);

      // Parse JSON — strip markdown fences first, then parse
      let cleanText = text.trim();
      // Strip markdown fences if present
      if (cleanText.startsWith("```")) {
        cleanText = cleanText.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "").trim();
      }

      let parsed;
      try {
        parsed = JSON.parse(cleanText);
      } catch (e1) {
        // Strategy 2: find the outermost { ... } block
        const braceStart = cleanText.indexOf("{");
        const braceEnd = cleanText.lastIndexOf("}");
        if (braceStart >= 0 && braceEnd > braceStart) {
          try { parsed = JSON.parse(cleanText.slice(braceStart, braceEnd + 1)); } catch {}
        }
        // Strategy 3: find the outermost [ ... ] block
        if (!parsed) {
          const bracketStart = cleanText.indexOf("[");
          const bracketEnd = cleanText.lastIndexOf("]");
          if (bracketStart >= 0 && bracketEnd > bracketStart) {
            try { const arr = JSON.parse(cleanText.slice(bracketStart, bracketEnd + 1)); parsed = { attractions: arr }; } catch {}
          }
        }
        // Strategy 4: truncated JSON — find last complete object and close array
        if (!parsed) {
          const lastComplete = cleanText.lastIndexOf("},");
          if (lastComplete > 0) {
            const truncated = cleanText.slice(braceStart, lastComplete + 1) + "]}";
            try { parsed = JSON.parse(truncated); } catch {}
          }
        }
        if (!parsed) {
          console.error(`  Parse failed (${e1.message}). First 300 chars: ${cleanText.slice(0, 300)}`);
          throw new Error("Failed to parse JSON from LLM response");
        }
      }

      const attractions = parsed.attractions || parsed;
      if (!Array.isArray(attractions)) {
        console.error(`  Invalid response structure`);
        continue;
      }

      console.log(`  Parsed ${attractions.length} attractions`);

      // Insert attractions
      let inserted = 0;
      for (const attr of attractions) {
        const { error } = await supabase
          .from("city_attractions")
          .upsert({
            city_id: cityId,
            canonical_name: attr.name,
            short_summary: attr.shortSummary || "",
            category: attr.category || "general",
            subcategories_json: [],
            age_bands_json: attr.ageBands || [],
            indoor_outdoor: attr.indoorOutdoor || "both",
            duration_bucket: attr.durationBucket || "1_2h",
            pace_fit: attr.paceFit || "any",
            crowd_level: attr.crowdLevel || "moderate",
            budget_tier: attr.budgetTier || "moderate",
            stroller_friendly: attr.strollerFriendly ?? false,
            rainy_day_fit: attr.rainyDayFit ?? false,
            parent_appeal_score: attr.parentAppealScore || 5,
            kid_appeal_score: attr.kidAppealScore || 5,
            pet_friendly: attr.petFriendly ?? false,
            booking_needed: attr.bookingNeeded ?? false,
            confidence_score: 0.85,
            llm_notes: attr.whyFamilyFriendly || "",
            verification_status: "unverified",
            source_type: "precomputed",
            why_recommended: attr.whyFamilyFriendly || "",
            timing_tip: attr.timingTip || "",
          }, { onConflict: "city_id,canonical_name", ignoreDuplicates: true });

        if (!error) inserted++;
      }

      console.log(`  Inserted ${inserted} attractions`);

      // Record precompute run
      await supabase.from("attraction_precompute_runs").insert({
        city_id: cityId,
        model_provider: "anthropic",
        model_name: "claude-sonnet-4-6",
        prompt_version: "precompute-v1",
        run_status: "completed",
        input_snapshot_json: { cityName: city.name, countryCode: city.country },
        output_snapshot_json: { attractionCount: attractions.length, insertedCount: inserted },
        completed_at: new Date().toISOString(),
      });

    } catch (err) {
      console.error(`  Error: ${err.message}`);

      await supabase.from("attraction_precompute_runs").insert({
        city_id: cityId,
        model_provider: "anthropic",
        model_name: "claude-sonnet-4-6",
        prompt_version: "precompute-v1",
        run_status: "failed",
        input_snapshot_json: { cityName: city.name, countryCode: city.country },
        output_snapshot_json: { error: err.message },
        completed_at: new Date().toISOString(),
      });
    }

    // Rate limit: wait 2s between cities to avoid API throttling
    await new Promise(r => setTimeout(r, 2000));
  }

  console.log("\n=== Done ===\n");
}

main().catch(err => { console.error("Fatal:", err); process.exit(1); });
