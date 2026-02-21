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
