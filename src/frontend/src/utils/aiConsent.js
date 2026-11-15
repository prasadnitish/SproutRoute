// What the visitor is told before trip details go to AI services, and their answer.
// Based on the iOS app's AIDisclosure; the location lines differ because the website can send location.

export const AI_CONSENT_VERSION = 1;
export const AI_CONSENT_KEY = "sproutroute.aiConsent.acceptedVersion";

export const AI_DISCLOSURE = {
  summary:
    "To build your plan, SproutRoute sends your trip details to our server, which passes them to AI services. They write the itinerary, packing list and travel tips.",
  sentItems: [
    "The trip description you type",
    "Destination and dates",
    "Your children's ages",
    "Pets and their type",
    "Preferences and notes, including any imported profile",
    "Your city and state, only if you turn on \"Use my location\"",
  ],
  // Unlike the iOS app, the website can use location when the visitor turns it on.
  notSentItems: ["Your exact coordinates", "Your calendar, contacts or photos"],
  locationNote:
    "If you turn on \"Use my location\", your coordinates go to our server and to OpenStreetMap, which finds your city. AI services receive the city and state, not the coordinates.",
  providers: [
    { name: "OpenAI", privacyUrl: "https://openai.com/policies/privacy-policy" },
    { name: "Google (Gemini)", privacyUrl: "https://policies.google.com/privacy" },
    { name: "Anthropic", privacyUrl: "https://www.anthropic.com/legal/privacy" },
  ],
  routingNote:
    "Different parts of a plan can go to different providers, and if one is unavailable another may be used.",
  advice: "Please don't type children's full names, contact details or home addresses.",
};

const defaultStorage = () => globalThis.localStorage;

export function hasAiConsent(storage = defaultStorage()) {
  try {
    return storage.getItem(AI_CONSENT_KEY) === String(AI_CONSENT_VERSION);
  } catch {
    return false;
  }
}

// Returns false when the answer could not be saved (private mode, blocked storage).
export function grantAiConsent(storage = defaultStorage()) {
  try {
    storage.setItem(AI_CONSENT_KEY, String(AI_CONSENT_VERSION));
    return true;
  } catch {
    return false;
  }
}

export function withdrawAiConsent(storage = defaultStorage()) {
  try {
    storage.removeItem(AI_CONSENT_KEY);
  } catch { /* nothing was stored */ }
}
