// Wraps the browser's geolocation call so the screen can show what happened. Location comes only from the
// browser, after the visitor allows it; there is no IP-based fallback.
const PERMISSION_DENIED = 1;

export function requestBrowserLocation(geolocation, { timeoutMs = 5000 } = {}) {
  if (!geolocation || typeof geolocation.getCurrentPosition !== "function") {
    return Promise.resolve({ status: "unavailable" });
  }
  return new Promise((resolve) => {
    try {
      geolocation.getCurrentPosition(
        (position) => {
          const lat = position?.coords?.latitude;
          const lon = position?.coords?.longitude;
          if (Number.isFinite(lat) && Number.isFinite(lon)) {
            resolve({ status: "granted", location: { lat, lon, source: "gps" } });
          } else {
            resolve({ status: "error" });
          }
        },
        // A refused or dismissed prompt is code 1. Code 2 (unavailable) and 3 (timeout) are failures to try again.
        (error) => resolve({ status: error?.code === PERMISSION_DENIED ? "denied" : "error" }),
        { timeout: timeoutMs, maximumAge: 300000 },
      );
    } catch {
      resolve({ status: "error" });
    }
  });
}
