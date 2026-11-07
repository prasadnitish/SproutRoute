export const SHARE_PRIVACY_NOTICE = 'Public link: anyone with the link can view this itinerary. The original prompt and imported profile are not shared.';
export const shareOwnerKey = token => `sproutroute_share_owner:${token}`;
export function forgetShareOwner(token) {
  try { localStorage.removeItem(shareOwnerKey(token)); } catch { /* Storage may be disabled. */ }
}
export const formatShareExpiry = expiresAt => new Date(expiresAt).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
export const APP_STORE_URL = 'https://apps.apple.com/app/id6759532704';
// iPadOS 13+ reports a Mac user agent, so a touch-capable "Macintosh" counts as an iPad.
export const isAppleMobile = (nav = globalThis.navigator) =>
  /iPhone|iPad|iPod/.test(nav?.userAgent || '') || (/Macintosh/.test(nav?.userAgent || '') && nav?.maxTouchPoints > 1);
export const planYourOwnHref = nav => (isAppleMobile(nav) ? APP_STORE_URL : '/');
