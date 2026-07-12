/**
 * SproutRoute — Shared Trip Hub Contracts
 *
 * Request and response shapes for the collaborative trip organizer under
 * /api/v1/group-trips*. Native clients should keep their API models aligned
 * with these contracts.
 */

import type { V1RequestBase } from "./api.js";

export type GroupTripStatus = "active" | "archived";
export type GroupTripParticipantRole = "owner" | "editor";
export type GroupTripItemStatus = "planned" | "cancelled";
export type GroupTripDecisionStatus = "open" | "closed";
export type GroupTripSuggestionSeverity = "info" | "warning";
export type GroupTripSuggestionStatus = "open" | "dismissed";

export interface GroupTripCreateRequest extends V1RequestBase {
  title: string;
  destination: string;
  /** ISO 8601 date string: YYYY-MM-DD */
  startDate: string;
  /** ISO 8601 date string: YYYY-MM-DD */
  endDate: string;
  ownerName: string;
}

export interface GroupTripJoinRequest extends V1RequestBase {
  inviteCode: string;
  displayName: string;
}

export interface GroupTripAuthenticatedMutation extends V1RequestBase {
  tripId: string;
  actorParticipantId: string;
  actorParticipantAccessToken: string;
}

export interface GroupTripItemCreateRequest extends GroupTripAuthenticatedMutation {
  kind: string;
  title: string;
  /** ISO 8601 datetime string when known */
  startAt?: string | null;
  /** ISO 8601 datetime string when known */
  endAt?: string | null;
  locationName?: string | null;
  notes?: string | null;
  assignedParticipantIds?: string[];
}

export interface GroupTripItemUpdateRequest extends GroupTripItemCreateRequest {
  itemId: string;
}

export interface GroupTripItemsImportTextRequest extends GroupTripAuthenticatedMutation {
  text: string;
}

export interface GroupTripDecisionCreateRequest extends GroupTripAuthenticatedMutation {
  title: string;
  options: string[];
}

export interface GroupTripDecisionVoteRequest extends V1RequestBase {
  tripId: string;
  decisionId: string;
  participantId: string;
  participantAccessToken: string;
  optionId: string;
}

export interface GroupTripExpenseCreateRequest extends GroupTripAuthenticatedMutation {
  paidByParticipantId: string;
  title: string;
  /** Amount in minor currency units, for example cents for USD */
  amountCents: number;
  /** ISO 4217 currency code */
  currency: string;
  splitParticipantIds: string[];
}

export interface GroupTripLocationSharingRequest extends V1RequestBase {
  tripId: string;
  participantId: string;
  participantAccessToken: string;
  isEnabled: boolean;
  latitude?: number | null;
  longitude?: number | null;
  accuracyMeters?: number | null;
}

export interface GroupTripSnapshotRequest extends V1RequestBase {
  tripId: string;
  participantId: string;
  /** Sent as X-Group-Trip-Participant-Token by HTTP clients */
  participantAccessToken: string;
}

export interface GroupTripWorkspace {
  id: string;
  title: string;
  destination: string;
  startDate: string;
  endDate: string;
  inviteCode: string;
  status: GroupTripStatus | string;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface GroupTripParticipantLocation {
  latitude: number;
  longitude: number;
  accuracyMeters?: number | null;
  updatedAt?: string | null;
}

export interface GroupTripParticipant {
  id: string;
  tripId: string;
  displayName: string;
  role: GroupTripParticipantRole;
  locationSharingEnabled?: boolean | null;
  lastLocation?: GroupTripParticipantLocation | null;
  /** Present only on the current participant returned by create/join. */
  accessToken?: string;
  joinedAt?: string | null;
}

export interface GroupTripItem {
  id: string;
  tripId: string;
  kind: string;
  title: string;
  startAt?: string | null;
  endAt?: string | null;
  locationName?: string | null;
  notes?: string | null;
  assignedParticipantIds: string[];
  status: GroupTripItemStatus | string;
  createdByParticipantId: string;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface GroupTripDecisionOption {
  id: string;
  title: string;
}

export interface GroupTripDecisionVote {
  participantId: string;
  optionId: string;
  updatedAt?: string | null;
}

export interface GroupTripDecision {
  id: string;
  tripId: string;
  title: string;
  status: GroupTripDecisionStatus | string;
  options: GroupTripDecisionOption[];
  votes: GroupTripDecisionVote[];
  createdByParticipantId: string;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface GroupTripExpense {
  id: string;
  tripId: string;
  title: string;
  amountCents: number;
  currency: string;
  paidByParticipantId: string;
  splitParticipantIds: string[];
  createdByParticipantId: string;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface GroupTripBalance {
  fromParticipantId: string;
  toParticipantId: string;
  amountCents: number;
  currency: string;
}

export interface GroupTripActivityEvent {
  id: string;
  tripId: string;
  type: string;
  actorParticipantId?: string | null;
  summary: string;
  createdAt?: string | null;
}

export interface GroupTripAISuggestion {
  id: string;
  tripId?: string | null;
  type: string;
  severity?: GroupTripSuggestionSeverity | string | null;
  title: string;
  summary: string;
  status: GroupTripSuggestionStatus | string;
  relatedItemIds?: string[] | null;
}

export interface GroupTripWorkspaceResponse {
  requestId?: string;
  trip: GroupTripWorkspace;
  currentParticipant: GroupTripParticipant;
  participants: GroupTripParticipant[];
}

export interface GroupTripSnapshotResponse {
  requestId?: string;
  trip: GroupTripWorkspace;
  participants: GroupTripParticipant[];
  items: GroupTripItem[];
  decisions: GroupTripDecision[];
  expenses: GroupTripExpense[];
  balances: GroupTripBalance[];
  activity: GroupTripActivityEvent[];
  aiSuggestions: GroupTripAISuggestion[];
}

export interface GroupTripItemResponse {
  requestId?: string;
  item: GroupTripItem;
  activity: GroupTripActivityEvent;
}

export interface GroupTripItemsImportTextResponse {
  requestId?: string;
  items: GroupTripItem[];
  importedCount: number;
  activity: GroupTripActivityEvent;
}

export interface GroupTripDecisionResponse {
  requestId?: string;
  decision: GroupTripDecision;
  activity?: GroupTripActivityEvent | null;
}

export interface GroupTripExpenseResponse {
  requestId?: string;
  expense: GroupTripExpense;
  balances: GroupTripBalance[];
  activity: GroupTripActivityEvent;
}

export interface GroupTripLocationSharingResponse {
  requestId?: string;
  participant: GroupTripParticipant;
  activity: GroupTripActivityEvent;
}
