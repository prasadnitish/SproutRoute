import { useState, useCallback, useRef } from "react";
import { STORAGE_KEYS, loadJSON, saveJSON } from "../utils/storage.js";
import {
  parseInput,
  generateTripPlan,
  generatePackingList,
  getTravelSafety,
  petTravelCheck,
} from "../services/api.js";

export function useTrip() {
  const [screen, setScreen] = useState("input"); // "input" | "generating" | "results"
  const [tripInput, setTripInput] = useState("");
  const [parsedInput, setParsedInput] = useState(null);
  const [tripData, setTripData] = useState(() => loadJSON(STORAGE_KEYS.trip));
  const [packingList, setPackingList] = useState(null);
  const [packingError, setPackingError] = useState(null);
  const [safetyData, setSafetyData] = useState(null);
  const [petSafetyData, setPetSafetyData] = useState(null);
  const [progress, setProgress] = useState({});
  const [error, setError] = useState(null);
  const abortRef = useRef(null);

  const STEPS = ["resolve", "weather", "itinerary", "packing", "safety"];

  const markStep = (step, status) => setProgress(p => ({ ...p, [step]: status }));

  const submitTrip = useCallback(async (text, geolocation) => {
    // Abort any in-flight background fetches from a previous submission
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();

    setTripInput(text);
    setError(null);
    setTripData(null);
    setPackingList(null);
    setPackingError(null);
    setSafetyData(null);
    setPetSafetyData(null);
    setScreen("generating");
    setProgress({});

    try {
      // Step 1: Parse input via AI
      markStep("resolve", "active");
      const parsed = await parseInput({
        text,
        detectedLat: geolocation?.lat || null,
        detectedLon: geolocation?.lon || null,
      });
      setParsedInput(parsed);
      markStep("resolve", "done");

      // If no destination, show destination picker (don't continue generation)
      if (!parsed.destination && parsed.suggestedDestinations?.length > 0) {
        return;
      }

      await generateTrip(parsed);
    } catch (err) {
      if (err.name === "AbortError") return;
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
      if (err.name === "AbortError") return;
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

    const tripResult = await generateTripPlan(formData);
    markStep("weather", "done");
    markStep("itinerary", "done");

    // Save and transition to results IMMEDIATELY -- don't wait for packing/safety
    const fullData = { ...tripResult, parsed };
    setTripData(fullData);
    saveJSON(STORAGE_KEYS.trip, fullData);
    setScreen("results");

    // Step 3 & 4: Packing list + Safety -- run in background while user views itinerary
    const signal = abortRef.current?.signal;
    fetchPackingInBackground(formData, signal);
    fetchSafetyInBackground(parsed, tripResult, signal);

    // Step 5: Pet travel safety -- run in background if pets present
    if (pets.length > 0) {
      fetchPetSafetyInBackground(pets, parsed, tripResult, signal);
    }
  }

  // Background fetchers -- run after results screen is shown
  async function fetchPackingInBackground(formData, signal) {
    markStep("packing", "active");
    setPackingError(null);
    try {
      const packData = await generatePackingList(formData);
      if (signal?.aborted) return;
      setPackingList(packData.packingList || packData);
    } catch (err) {
      if (err.name === "AbortError" || signal?.aborted) return;
      console.warn("Packing list error (non-blocking):", err.message);
      setPackingError(err.message || "Failed to generate packing list");
    }
    markStep("packing", "done");
  }

  async function fetchSafetyInBackground(parsed, tripResult, signal) {
    markStep("safety", "active");
    try {
      const safetyResult = await getTravelSafety({
        destination: parsed.destination,
        childrenAges: parsed.childrenAges,
        countryCode: tripResult?.trip?.countryCode || "",
      });
      if (signal?.aborted) return;
      setSafetyData(safetyResult);
    } catch (err) {
      if (err.name === "AbortError" || signal?.aborted) return;
      console.warn("Safety data error (non-blocking):", err.message);
    }
    markStep("safety", "done");
  }

  async function fetchPetSafetyInBackground(pets, parsed, tripResult, signal) {
    try {
      // Derive travel mode: if distance > 300 miles or different country, assume fly
      const distMiles = tripResult?.trip?.distanceMiles;
      const countryCode = tripResult?.trip?.countryCode || "US";
      const derivedMode = (distMiles && distMiles > 300) || (countryCode !== "US") ? "fly" : "drive";

      const result = await petTravelCheck({
        pets,
        destination: parsed.destination,
        countryCode,
        travelMode: derivedMode,
      });
      if (signal?.aborted) return;
      setPetSafetyData(result);
    } catch (err) {
      if (err.name === "AbortError" || signal?.aborted) return;
      console.warn("Pet safety data error (non-blocking):", err.message);
    }
  }

  const retryPacking = useCallback(async () => {
    if (!tripData?.parsed) return;
    const parsed = tripData.parsed;
    const formData = {
      destination: parsed.destination,
      startDate: parsed.startDate,
      endDate: parsed.endDate,
      adults: parsed.adults,
      childrenAges: parsed.childrenAges,
      activities: [parsed.vibe],
      foodPreferences: parsed.foodPreferences || null,
      pets: parsed.pets || [],
    };
    await fetchPackingInBackground(formData, abortRef.current?.signal);
  }, [tripData]);

  const goBack = useCallback(() => {
    // Abort background fetches before going back
    if (abortRef.current) abortRef.current.abort();
    setScreen("input");
    setParsedInput(null);
    setProgress({});
    setError(null);
    setPackingError(null);
  }, []);

  return {
    screen, tripInput, parsedInput, tripData, packingList, packingError, safetyData, petSafetyData,
    progress, error, STEPS,
    submitTrip, selectDestination, goBack, retryPacking,
  };
}
