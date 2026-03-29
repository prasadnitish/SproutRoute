/**
 * tripIntent.ts — Expanded parsed trip intent contracts
 *
 * Replaces the narrow parse shape with a richer schema that preserves
 * extra user context instead of dropping it.
 *
 * Phase 2 deliverable per PRD §7.
 */

// ── Pet within trip context ─────────────────────────────────────────────────

export interface TripPet {
  type: string;
  breed?: string | null;
  ageMonths?: number | null;
  weightLb?: number | null;
  name?: string | null;
}

// ── Suggested destination (when user is vague) ──────────────────────────────

export interface SuggestedDestination {
  name: string;
  emoji?: string;
  description?: string;
  seasonNote?: string;
}

// ── Food preferences (expanded) ─────────────────────────────────────────────

export interface TripFoodPreferences {
  dietary: string[];
  cuisines: string[];
  avoidances: string[];
  kidFoods: string[];
  budget: string | null;
}

// ── Expanded parsed trip intent ─────────────────────────────────────────────

export interface ParsedTripIntent {
  destination: string | null;
  suggestedDestinations: SuggestedDestination[];
  startDate: string | null;   // YYYY-MM-DD
  endDate: string | null;     // YYYY-MM-DD
  adults: number;
  childrenAges: number[];
  pets: TripPet[];
  vibe: string;
  foodPreferences: TripFoodPreferences;
  tripGoals: string[];
  mustHaves: string[];
  avoidances: string[];
  accommodationPreferences: string[];
  transportPreferences: string[];
  pacePreference: "slow" | "moderate" | "fast" | "unknown";
  budgetSignals: string[];
  accessibilityNeeds: string[];
  scheduleConstraints: string[];
  celebrationContext: string | null;
  specialNotes: string[];
  extraContext: string[];         // Anything useful that doesn't map cleanly
  unresolvedQuestions: string[];  // Things the parser couldn't determine
  detectedRegion?: string | null; // From IP geolocation
}

// ── Trip request record (for persistence) ───────────────────────────────────

export interface TripRequestRecord {
  id: string;
  userId: string;
  rawInput: string;
  parsedTripJson: ParsedTripIntent;
  resolvedProfileSnapshotJson: Record<string, unknown> | null;
  createdAt: string;
}

// ── Trip feedback ───────────────────────────────────────────────────────────

export type FeedbackSignalType = "more_like_this" | "less_like_this" | "save_as_preference";

export interface TripFeedback {
  id: string;
  userId: string;
  tripRequestId: string;
  signalType: FeedbackSignalType;
  payloadJson: Record<string, unknown>;
  createdAt: string;
}
