import { useState, useEffect } from "react";

// Location comes only from the browser, after the visitor allows it. There is deliberately no IP-based
// fallback: that sent the visitor's address to a third party before any consent. Without a location the
// trip request simply has no origin coordinates.
export function useGeolocation() {
  const [location, setLocation] = useState(null);

  useEffect(() => {
    if (!("geolocation" in navigator)) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setLocation({ lat: pos.coords.latitude, lon: pos.coords.longitude, source: "gps" }),
      () => {},
      { timeout: 5000, maximumAge: 300000 },
    );
  }, []);

  return location;
}
