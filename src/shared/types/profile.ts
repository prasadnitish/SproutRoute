/**
 * profile.ts — User travel profile contracts
 *
 * Defines the internal normalized profile schema and related types.
 * External LLM import shapes are kept separate — see profileImport.ts.
 *
 * Phase 2 deliverable per PRD §7.
 */

// ── Meta types ──────────────────────────────────────────────────────────────

export type Confidence = "high" | "medium" | "low";
export type SourceBasis = "memory" | "chat_context" | "inference" | "user_edit" | "explicit_trip_input";

export interface ProfileSectionMeta {
  confidence: Confidence;
  sourceBasis: SourceBasis[];
  summary?: string;
  updatedAt: string; // ISO 8601
}

// ── Profile sections ────────────────────────────────────────────────────────

export interface FoodProfile {
  cuisinesLiked: string[];
  cuisinesDisliked: string[];
  dietaryRestrictions: string[];
  kidFoods: string[];
  foodAdventurousness: "low" | "medium" | "high" | "unknown";
  notes: string;
  meta: ProfileSectionMeta;
}

export interface TravelStyleProfile {
  pace: "slow" | "moderate" | "fast" | "unknown";
  planningStyle: "structured" | "flexible" | "spontaneous" | "unknown";
  accommodationPreference: string;
  transportPreference: string;
  notes: string;
  meta: ProfileSectionMeta;
}

export interface ActivityProfile {
  preferredActivities: string[];
  dislikedActivities: string[];
  activityIntensity: "relaxed" | "moderate" | "active" | "unknown";
  notes: string;
  meta: ProfileSectionMeta;
}

export interface PersonalityTravelProfile {
  travelerType: string;
  noveltyVsComfort: 1 | 2 | 3 | 4 | 5 | null;
  crowdTolerance: "low" | "medium" | "high" | "unknown";
  notes: string;
  meta: ProfileSectionMeta;
}

export interface FamilyContextProfile {
  travelingWith: string;
  kidsDetails: string;
  kidPreferences: string;
  petContext?: string;
  notes: string;
  meta: ProfileSectionMeta;
}

export interface ConstraintProfile {
  budgetRange: string;
  timeConstraints: string;
  accessibilityNeeds: string;
  notes: string;
  meta: ProfileSectionMeta;
}

export interface TripPriorityProfile {
  mustHaves: string[];
  avoidances: string[];
  notes: string;
  meta: ProfileSectionMeta;
}

// ── Composite profile ───────────────────────────────────────────────────────

export interface UserTravelProfile {
  id: string;
  userId: string;
  version: number;
  food: FoodProfile;
  travelStyle: TravelStyleProfile;
  activities: ActivityProfile;
  personality: PersonalityTravelProfile;
  family: FamilyContextProfile;
  constraints: ConstraintProfile;
  priorities: TripPriorityProfile;
  profileSummary: string; // Compact text for injection into AI prompts (150-300 tokens)
  unknowns: string[];     // Things the profile couldn't determine
  createdAt: string;      // ISO 8601
  updatedAt: string;      // ISO 8601
}

// ── Profile revision (immutable audit trail) ────────────────────────────────

export interface ProfileRevision {
  id: string;
  profileId: string;
  version: number;
  changeSource: "import" | "user_edit" | "feedback" | "merge";
  changeSummary: string;
  profileJson: UserTravelProfile;
  createdAt: string;
}
