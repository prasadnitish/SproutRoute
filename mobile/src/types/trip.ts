/**
 * SproutRoute shared types — ported from strollerscout/src/shared/types/trip.ts
 */

export interface Child {
  id?: string;
  age: number;
  weightLb?: number | null;
  heightIn?: number | null;
}

export interface TripRequest {
  destination: string;
  startDate: string; // ISO date string: "2026-05-01"
  endDate: string;
  activities: string[];
  children: Child[];
  tripType?: string;
}

export interface WeatherDay {
  name: string;
  high: number;
  low: number;
  condition: string;
  precipitation: number;
}

export interface Weather {
  summary: string;
  forecast: WeatherDay[];
}

export interface Activity {
  id: string;
  name: string;
  category: string;
  description: string;
  duration: string;
  kidFriendly: boolean;
  weatherDependent: boolean;
  bestDays: string[];
  reason: string;
}

export interface ItineraryDay {
  day: string;
  activities: string[];
  meals: string;
  notes: string;
}

export interface TripPlan {
  overview: string;
  suggestedActivities: Activity[];
  dailyItinerary: ItineraryDay[];
  tips: string[];
}

export interface PackingItem {
  name: string;
  quantity: string;
  reason: string;
}

export interface PackingCategory {
  name: string;
  items: PackingItem[];
}

export interface PackingList {
  categories: PackingCategory[];
}

export interface SafetyResult {
  childId: string;
  ageYears?: number;
  weightLb?: number | null;
  heightIn?: number | null;
  status: string;
  requiredRestraint: string;
  requiredRestraintLabel: string;
  seatPosition?: string;
  rationale: string;
  sourceUrl?: string;
  effectiveDate?: string;
}

export interface SafetyGuidance {
  status: string;
  jurisdictionCode: string | null;
  jurisdictionName: string;
  message?: string;
  sourceUrl?: string | null;
  effectiveDate?: string | null;
  lastUpdated?: string | null;
  results: SafetyResult[];
}

export interface TripData {
  destination: string;
  jurisdictionCode?: string | null;
  jurisdictionName?: string | null;
  startDate: string;
  endDate: string;
  duration: number;
  activities: string[];
  children: Child[];
  tripType?: string;
  countryCode?: string | null;
  lat?: number;
  lon?: number;
}

export interface TravelAdvisory {
  countryCode: string;
  level: number;
  levelDescription: string;
  summary: string;
}

export interface NeighborhoodSafety {
  overallScore: number;
  scores: Record<string, number>;
  summary: string;
}

export interface SavedTrip {
  trip: TripData;
  weather: Weather;
  tripPlan: TripPlan;
  packingList: PackingList;
  safetyGuidance: SafetyGuidance | null;
  travelAdvisory?: TravelAdvisory | null;
  neighborhoodSafety?: NeighborhoodSafety | null;
  lastModified: string;
}

export interface GeoCoords {
  lat: number;
  lon: number;
  countryCode?: string;
  regionCode?: string;
  displayName?: string;
}

export interface DestinationSuggestion {
  name: string;
  displayName: string;
  distanceMiles?: number;
  why?: string;
  tripType?: string;
  coords?: GeoCoords;
}

export interface ResolveDestinationResponse {
  mode: "direct" | "suggestions";
  destination?: string;
  suggestions?: DestinationSuggestion[];
  tripType?: string;
  countryCode?: string;
  coords?: GeoCoords;
  vibeDescription?: string;
  suggestedActivities?: string[];
}
