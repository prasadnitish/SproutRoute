import type { RoutePlan, ScheduledItineraryDay } from './trip.js';

/** Only result fields approved for public sharing. Prompt/profile fields are excluded. */
export interface PublicTripMeta {
  destination: string;
  startDate?: string;
  endDate?: string;
  duration?: number;
  lat?: number;
  lon?: number;
  countryCode?: string;
}

export interface SharedTripSnapshot {
  schemaVersion: 1;
  tripData: {
    trip: PublicTripMeta;
    parsed: Pick<PublicTripMeta, 'destination' | 'startDate' | 'endDate'>;
    tripPlan: Record<string, unknown>;
    scheduledItinerary: ScheduledItineraryDay[];
    weather: Record<string, unknown>;
    routePlan?: RoutePlan;
    stopWeather?: Record<string, unknown>;
  };
}

/** POST /api/v1/trip/shares. The server filters the result again before storage. */
export interface TripShareCreateRequest { tripData: SharedTripSnapshot['tripData']; }
export interface TripShareCreateResponse {
  token: string;
  /** Creator-only revocation capability; never include in the shared URL. */
  ownerToken: string;
  createdAt: string;
  /** Exactly seven days after createdAt, enforced server-side. */
  expiresAt: string;
}

/** GET /api/v1/trip/shares/view with x-trip-share-token header. */
export interface TripShareViewResponse {
  snapshot: SharedTripSnapshot;
  createdAt: string;
  expiresAt: string;
}

/** DELETE /api/v1/trip/shares: read token + x-trip-share-owner-token, returns 204. */
export interface TripShareRevokeHeaders {
  'x-trip-share-token': string;
  'x-trip-share-owner-token': string;
}
