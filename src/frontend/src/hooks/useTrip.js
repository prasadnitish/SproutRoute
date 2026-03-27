import { useState, useCallback } from "react";
import { STORAGE_KEYS, loadJSON, saveJSON } from "../utils/storage.js";

export function useTrip() {
  const [screen, setScreen] = useState("input"); // "input" | "generating" | "results"
  const [tripInput, setTripInput] = useState("");
  const [parsedInput, setParsedInput] = useState(null);
  const [tripData, setTripData] = useState(() => loadJSON(STORAGE_KEYS.trip));
  const [packingList, setPackingList] = useState(null);
  const [safetyData, setSafetyData] = useState(null);
  const [progress, setProgress] = useState({});
  const [error, setError] = useState(null);

  const STEPS = ["resolve", "weather", "itinerary", "packing", "safety"];

  const markStep = (step, status) => setProgress(p => ({ ...p, [step]: status }));

  const submitTrip = useCallback(async (text, geolocation) => {
    setTripInput(text);
    setError(null);
    setScreen("generating");
    setProgress({});

    try {
      // Step 1: Parse input via AI
      markStep("resolve", "active");
      const res = await fetch("/api/v1/trip/parse-input", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          detectedLat: geolocation?.lat || null,
          detectedLon: geolocation?.lon || null,
        }),
      });
      if (!res.ok) throw new Error("Failed to parse input");
      const parsed = await res.json();
      setParsedInput(parsed);
      markStep("resolve", "done");

      // If no destination, show destination picker (don't continue generation)
      if (!parsed.destination && parsed.suggestedDestinations?.length > 0) {
        return;
      }

      await generateTrip(parsed);
    } catch (err) {
      setError(err.message || "Something went wrong");
    }
  }, []);

  const selectDestination = useCallback(async (destinationName) => {
    if (!parsedInput) return;
    const updated = { ...parsedInput, destination: destinationName, suggestedDestinations: [] };
    setParsedInput(updated);
    try {
      await generateTrip(updated);
    } catch (err) {
      setError(err.message || "Something went wrong");
    }
  }, [parsedInput]);

  async function generateTrip(parsed) {
    // Step 2: Trip plan (weather + itinerary) using existing endpoint
    markStep("weather", "active");

    const formData = {
      destination: parsed.destination,
      startDate: parsed.startDate,
      endDate: parsed.endDate,
      adults: parsed.adults,
      childrenAges: parsed.childrenAges,
      activities: [parsed.vibe],
      foodPreferences: parsed.foodPreferences || null,
    };

    // Call existing /api/trip-plan endpoint
    const tripRes = await fetch("/api/trip-plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(formData),
    });
    if (!tripRes.ok) {
      const errBody = await tripRes.json().catch(() => ({}));
      throw new Error(errBody.message || "Failed to generate trip plan");
    }
    const tripResult = await tripRes.json();
    markStep("weather", "done");
    markStep("itinerary", "done");

    // Step 3: Packing list (non-blocking)
    markStep("packing", "active");
    try {
      const packRes = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      if (packRes.ok) {
        setPackingList(await packRes.json());
      }
    } catch { /* non-blocking */ }
    markStep("packing", "done");

    // Step 4: Safety (non-blocking)
    markStep("safety", "active");
    try {
      const safetyRes = await fetch("/api/safety/travel-tips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          destination: parsed.destination,
          childrenAges: parsed.childrenAges,
          countryCode: tripResult?.trip?.countryCode || "",
        }),
      });
      if (safetyRes.ok) {
        setSafetyData(await safetyRes.json());
      }
    } catch { /* non-blocking */ }
    markStep("safety", "done");

    // Save and transition to results
    const fullData = { ...tripResult, parsed };
    setTripData(fullData);
    saveJSON(STORAGE_KEYS.trip, fullData);
    setScreen("results");
  }

  const goBack = useCallback(() => {
    setScreen("input");
    setParsedInput(null);
    setProgress({});
    setError(null);
  }, []);

  return {
    screen, tripInput, parsedInput, tripData, packingList, safetyData,
    progress, error, STEPS,
    submitTrip, selectDestination, goBack,
  };
}
