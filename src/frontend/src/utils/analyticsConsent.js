// Web analytics (PostHog) runs only after the visitor says yes. The rules live here, apart from the SDK,
// so they can be tested without it.
export const CONSENT_KEY = "sr_analytics_consent";

export function readConsent(storage) {
  try {
    const value = storage?.getItem(CONSENT_KEY);
    return value === "granted" || value === "denied" ? value : null;
  } catch {
    return null;
  }
}

export function writeConsent(storage, value) {
  try {
    storage?.setItem(CONSENT_KEY, value);
  } catch {
    // Blocked storage: the choice just won't persist, and analytics stays off.
  }
}

export const shouldLoadAnalytics = ({ isProd, key, consent }) => Boolean(isProd && key && consent === "granted");
export const shouldAskConsent = ({ isProd, key, consent }) => Boolean(isProd && key && consent === null);
