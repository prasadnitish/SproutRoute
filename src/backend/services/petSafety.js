/**
 * petSafety.js — Pet travel safety orchestrator
 *
 * Combines airline eligibility checks, international entry rules,
 * breed ban detection, and timeline warnings into a single structured response.
 *
 * Follows the DI pattern from safetyRules.js for testability.
 *
 * Authority model: static data is authoritative, AI is advisory.
 * Static database is the single source of truth for hard facts.
 */

import { checkAllAirlines } from "../data/petAirlineRules.js";
import {
  getEntryRules,
  getTimelineWarning,
  isBannedBreed,
} from "../data/petEntryRules.js";

/**
 * Get comprehensive pet travel guidance combining airline rules and entry requirements.
 *
 * @param {object[]} pets — Array of pet objects { type, name, breed, weightLbs, specialNeeds }
 * @param {object} options — { destination, travelMode, countryCode, startDate }
 * @param {object} deps — Dependency injection for testing
 * @returns {object} Structured pet travel guidance
 */
export async function getPetTravelGuidance(
  pets,
  { destination, travelMode, countryCode, startDate } = {},
  deps = {},
) {
  const {
    checkAllAirlinesFn = checkAllAirlines,
    getEntryRulesFn = getEntryRules,
    getTimelineWarningFn = getTimelineWarning,
    isBannedBreedFn = isBannedBreed,
  } = deps;

  // Empty pets array: return empty result
  if (!Array.isArray(pets) || pets.length === 0) {
    return {
      airlineGuidance: null,
      entryRequirements: null,
    };
  }

  // 1. Airline guidance (only for fly mode)
  let airlineGuidance = null;
  if (travelMode === "fly") {
    airlineGuidance = pets.map((pet) => {
      const airlines = checkAllAirlinesFn(pet);
      return {
        pet: pet.name || `${pet.type} (${pet.breed || "unknown breed"})`,
        airlines,
      };
    });
  }

  // 2. Entry requirements by country code
  const entryRules = getEntryRulesFn(countryCode);
  let entryRequirements = null;

  if (entryRules) {
    // Check for banned breeds across all pets
    const breedWarnings = [];
    for (const pet of pets) {
      if (pet.breed && isBannedBreedFn(pet.breed, entryRules)) {
        const petLabel = pet.name || `${pet.type}`;
        breedWarnings.push(
          `${petLabel} (${pet.breed}) may be banned or restricted in ${entryRules.countryName}. Check with authorities before traveling.`,
        );
      }
    }

    // Check timeline warning
    let timelineWarning = null;
    if (startDate) {
      const tripDate = new Date(startDate);
      if (!isNaN(tripDate.getTime())) {
        timelineWarning = getTimelineWarningFn(entryRules, tripDate);
      }
    }

    entryRequirements = {
      country: entryRules.countryName,
      microchipRequired: entryRules.microchipRequired,
      rabiesVaccine: entryRules.rabiesVaccineRequired
        ? `Required${entryRules.rabiesWaitDays > 0 ? `, administered ${entryRules.rabiesWaitDays}+ days before travel` : ""}`
        : "Not required",
      quarantine: entryRules.quarantine,
      quarantineDays: entryRules.quarantineDays || 0,
      bannedBreeds: entryRules.bannedBreeds || [],
      healthCertificate: entryRules.healthCertificate,
      advanceNoticeDays: entryRules.advanceNoticeDays,
      additionalTests: entryRules.additionalTests || [],
      notes: entryRules.notes,
      source: entryRules.source,
      breedWarnings: breedWarnings.length > 0 ? breedWarnings : null,
      timelineWarning,
    };
  }

  return {
    airlineGuidance,
    entryRequirements,
  };
}
