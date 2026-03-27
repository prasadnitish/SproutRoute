/**
 * petAirlineRules.js — Static airline pet policy database
 *
 * Covers 6 major US carriers with verified policy data.
 * Follows the carSeatRules.js pattern: static data + pure lookup functions.
 *
 * IMPORTANT: All policy data requires human review against official airline
 * websites before production use. Policies change frequently.
 *
 * Last verified: 2026-03-27
 */

// --- Brachycephalic (snub-nosed) breeds banned from cargo by most carriers ---
const BRACHYCEPHALIC_BREEDS = [
  "Affenpinscher",
  "American Bully",
  "Boston Terrier",
  "Boxer",
  "Brussels Griffon",
  "Bulldog",
  "English Bulldog",
  "French Bulldog",
  "Japanese Chin",
  "King Charles Spaniel",
  "Cavalier King Charles Spaniel",
  "Lhasa Apso",
  "Pekingese",
  "Pug",
  "Shar-Pei",
  "Shih Tzu",
  "Tibetan Spaniel",
];

// --- Common banned/restricted breeds across carriers ---
const COMMONLY_BANNED_BREEDS = [
  "Pit Bull",
  "Pit Bull Terrier",
  "American Pit Bull Terrier",
  "American Staffordshire Terrier",
  "Staffordshire Bull Terrier",
  "Rottweiler",
  "Doberman Pinscher",
  "Cane Corso",
  "Presa Canario",
  "Dogo Argentino",
  "Fila Brasileiro",
  "Japanese Tosa",
  "Wolf Hybrid",
];

/**
 * Static airline pet policy data for 6 major US carriers.
 *
 * Data sources are listed per carrier in the `source` field.
 * All fees are per direction (one-way) unless noted otherwise.
 * Weight limits are for pet + carrier combined (cabin).
 */
const AIRLINE_RULES = [
  {
    carrier: "Delta",
    carrierCode: "DL",
    cabinAllowed: true,
    cabinMaxWeightLbs: 20,
    cabinFee: "$95 each way",
    cabinCarrierDimensions: "Soft-sided, fits under seat: 18\" x 11\" x 11\"",
    cargoAllowed: true,
    cargoFee: "$200 domestic, varies international",
    bannedBreeds: [...COMMONLY_BANNED_BREEDS],
    brachycephalicBan: true,
    tempRestrictions: "No cargo when ground temp below 10°F or above 85°F at origin, destination, or connection",
    healthCertDays: 10,
    minAgeWeeks: 10,
    catAllowed: true,
    smallAnimalAllowed: false,
    source: "https://www.delta.com/us/en/pet-travel/overview",
  },
  {
    carrier: "United",
    carrierCode: "UA",
    cabinAllowed: true,
    cabinMaxWeightLbs: 25,
    cabinFee: "$125 each way",
    cabinCarrierDimensions: "Soft-sided, fits under seat: 18\" x 11\" x 11\"",
    cargoAllowed: true,
    cargoFee: "$337-$665 domestic",
    bannedBreeds: [...COMMONLY_BANNED_BREEDS],
    brachycephalicBan: true,
    tempRestrictions: "No cargo when ground temp below 10°F or above 85°F",
    healthCertDays: 10,
    minAgeWeeks: 8,
    catAllowed: true,
    smallAnimalAllowed: true,
    source: "https://www.united.com/en/us/fly/travel/pets.html",
  },
  {
    carrier: "American Airlines",
    carrierCode: "AA",
    cabinAllowed: true,
    cabinMaxWeightLbs: 20,
    cabinFee: "$150 each way",
    cabinCarrierDimensions: "Soft-sided, fits under seat: 19\" x 13\" x 9\"",
    cargoAllowed: true,
    cargoFee: "$200 domestic",
    bannedBreeds: [...COMMONLY_BANNED_BREEDS],
    brachycephalicBan: true,
    tempRestrictions: "No cargo when ground temp below 45°F or above 85°F",
    healthCertDays: 10,
    minAgeWeeks: 8,
    catAllowed: true,
    smallAnimalAllowed: false,
    source: "https://www.aa.com/i18n/travel-info/special-assistance/pets.jsp",
  },
  {
    carrier: "Southwest",
    carrierCode: "WN",
    cabinAllowed: true,
    cabinMaxWeightLbs: 20,
    cabinFee: "$125 each way",
    cabinCarrierDimensions: "Soft-sided, fits under seat: 18.5\" x 8.5\" x 13.5\"",
    cargoAllowed: false,
    cargoFee: "N/A",
    bannedBreeds: [],
    brachycephalicBan: false,
    tempRestrictions: "N/A (cabin only)",
    healthCertDays: 10,
    minAgeWeeks: 8,
    catAllowed: true,
    smallAnimalAllowed: false,
    source: "https://www.southwest.com/html/customer-service/traveling-with-animals/pets/index-background.html",
  },
  {
    carrier: "JetBlue",
    carrierCode: "B6",
    cabinAllowed: true,
    cabinMaxWeightLbs: 20,
    cabinFee: "$125 each way",
    cabinCarrierDimensions: "Soft-sided, fits under seat: 17\" x 12.5\" x 8.5\"",
    cargoAllowed: false,
    cargoFee: "N/A",
    bannedBreeds: [],
    brachycephalicBan: false,
    tempRestrictions: "N/A (cabin only)",
    healthCertDays: 10,
    minAgeWeeks: 8,
    catAllowed: true,
    smallAnimalAllowed: false,
    source: "https://www.jetblue.com/traveling-together/traveling-with-pets",
  },
  {
    carrier: "Alaska Airlines",
    carrierCode: "AS",
    cabinAllowed: true,
    cabinMaxWeightLbs: 20,
    cabinFee: "$100 each way",
    cabinCarrierDimensions: "Soft-sided, fits under seat: 17\" x 11\" x 7.5\"",
    cargoAllowed: true,
    cargoFee: "$150 domestic",
    bannedBreeds: [...COMMONLY_BANNED_BREEDS],
    brachycephalicBan: true,
    tempRestrictions: "No cargo when ground temp below 10°F or above 85°F",
    healthCertDays: 10,
    minAgeWeeks: 8,
    catAllowed: true,
    smallAnimalAllowed: true,
    source: "https://www.alaskaair.com/content/travel-info/policies/pets-traveling-with-prior-approval",
  },
];

