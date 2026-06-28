/**
 * SproutRoute — Shared Types barrel export
 *
 * Import from this file in frontend and mobile:
 *   import type { TripPlanRequest, ApiError } from '../shared/types';
 */

export type {
  // API infrastructure
  ApiError,
  ErrorCategory,
  ClientPlatform,
  UnitSystem,
  V1RequestBase,
  WeatherProvider,
  GuidanceMode,
  Ios26Features,
  FeatureFlags,
  CapabilityPayload,
} from "./api.js";

export type {
  // Trip domain
  ChildProfile,
  TripResolveRequest,
  TripResolveResponse,
  DestinationSuggestion,
  TripPlanRequest,
  TripPlanResponse,
  TripPlanResult,
  TripMeta,
  WeatherForecast,
  WeatherPeriod,
  ItineraryDay,
  TripPackingRequest,
  TripPackingResponse,
  PackingList,
  PackingCategory,
  PackingItem,
  CarSeatCheckRequest,
  CarSeatCheckResponse,
  ChildCarSeatResult,
} from "./trip.js";

export type {
  // Collaborative Trip Hub
  GroupTripStatus,
  GroupTripParticipantRole,
  GroupTripItemStatus,
  GroupTripDecisionStatus,
  GroupTripSuggestionSeverity,
  GroupTripSuggestionStatus,
  GroupTripCreateRequest,
  GroupTripJoinRequest,
  GroupTripAuthenticatedMutation,
  GroupTripItemCreateRequest,
  GroupTripDecisionCreateRequest,
  GroupTripDecisionVoteRequest,
  GroupTripExpenseCreateRequest,
  GroupTripLocationSharingRequest,
  GroupTripSnapshotRequest,
  GroupTripWorkspace,
  GroupTripParticipantLocation,
  GroupTripParticipant,
  GroupTripItem,
  GroupTripDecisionOption,
  GroupTripDecisionVote,
  GroupTripDecision,
  GroupTripExpense,
  GroupTripBalance,
  GroupTripActivityEvent,
  GroupTripAISuggestion,
  GroupTripWorkspaceResponse,
  GroupTripSnapshotResponse,
  GroupTripItemResponse,
  GroupTripDecisionResponse,
  GroupTripExpenseResponse,
  GroupTripLocationSharingResponse,
} from "./groupTrip.js";

export type {
  // Pet travel
  PetType,
  Pet,
  PetAirlineRule,
  PetEntryRule,
  PetAirlineEligibility,
  PetAirlineGuidance,
  PetEntryRequirements,
  TravelMode,
  PetTravelCheckRequest,
  PetTravelCheckResponse,
} from "./pet.js";

export type {
  // User travel profile
  Confidence,
  SourceBasis,
  ProfileSectionMeta,
  FoodProfile,
  TravelStyleProfile,
  ActivityProfile,
  PersonalityTravelProfile,
  FamilyContextProfile,
  ConstraintProfile,
  TripPriorityProfile,
  UserTravelProfile,
  ProfileRevision,
} from "./profile.js";

export type {
  // Profile import
  ProfileImportValidation,
  ProfileImportRequest,
  ProfileImportRecord,
} from "./profileImport.js";

export type {
  // Expanded trip intent
  TripPet,
  SuggestedDestination,
  TripFoodPreferences,
  ParsedTripIntent,
  TripRequestRecord,
  FeedbackSignalType,
  TripFeedback,
} from "./tripIntent.js";

export type {
  // Attraction intelligence
  PriorityTier,
  City,
  VerificationStatus,
  IndoorOutdoor,
  DurationBucket,
  PaceFit,
  CrowdLevel,
  BudgetTier,
  AgeBand,
  CityAttraction,
  AttractionTag,
  RunStatus,
  AttractionPrecomputeRun,
  AttractionVerificationCache,
} from "./attraction.js";
