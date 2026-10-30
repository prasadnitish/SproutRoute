/**
 * analytics.js — PostHog analytics wrapper
 *
 * Tracks: page views, screen transitions, trip generation funnel,
 * feature usage, session duration, drop-offs.
 *
 * Usage:
 *   import { analytics } from "../utils/analytics.js";
 *   analytics.track("trip_submitted", { destination: "NYC", duration: 3 });
 */

import posthog from "posthog-js";
import { posthogOptions } from "./analyticsConfig.js";
import { readConsent, writeConsent, shouldLoadAnalytics, shouldAskConsent } from "./analyticsConsent.js";
import { buildTripErrorProperties, buildTripSearchProperties } from "./analyticsPayloads.js";

const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_KEY || "";
// Shared URLs contain an access token in the fragment. Never send them to analytics.
const IS_PROD = import.meta.env.PROD && !/^\/s\/?$/.test(window.location.pathname);

// Initialize PostHog only in production, with a key, and after the visitor has agreed.
let initialized = false;

function store() {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

function init() {
  if (initialized) return;
  if (!shouldLoadAnalytics({ isProd: IS_PROD, key: POSTHOG_KEY, consent: readConsent(store()) })) return;
  try {
    posthog.init(POSTHOG_KEY, posthogOptions);
    initialized = true;
  } catch {
    // PostHog load failure should never break the app
  }
}

// Auto-init on import: only a visitor who already agreed on an earlier visit gets analytics.
init();

export const analytics = {
  // ── Consent ───────────────────────────────────────────────────────
  needsConsent() {
    return shouldAskConsent({ isProd: IS_PROD, key: POSTHOG_KEY, consent: readConsent(store()) });
  },
  setConsent(value) {
    writeConsent(store(), value);
    if (value === "granted") {
      init();
      if (initialized) posthog.opt_in_capturing();
    } else if (initialized) {
      posthog.opt_out_capturing();
    }
  },

  // ── Screen transitions (funnel tracking) ──────────────────────────
  screenView(screen, properties = {}) {
    if (!initialized) return;
    posthog.capture("$screen_view", { screen, ...properties });
  },

  // ── Trip funnel events ────────────────────────────────────────────
  tripSearched(text, properties = {}) {
    if (!initialized) return;
    posthog.capture("trip_searched", buildTripSearchProperties(text, properties));
  },

  tripParsed(parsed) {
    if (!initialized) return;
    posthog.capture("trip_parsed", {
      destination: parsed?.destination,
      vibe: parsed?.vibe,
      child_count: parsed?.childrenAges?.length || 0,
      pet_count: parsed?.pets?.length || 0,
      has_destination: !!parsed?.destination,
      suggested_count: parsed?.suggestedDestinations?.length || 0,
    });
  },

  destinationPicked(destination) {
    if (!initialized) return;
    posthog.capture("destination_picked", { destination });
  },

  tripGenerationStarted(destination, duration) {
    if (!initialized) return;
    posthog.capture("trip_generation_started", { destination, duration_days: duration });
  },

  tripResultsViewed(destination, loadTimeMs) {
    if (!initialized) return;
    posthog.capture("trip_results_viewed", {
      destination,
      load_time_ms: loadTimeMs,
    });
  },

  tripCompleted(destination, duration, timing) {
    if (!initialized) return;
    posthog.capture("trip_completed", {
      destination,
      duration_days: duration,
      total_ms: timing?.total,
      first_chunk_ms: timing?.firstChunk,
      ai_ms: timing?.ai,
    });
  },

  tripError(errorCode) {
    if (!initialized) return;
    posthog.capture("trip_error", buildTripErrorProperties(errorCode));
  },

  // ── Feature usage ─────────────────────────────────────────────────
  featureUsed(feature, properties = {}) {
    if (!initialized) return;
    posthog.capture("feature_used", { feature, ...properties });
  },

  profileImported(provider) {
    if (!initialized) return;
    posthog.capture("profile_imported", { provider });
  },

  vibeChipClicked(vibe) {
    if (!initialized) return;
    posthog.capture("vibe_chip_clicked", { vibe });
  },

  tabSwitched(tab) {
    if (!initialized) return;
    posthog.capture("tab_switched", { tab });
  },

  dayChanged(dayIndex) {
    if (!initialized) return;
    posthog.capture("itinerary_day_changed", { day_index: dayIndex });
  },

  activityTapped(activityName) {
    if (!initialized) return;
    posthog.capture("activity_tapped", { activity: activityName?.slice(0, 100) });
  },

  shareClicked() {
    if (!initialized) return;
    posthog.capture("share_clicked");
  },

  backClicked(fromScreen) {
    if (!initialized) return;
    posthog.capture("back_clicked", { from_screen: fromScreen });
  },

  // ── User identification (when auth is ready) ─────────────────────
  identify(userId, traits = {}) {
    if (!initialized) return;
    posthog.identify(userId, traits);
  },
};
