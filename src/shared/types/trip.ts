/**
 * SproutRoute — Shared Trip Domain Types
 * Phase 1: Core domain contracts
 *
 * All trip-related request and response shapes.
 * Update here first when changing the data model.
 */

import type { V1RequestBase, GuidanceMode } from "./api.js";

// ── Children ─────────────────────────────────────────────────────────────────

export interface ChildProfile {
  /** Age in whole years (0–17) */
  age: number;
  /** Weight in pounds — used for car seat guidance */
  weightLb?: number;
  /** Height in inches — used for car seat guidance */
  heightIn?: number;
  /** Optional stable identifier for this child */
  id?: string;
}

// ── Trip Resolve ─────────────────────────────────────────────────────────────

/** POST /api/v1/trip/resolve request */
export interface TripResolveRequest extends V1RequestBase {
  /** Free-text destination query (e.g. "2 hours from Denver") */
  query: string;
}

/** A single resolved destination suggestion */
export interface DestinationSuggestion {
  name: string;
  displayName: string;
  distanceMiles?: number;
  lat?: number;
  lon?: number;
}

/** POST /api/v1/trip/resolve response — success */
export interface TripResolveResponse {
  requestId: string;
  mode: "direct" | "suggestions";
  /** Present when mode = "direct" */
  destination?: DestinationSuggestion;
  /** Present when mode = "suggestions" */
  origin?: string;
  suggestions?: DestinationSuggestion[];
}

// ── Trip Plan ─────────────────────────────────────────────────────────────────

/** POST /api/v1/trip/plan request */
export interface TripPlanRequest extends V1RequestBase {
  destination: string;
  /** ISO 8601 date string: YYYY-MM-DD */
  startDate: string;
  /** ISO 8601 date string: YYYY-MM-DD */
  endDate: string;
  /** Activity slugs (e.g. ["parks", "hiking"]) */
  activities: string[];
  children: ChildProfile[];
}

/** A single day in the itinerary */
export interface ItineraryDay {
  day: number;
  date?: string;
  activities: string[];
  notes?: string;
}

/** The AI-generated trip plan */
export interface TripPlanResult {
  overview: string;
  suggestedActivities: string[];
  dailyItinerary: ItineraryDay[];
  tips: string[];
}

/** Resolved trip metadata returned in plan + packing responses */
export interface TripMeta {
  destination: string;
  jurisdictionCode: string | null;
  jurisdictionName: string | null;
  startDate: string;
  endDate: string;
  /** Trip duration in days */
  duration: number;
  activities: string[];
  children: ChildProfile[];
  // v1 extended fields
  countryCode: string;
  unitSystem: string;
  client: string;
  schemaVersion: string;
}

/** Weather forecast for a single period */
export interface WeatherPeriod {
  name: string;
  high?: number;
  low?: number;
  precipitation?: number;
  condition?: string;
}

/** Weather summary returned alongside trip data */
export interface WeatherForecast {
  summary: string;
  forecast: WeatherPeriod[];
}

/** POST /api/v1/trip/plan response — success */
export interface TripPlanResponse {
  requestId: string;
  trip: TripMeta;
  weather: WeatherForecast;
  tripPlan: TripPlanResult;
}

// ── Packing List ─────────────────────────────────────────────────────────────

/** POST /api/v1/trip/packing request */
export interface TripPackingRequest extends V1RequestBase {
  destination: string;
  startDate: string;
  endDate: string;
  /** Must have at least one activity */
  activities: string[];
  children: ChildProfile[];
}

/** A single packing item */
export interface PackingItem {
  name: string;
  quantity: string;
  reason: string;
  /** "ai" = AI-generated, "custom" = user-added (Phase 2) */
  source?: "ai" | "custom";
}

/** A category grouping of packing items */
export interface PackingCategory {
  name: string;
  items: PackingItem[];
}

/** The AI-generated packing list */
export interface PackingList {
  categories: PackingCategory[];
}

/** POST /api/v1/trip/packing response — success */
export interface TripPackingResponse {
  requestId: string;
  trip: TripMeta;
  weather: WeatherForecast;
  packingList: PackingList;
}

// ── Safety / Car Seat ────────────────────────────────────────────────────────

/** POST /api/v1/safety/car-seat-check request */
export interface CarSeatCheckRequest extends V1RequestBase {
  destination: string;
  jurisdictionCode?: string;
  tripDate?: string;
  children: ChildProfile[];
}

/** Guidance result for a single child */
export interface ChildCarSeatResult {
  childId: string;
  status: "OK" | "Needs review" | "UNAVAILABLE";
  requiredRestraint: string;
  requiredRestraintLabel: string;
  rationale: string;
}

/** POST /api/v1/safety/car-seat-check response — success */
export interface CarSeatCheckResponse {
  requestId: string;
  status: string;
  jurisdictionCode: string;
  jurisdictionName: string;
  /** v1 required: guidance mode determines how to display results */
  guidanceMode: GuidanceMode;
  /** Confidence level of the guidance */
  confidence: "high" | "medium" | "low";
  /** Human-readable source authority name */
  sourceAuthority: string;
  /** ISO date string of when this guidance was last reviewed */
  lastReviewed: string;
  message: string;
  sourceUrl: string;
  results: ChildCarSeatResult[];
}
