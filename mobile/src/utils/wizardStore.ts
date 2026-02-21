/**
 * Simple in-memory wizard store using a module-level singleton.
 * Avoids prop drilling across Expo Router screens without needing Context providers.
 * Data is only kept for the current app session — persisted version uses AsyncStorage.
 */

import type {
  Child,
  TripData,
  TripPlan,
  Weather,
  PackingList,
  SafetyGuidance,
} from "../types/trip";

export interface WizardState {
  // Wizard inputs
  destinationQuery: string;
  resolvedDestination: string;
  startDate: string;
  endDate: string;
  numChildren: number;
  childAges: number[];
  childWeights: (string | number)[];
  childHeights: (string | number)[];

  // Results
  trip: TripData | null;
  weather: Weather | null;
  tripPlan: TripPlan | null;
  packingList: PackingList | null;
  safetyGuidance: SafetyGuidance | null;

  // Loading state
  loadingPhase: "resolving" | "weather" | "planning" | "packing" | null;
  error: string | null;
  rateLimitResetAt: number | null;
}

function todayStr(): string {
  return new Date().toISOString().split("T")[0];
}
function tomorrowStr(): string {
  const d = new Date();
  d.setDate(d.getDate() + 3);
  return d.toISOString().split("T")[0];
}

const defaultState: WizardState = {
  destinationQuery: "",
  resolvedDestination: "",
  startDate: todayStr(),
  endDate: tomorrowStr(),
  numChildren: 1,
  childAges: [2],
  childWeights: [""],
  childHeights: [""],
  trip: null,
  weather: null,
  tripPlan: null,
  packingList: null,
  safetyGuidance: null,
  loadingPhase: null,
  error: null,
  rateLimitResetAt: null,
};

let state: WizardState = { ...defaultState };
const listeners = new Set<() => void>();

export function getState(): WizardState {
  return state;
}

export function setState(partial: Partial<WizardState>): void {
  state = { ...state, ...partial };
  listeners.forEach((l) => l());
}

export function resetWizard(): void {
  state = { ...defaultState, startDate: todayStr(), endDate: tomorrowStr() };
  listeners.forEach((l) => l());
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function buildChildrenPayload(): Child[] {
  const { numChildren, childAges, childWeights, childHeights } = state;
  return childAges.slice(0, numChildren).map((age, i) => {
    const weightRaw = childWeights[i];
    const heightRaw = childHeights[i];
    const weightLb =
      weightRaw !== "" && !isNaN(Number(weightRaw)) ? Number(weightRaw) : null;
    const heightIn =
      heightRaw !== "" && !isNaN(Number(heightRaw)) ? Number(heightRaw) : null;
    return {
      id: `child-${i + 1}`,
      age,
      weightLb,
      heightIn,
    };
  });
}