// --- Lookup by carrier name (case-insensitive) ---
const rulesByName = new Map();
for (const rule of AIRLINE_RULES) {
  rulesByName.set(rule.carrier.toLowerCase(), rule);
}

// --- Lookup by IATA code ---
const rulesByCode = new Map();
for (const rule of AIRLINE_RULES) {
  rulesByCode.set(rule.carrierCode, rule);
}

/**
 * Get airline pet rules by carrier name or IATA code.
 * @param {string} carrierNameOrCode — e.g. "Delta", "DL", "united", "UA"
 * @returns {object|null} Airline rules object, or null if not found
 */
export function getAirlineRules(carrierNameOrCode) {
  if (!carrierNameOrCode || typeof carrierNameOrCode !== "string") return null;

  // Try IATA code first (exact match, 2 chars)
  const byCode = rulesByCode.get(carrierNameOrCode.toUpperCase());
  if (byCode) return byCode;

  // Try carrier name (case-insensitive)
  const byName = rulesByName.get(carrierNameOrCode.toLowerCase());
  return byName || null;
}

/**
 * Get all carriers in the database.
 * @returns {object[]} Array of all airline rule objects
 */
export function getAllCarriers() {
  return [...AIRLINE_RULES];
}

/**
 * Check if a breed string matches any entry in a banned breeds list.
 * Uses case-insensitive substring matching so "pit bull mix" triggers "Pit Bull".
 * @param {string} breed
 * @param {string[]} bannedList
 * @returns {string|null} The matched banned breed name, or null
 */
function matchBannedBreed(breed, bannedList) {
  if (!breed) return null;
  const lower = breed.toLowerCase();
  for (const banned of bannedList) {
    if (lower.includes(banned.toLowerCase()) || banned.toLowerCase().includes(lower)) {
      return banned;
    }
  }
  return null;
}

/**
 * Check if a breed is brachycephalic (snub-nosed).
 * @param {string} breed
 * @returns {boolean}
 */
function isBrachycephalic(breed) {
  return matchBannedBreed(breed, BRACHYCEPHALIC_BREEDS) !== null;
}

/**
 * Check a single pet's eligibility against a single airline's rules.
 *
 * @param {object} pet — { type: "dog"|"cat"|"small_animal", breed: string, weightLbs: number }
 * @param {object} airlineRule — One entry from AIRLINE_RULES
 * @returns {object} { cabinEligible, cargoEligible, breedWarning, requiredDocuments, cabinFee, cargoFee }
 */
export function checkPetEligibility(pet, airlineRule) {
  const result = {
    cabinEligible: false,
    cargoEligible: false,
    breedWarning: null,
    requiredDocuments: [],
    cabinFee: airlineRule.cabinFee,
    cargoFee: airlineRule.cargoFee,
  };

  // Check type restrictions
  if (pet.type === "cat" && !airlineRule.catAllowed) {
    return result;
  }
  if (pet.type === "small_animal" && !airlineRule.smallAnimalAllowed) {
    return result;
  }

  // Check cabin weight eligibility
  const weight = pet.weightLbs || 0;
  if (weight <= airlineRule.cabinMaxWeightLbs) {
    result.cabinEligible = true;
  }

  // Check cargo eligibility
  if (airlineRule.cargoAllowed) {
    result.cargoEligible = true;
  }

  // Check breed bans (applies to dogs primarily)
  if (pet.type === "dog" && pet.breed) {
    const bannedMatch = matchBannedBreed(pet.breed, airlineRule.bannedBreeds);
    if (bannedMatch) {
      result.breedWarning = `${pet.breed} is a restricted/banned breed (matches: ${bannedMatch}). Contact airline directly for current policy.`;
      // Banned breeds typically cannot fly cargo
      result.cargoEligible = false;
    }

    // Brachycephalic ban (cargo only)
    if (airlineRule.brachycephalicBan && isBrachycephalic(pet.breed)) {
      result.cargoEligible = false;
      if (!result.breedWarning) {
        result.breedWarning = `${pet.breed} is a brachycephalic (snub-nosed) breed. Cargo travel not available due to health risks.`;
      }
    }
  }

  // Build required documents
  result.requiredDocuments.push(
    `Health certificate/vet certificate within ${airlineRule.healthCertDays} days of travel`
  );
  result.requiredDocuments.push("Current rabies vaccination record");
  if (airlineRule.cargoAllowed && result.cargoEligible) {
    result.requiredDocuments.push("USDA-endorsed health certificate for cargo");
  }

  return result;
}

/**
 * Check a pet against ALL airlines in the database.
 *
 * @param {object} pet — { type, breed, weightLbs }
 * @returns {object[]} Array of results, one per carrier, each with carrier/carrierCode + eligibility fields
 */
export function checkAllAirlines(pet) {
  return AIRLINE_RULES.map((rule) => {
    const eligibility = checkPetEligibility(pet, rule);
    return {
      carrier: rule.carrier,
      carrierCode: rule.carrierCode,
      ...eligibility,
    };
  });
}

// Exported for use by other modules
export { BRACHYCEPHALIC_BREEDS, COMMONLY_BANNED_BREEDS };
