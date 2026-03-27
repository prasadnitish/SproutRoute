// --- International Pet Entry Requirements (Tier 1 Countries) ---
// ⚠️ All entries require human review against official government sources before production use.
// Data pattern follows carSeatRules.js.

// EU countries that share standardized pet entry rules (EU Pet Passport / EU regulation 576/2013)
const EU_MEMBER_CODES = new Set([
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR",
  "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL",
  "PL", "PT", "RO", "SK", "SI", "ES", "SE",
]);

const EU_BASELINE_RULES = {
  microchipRequired: true,
  rabiesVaccineRequired: true,
  rabiesWaitDays: 21,
  healthCertificate: "USDA-endorsed veterinary certificate within 10 days of travel, or EU pet passport for return trips",
  quarantine: false,
  quarantineDays: 0,
  bannedBreeds: [],
  additionalTests: [],
  importPermit: false,
  advanceNoticeDays: 21,
  notes: "EU regulation 576/2013 applies. EU pet passport accepted for pets traveling within EU. Non-EU pets need USDA-endorsed health certificate. Microchip must be ISO 11784/11785 compliant (15-digit).",
  source: "https://food.ec.europa.eu/animals/movement-pets_en",
};

/**
 * Static pet entry rules by country code.
 * US is intentionally excluded (domestic travel, no import rules).
 */
const PET_ENTRY_RULES = {
  // --- Canada ---
  CA: {
    countryCode: "CA",
    countryName: "Canada",
    microchipRequired: false,
    rabiesVaccineRequired: true,
    rabiesWaitDays: 0,
    healthCertificate: "Veterinary health certificate within 10 days of travel; must show current rabies vaccination",
    quarantine: false,
    quarantineDays: 0,
    bannedBreeds: [],
    additionalTests: [],
    importPermit: false,
    advanceNoticeDays: 10,
    notes: "Dogs must have valid rabies vaccination certificate. Puppies under 3 months may be exempt but require additional documentation. Commercial dogs have stricter requirements.",
    source: "https://inspection.canada.ca/importing-food-plants-or-animals/pets/eng/1326600389775/1326600500578",
  },

  // --- Mexico ---
  MX: {
    countryCode: "MX",
    countryName: "Mexico",
    microchipRequired: false,
    rabiesVaccineRequired: true,
    rabiesWaitDays: 0,
    healthCertificate: "Veterinary health certificate issued within 10 days of travel confirming good health and rabies vaccination",
    quarantine: false,
    quarantineDays: 0,
    bannedBreeds: [],
    additionalTests: [],
    importPermit: false,
    advanceNoticeDays: 10,
    notes: "Mexico requires a health certificate from a licensed vet and proof of rabies vaccination. USDA endorsement not required for personal pets but recommended.",
    source: "https://www.gob.mx/senasica/acciones-y-programas/importacion-de-mascotas",
  },

  // --- United Kingdom ---
  GB: {
    countryCode: "GB",
    countryName: "United Kingdom",
    microchipRequired: true,
    rabiesVaccineRequired: true,
    rabiesWaitDays: 21,
    healthCertificate: "USDA-endorsed veterinary certificate (APHIS Form 7001) within 10 days of travel",
    quarantine: false,
    quarantineDays: 0,
    bannedBreeds: [
      "Pit Bull Terrier",
      "Japanese Tosa",
      "Dogo Argentino",
      "Fila Brasileiro",
    ],
    additionalTests: [],
    importPermit: false,
    advanceNoticeDays: 30,
    notes: "UK Dangerous Dogs Act 1991 bans four breeds. Microchip must be ISO 15-digit. Rabies vaccine must be given at least 21 days before travel. Tapeworm treatment required 1-5 days before arrival.",
    source: "https://www.gov.uk/bring-pet-to-great-britain",
  },
};

// Generate EU country entries from the baseline
for (const code of EU_MEMBER_CODES) {
  // Country names for common EU destinations
  const EU_COUNTRY_NAMES = {
    AT: "Austria", BE: "Belgium", BG: "Bulgaria", HR: "Croatia",
    CY: "Cyprus", CZ: "Czech Republic", DK: "Denmark", EE: "Estonia",
    FI: "Finland", FR: "France", DE: "Germany", GR: "Greece",
    HU: "Hungary", IE: "Ireland", IT: "Italy", LV: "Latvia",
    LT: "Lithuania", LU: "Luxembourg", MT: "Malta", NL: "Netherlands",
    PL: "Poland", PT: "Portugal", RO: "Romania", SK: "Slovakia",
    SI: "Slovenia", ES: "Spain", SE: "Sweden",
  };

  PET_ENTRY_RULES[code] = {
    ...EU_BASELINE_RULES,
    countryCode: code,
    countryName: EU_COUNTRY_NAMES[code] || code,
  };
}

/**
 * Look up pet entry requirements by ISO 3166-1 alpha-2 country code.
 * Returns null for US (domestic) and unknown countries.
 *
 * @param {string} countryCode - ISO 3166-1 alpha-2 (e.g. "GB", "CA", "DE")
 * @returns {object|null} Entry rules object or null
 */
export function getEntryRules(countryCode) {
  if (!countryCode || typeof countryCode !== "string") return null;
  const upper = countryCode.toUpperCase().trim();

  // US is domestic — no import entry rules
  if (upper === "US") return null;

  return PET_ENTRY_RULES[upper] || null;
}

/**
 * Check if the trip start date allows enough advance time for pet entry paperwork.
 * Returns a warning string if not enough time, null if fine.
 *
 * @param {object} rules - Entry rules object (must have advanceNoticeDays)
 * @param {Date} tripStartDate - When the trip starts
 * @returns {string|null} Warning message or null
 */
export function getTimelineWarning(rules, tripStartDate) {
  if (!rules || !rules.advanceNoticeDays) return null;
  if (!(tripStartDate instanceof Date)) return null;

  const now = new Date();
  const msUntilTrip = tripStartDate.getTime() - now.getTime();
  const daysUntilTrip = Math.floor(msUntilTrip / (24 * 60 * 60 * 1000));

  if (daysUntilTrip < rules.advanceNoticeDays) {
    return `Traveling to ${rules.countryName || "this country"} with a pet requires starting paperwork at least ${rules.advanceNoticeDays} days in advance. Your trip is only ${daysUntilTrip} days away — you may not have enough time to complete requirements.`;
  }

  return null;
}

/**
 * Check if a breed is banned for entry in a given country.
 * Case-insensitive partial match against the bannedBreeds list.
 *
 * @param {string} breed - Breed name to check
 * @param {object} rules - Entry rules object (must have bannedBreeds array)
 * @returns {boolean} True if breed is banned
 */
export function isBannedBreed(breed, rules) {
  if (!breed || !rules || !Array.isArray(rules.bannedBreeds) || rules.bannedBreeds.length === 0) {
    return false;
  }

  const breedLower = breed.toLowerCase().trim();

  return rules.bannedBreeds.some((banned) => {
    const bannedLower = banned.toLowerCase();
    // Match if the input contains the banned breed name or vice versa
    return breedLower.includes(bannedLower) || bannedLower.includes(breedLower);
  });
}
