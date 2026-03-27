import { useState, useCallback } from "react";
import { STORAGE_KEYS, loadJSON, saveJSON } from "../utils/storage.js";

export function useTrip() {
  const [screen, setScreen] = useState("input"); // "input" | "generating" | "results"
  const [tripInput, setTripInput] = useState("");
  const [parsedInput, setParsedInput] = useState(null);
  const [tripData, setTripData] = useState(() => loadJSON(STORAGE_KEYS.trip));
  const [packingList, setPackingList] = useState(null);
  const [safetyData, setSafetyData] = useState(null);
  const [petSafetyData, setPetSafetyData] = useState(null);
  const [progress, setProgress] = useState({});
  const [error, setError] = useState(null);

  const STEPS = ["resolve", "weather", "itinerary", "packing", "safety"];

  const markStep = (step, status) => setProgress(p => ({ ...p, [step]: status }));

  const submitTrip = useCallback(async (text, geolocation) => {
    setTripInput(text);
    setError(null);
    setTripData(null);
    setPackingList(null);
    setSafetyData(null);
    setPetSafetyData(null);
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

    const pets = parsed.pets || [];
    const formData = {
      destination: parsed.destination,
      startDate: parsed.startDate,
      endDate: parsed.endDate,
      adults: parsed.adults,
      childrenAges: parsed.childrenAges,
      activities: [parsed.vibe],
      foodPreferences: parsed.foodPreferences || null,
      pets,
    };

    // Call existing /api/trip-plan endpoint
    const tripRes = await fetch("/api/trip-plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(formData),
    });
    if (!tripRes.ok) {
      const errBody = await tripRes.json().catch(() => ({}));
      throw new Error(errBody.error || errBody.message || "Failed to generate trip plan");
    }
    let tripResult;
    try {
      tripResult = await tripRes.json();
    } catch {
      throw new Error("Server returned an invalid response. Please try again.");
    }
    markStep("weather", "done");
    markStep("itinerary", "done");

    // Save and transition to results IMMEDIATELY — don't wait for packing/safety
    const fullData = { ...tripResult, parsed };
    setTripData(fullData);
    saveJSON(STORAGE_KEYS.trip, fullData);
    setScreen("results");

    // Step 3 & 4: Packing list + Safety — run in background while user views itinerary
    fetchPackingInBackground(formData);
    fetchSafetyInBackground(parsed, tripResult);

    // Step 5: Pet travel safety — run in background if pets present
    if (pets.length > 0) {
      fetchPetSafetyInBackground(pets, parsed, tripResult);
    }
  }

  // Background fetchers — run after results screen is shown
  async function fetchPackingInBackground(formData) {
    markStep("packing", "active");
    try {
      const packRes = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      if (packRes.ok) {
        const packData = await packRes.json();
        setPackingList(packData.packingList || packData);
      } else {
        console.warn("Packing list failed:", packRes.status);
      }
    } catch (err) {
      console.warn("Packing list error (non-blocking):", err.message);
    }
    markStep("packing", "done");
  }

  async function fetchSafetyInBackground(parsed, tripResult) {
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
      } else {
        console.warn("Safety data failed:", safetyRes.status);
      }
    } catch (err) {
      console.warn("Safety data error (non-blocking):", err.message);
    }
    markStep("safety", "done");
  }

  async function fetchPetSafetyInBackground(pets, parsed, tripResult) {
    try {
      const petRes = await fetch("/api/v1/safety/pet-travel-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pets,
          destination: parsed.destination,
          countryCode: tripResult?.trip?.countryCode || "",
          travelMode: null, // let backend derive from distance
        }),
      });
      if (petRes.ok) {
        setPetSafetyData(await petRes.json());
      } else {
        console.warn("Pet safety data failed:", petRes.status);
      }
    } catch (err) {
      console.warn("Pet safety data error (non-blocking):", err.message);
    }
  }

  const goBack = useCallback(() => {
    setScreen("input");
    setParsedInput(null);
    setProgress({});
    setError(null);
  }, []);

  return {
    screen, tripInput, parsedInput, tripData, packingList, safetyData, petSafetyData,
    progress, error, STEPS,
    submitTrip, selectDestination, goBack,
  };
}
