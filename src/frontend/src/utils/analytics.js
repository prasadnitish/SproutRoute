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

const POSTHOG_KEY = "phc_wBjTWgSgehJihP26nm7fAuTtWW8QBqBXiv6Siuv3UWtc";
const IS_PROD = import.meta.env.PROD;

// Initialize PostHog (only in production to avoid dev noise)
let initialized = false;

function init() {
  if (initialized || !IS_PROD) return;
  try {
    posthog.init(POSTHOG_KEY, {
      api_host: "https://us.i.posthog.com",
      person_profiles: "identified_only",
      capture_pageview: true,
      capture_pageleave: true,
      autocapture: true, // Clicks, form submits, page views
      session_recording: {
        maskAllInputs: false, // Show what users type (trip queries)
        maskInputOptions: { password: true },
      },
      persistence: "localStorage",
    });
    initialized = true;
  } catch {
    // PostHog load failure should never break the app
  }
}

// Auto-init on import
init();

export const analytics = {
  // ── Screen transitions (funnel tracking) ──────────────────────────
  screenView(screen, properties = {}) {
    if (!IS_PROD) return;
    posthog.capture("$screen_view", { screen, ...properties });
  },

  // ── Trip funnel events ────────────────────────────────────────────
  tripSearched(text, properties = {}) {
    if (!IS_PROD) return;
    posthog.capture("trip_searched", {
      search_text: text?.slice(0, 200),
      ...properties,
    });
  },

  tripParsed(parsed) {
    if (!IS_PROD) return;
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
    if (!IS_PROD) return;
    posthog.capture("destination_picked", { destination });
  },

  tripGenerationStarted(destination, duration) {
    if (!IS_PROD) return;
    posthog.capture("trip_generation_started", { destination, duration_days: duration });
  },

  tripResultsViewed(destination, loadTimeMs) {
    if (!IS_PROD) return;
    posthog.capture("trip_results_viewed", {
      destination,
      load_time_ms: loadTimeMs,
    });
  },

  tripCompleted(destination, duration, timing) {
    if (!IS_PROD) return;
    posthog.capture("trip_completed", {
      destination,
      duration_days: duration,
      total_ms: timing?.total,
      first_chunk_ms: timing?.firstChunk,
      ai_ms: timing?.ai,
    });
  },

  tripError(error, destination) {
    if (!IS_PROD) return;
    posthog.capture("trip_error", {
      error: error?.slice(0, 200),
      destination,
    });
  },

  // ── Feature usage ─────────────────────────────────────────────────
  featureUsed(feature, properties = {}) {
    if (!IS_PROD) return;
    posthog.capture("feature_used", { feature, ...properties });
  },

  profileImported(provider) {
    if (!IS_PROD) return;
    posthog.capture("profile_imported", { provider });
  },

  vibeChipClicked(vibe) {
    if (!IS_PROD) return;
    posthog.capture("vibe_chip_clicked", { vibe });
  },

  tabSwitched(tab) {
    if (!IS_PROD) return;
    posthog.capture("tab_switched", { tab });
  },

  dayChanged(dayIndex) {
    if (!IS_PROD) return;
    posthog.capture("itinerary_day_changed", { day_index: dayIndex });
  },

  activityTapped(activityName) {
    if (!IS_PROD) return;
    posthog.capture("activity_tapped", { activity: activityName?.slice(0, 100) });
  },

  shareClicked() {
    if (!IS_PROD) return;
    posthog.capture("share_clicked");
  },

  backClicked(fromScreen) {
    if (!IS_PROD) return;
    posthog.capture("back_clicked", { from_screen: fromScreen });
  },

  // ── User identification (when auth is ready) ─────────────────────
  identify(userId, traits = {}) {
    if (!IS_PROD) return;
    posthog.identify(userId, traits);
  },
};
