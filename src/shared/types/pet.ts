/**
 * SproutRoute — Shared Pet Travel Types
 * Phase 2: Pet travel feature contracts
 *
 * All pet-related request and response shapes.
 * Update here first when changing the pet data model.
 */

import type { V1RequestBase } from "./api.js";

// ── Pet Profile ──────────────────────────────────────────────────────────────

/** Allowed pet type values */
export type PetType = "dog" | "cat" | "small_animal";

/** A single pet traveling with the family */
export interface Pet {
  /** Pet species category */
  type: PetType;
  /** Display name (e.g. "Max") */
  name?: string;
  /** Breed (e.g. "golden retriever") */
  breed: string;
  /** Weight in pounds — determines cabin vs cargo eligibility */
  weightLbs: number;
  /** Free-text medical/behavioral notes (e.g. "anxiety medication, 5mg twice daily") */
  specialNeeds?: string;
}

// ── Airline Rules ────────────────────────────────────────────────────────────

/** Static airline pet policy record (from petAirlineRules.js) */
export interface PetAirlineRule {
  carrier: string;
  carrierCode: string;
  cabinAllowed: boolean;
  cabinMaxWeightLbs: number;
  cabinFee: string;
  cabinCarrierDimensions: string;
  cargoAllowed: boolean;
  cargoFee: string;
  bannedBreeds: string[];
  brachycephalicBan: boolean;
  tempRestrictions: string;
  healthCertDays: number;
  minAgeWeeks: number;
  catAllowed: boolean;
  smallAnimalAllowed: boolean;
  /** URL to official airline policy page */
  source: string;
}

// ── International Entry Rules ────────────────────────────────────────────────

/** Static pet entry requirements for a country (from petEntryRules.js) */
export interface PetEntryRule {
  countryCode: string;
  countryName: string;
  microchipRequired: boolean;
  rabiesVaccineRequired: boolean;
  /** Days between vaccination and travel */
  rabiesWaitDays: number;
  healthCertificate: string;
  quarantine: boolean;
  quarantineDays: number;
  bannedBreeds: string[];
  additionalTests: string[];
  importPermit: boolean;
  /** Minimum days to start paperwork before travel */
  advanceNoticeDays: number;
  notes: string;
  /** URL to official government page */
  source: string;
}

// ── API Response Shapes ──────────────────────────────────────────────────────

/** Per-airline eligibility result for a single pet */
export interface PetAirlineEligibility {
  carrier: string;
  carrierCode: string;
  cabinEligible: boolean;
  cabinFee: string;
  cargoEligible: boolean;
  cargoFee: string;
  breedWarning: string | null;
  requiredDocuments: string[];
}

/** Airline guidance for a single pet across all carriers */
export interface PetAirlineGuidance {
  /** Pet name or identifier */
  pet: string;
  airlines: PetAirlineEligibility[];
  /** AI-generated recommendation summary */
  recommendation: string;
}

/** Entry requirements summary returned in the API response */
export interface PetEntryRequirements {
  country: string;
  microchipRequired: boolean;
  rabiesVaccine: string;
  quarantine: boolean;
  bannedBreeds: string[];
  healthCertificate: string;
  advanceNoticeDays: number;
  /** Warning for strict-timeline countries (e.g. Japan 180-day wait) */
  timelineWarning: string | null;
}

// ── Pet Travel Check Endpoint ────────────────────────────────────────────────

/** Travel mode — fly triggers airline rules, drive skips them */
export type TravelMode = "fly" | "drive";

/** POST /api/v1/safety/pet-travel-check request */
export interface PetTravelCheckRequest extends V1RequestBase {
  pets: Pet[];
  destination: string;
  countryCode: string;
  travelMode: TravelMode;
}

/** POST /api/v1/safety/pet-travel-check response — success */
export interface PetTravelCheckResponse {
  /** Per-pet airline eligibility (null when travelMode === "drive") */
  airlineGuidance: PetAirlineGuidance[] | null;
  /** Country entry requirements (null when country not in database) */
  entryRequirements: PetEntryRequirements | null;
  /** URL to official source */
  source: string;
}
