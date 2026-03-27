import { useState, useEffect } from "react";

export function useGeolocation() {
  const [location, setLocation] = useState(null);

  useEffect(() => {
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setLocation({ lat: pos.coords.latitude, lon: pos.coords.longitude, source: "gps" }),
        () => fallbackToIP(),
        { timeout: 5000, maximumAge: 300000 }
      );
    } else {
      fallbackToIP();
    }

    async function fallbackToIP() {
      try {
        const res = await fetch("/api/v1/geo/detect");
        if (res.ok) {
          const data = await res.json();
          setLocation({ lat: data.lat, lon: data.lon, region: data.region, source: "ip" });
        }
      } catch { /* silent fail */ }
    }
  }, []);

  return location;
}
