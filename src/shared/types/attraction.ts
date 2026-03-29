/**
 * attraction.ts — Precomputed attraction intelligence contracts
 *
 * Defines the city and attraction schemas for the offline precompute layer.
 * These entities are populated by slow/rich LLMs offline and queried at
 * runtime to reduce open-ended reasoning during itinerary generation.
 *
 * Phase 2 deliverable per PRD §7.
 */

// ── City ────────────────────────────────────────────────────────────────────

export type PriorityTier = "tier1" | "tier2" | "tier3";

export interface City {
  id: string;
  countryCode: string;
  regionCode: string;
  cityName: string;
  displayName: string;
  lat: number;
  lon: number;
  priorityTier: PriorityTier;
  createdAt: string;
  updatedAt: string;
}

// ── City attraction ─────────────────────────────────────────────────────────

export type VerificationStatus = "verified" | "unverified" | "stale" | "rejected";
export type IndoorOutdoor = "indoor" | "outdoor" | "both";
export type DurationBucket = "under_1h" | "1_2h" | "2_4h" | "half_day" | "full_day";
export type PaceFit = "slow" | "moderate" | "fast" | "any";
export type CrowdLevel = "low" | "moderate" | "high" | "varies";
export type BudgetTier = "free" | "budget" | "moderate" | "premium";

export interface AgeBand {
  label: string;     // e.g. "infant", "toddler", "preschool", "school_age", "teen"
  minAge: number;
  maxAge: number;
  suitability: "great" | "good" | "okay" | "poor";
}

export interface CityAttraction {
  id: string;
  cityId: string;
  canonicalName: string;
  shortSummary: string;
  category: string;
  subcategoriesJson: string[];
  ageBandsJson: AgeBand[];
  indoorOutdoor: IndoorOutdoor;
  durationBucket: DurationBucket;
  paceFit: PaceFit;
  crowdLevel: CrowdLevel;
  budgetTier: BudgetTier;
  strollerFriendly: boolean;
  rainyDayFit: boolean;
  parentAppealScore: number;   // 1-10
  kidAppealScore: number;      // 1-10
  petFriendly: boolean;
  bookingNeeded: boolean;
  confidenceScore: number;     // 0.0-1.0
  llmNotes: string;
  googlePlaceId: string | null;
  lastVerifiedAt: string | null;
  verificationStatus: VerificationStatus;
  createdAt: string;
  updatedAt: string;
}

// ── Attraction tags ─────────────────────────────────────────────────────────

export interface AttractionTag {
  id: string;
  attractionId: string;
  tag: string;
  tagGroup: string;    // e.g. "activity_type", "theme", "audience", "season"
  weight: number;      // 0.0-1.0 relevance
  createdAt: string;
}

// ── Precompute run tracking ─────────────────────────────────────────────────

export type RunStatus = "pending" | "running" | "completed" | "failed";

export interface AttractionPrecomputeRun {
  id: string;
  cityId: string;
  modelProvider: string;
  modelName: string;
  promptVersion: string;
  runStatus: RunStatus;
  inputSnapshotJson: Record<string, unknown>;
  outputSnapshotJson: Record<string, unknown> | null;
  startedAt: string;
  completedAt: string | null;
}

// ── Verification cache ──────────────────────────────────────────────────────

export interface AttractionVerificationCache {
  id: string;
  attractionId: string;
  provider: string;         // e.g. "google_places"
  verificationPayloadJson: Record<string, unknown>;
  verifiedAt: string;
  expiresAt: string;
}
