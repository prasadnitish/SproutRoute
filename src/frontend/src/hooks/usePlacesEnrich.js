import { useState, useCallback, useRef } from "react";

export function usePlacesEnrich() {
  const [enrichedData, setEnrichedData] = useState({});
  const inflight = useRef(new Set());

  const enrich = useCallback(async (activityName, destination, category) => {
    const key = `${activityName}||${destination}`;
    if (enrichedData[key] || inflight.current.has(key)) return enrichedData[key] || null;

    inflight.current.add(key);
    try {
      const res = await fetch("/api/v1/places/enrich", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activityName, destination, category }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      setEnrichedData(prev => ({ ...prev, [key]: data }));
      return data;
    } catch { return null; }
    finally { inflight.current.delete(key); }
  }, [enrichedData]);

  return { enrichedData, enrich };
}
