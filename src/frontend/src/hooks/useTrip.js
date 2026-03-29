import { useState, useCallback, useRef, useEffect } from "react";
import { STORAGE_KEYS, loadJSON, saveJSON } from "../utils/storage.js";
import {
  parseInput,
  generateTripPlan,
  streamTripPlan,
  generatePackingList,
  getTravelSafety,
  petTravelCheck,
  getCarSeatGuidance,
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
  const [carSeatData, setCarSeatData] = useState(null);
  const [progress, setProgress] = useState({});
  const [error, setError] = useState(null);
  const abortRef = useRef(null);

  const STEPS = ["resolve", "weather", "itinerary", "packing", "safety"];

  const markStep = (step, status) => setProgress(p => ({ ...p, [step]: status }));

  // ─── Browser back-button support ───
  // Push history entry on screen transitions; listen for popstate to go back.
  const screenRef = useRef(screen);
  screenRef.current = screen;

  useEffect(() => {
    const onPopState = (e) => {
      const target = e.state?.screen || "input";
      // If we're going back, abort in-flight fetches and reset to target screen
      if (target === "input" && screenRef.current !== "input") {
        if (abortRef.current) abortRef.current.abort();
        setScreen("input");
        setParsedInput(null);
        setProgress({});
        setError(null);
        setPackingError(null);
      } else if (target === "generating" && screenRef.current === "results") {
        setScreen("generating");
      }
    };
    window.addEventListener("popstate", onPopState);
    // Seed initial history entry
    if (!window.history.state?.screen) {
      window.history.replaceState({ screen: "input" }, "");
    }
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  // Push history when screen advances (not on back)
  const setScreenWithHistory = useCallback((next) => {
    setScreen(next);
    if (next !== "input") {
      window.history.pushState({ screen: next }, "");
    }
  }, []);

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
    setCarSeatData(null);
    setScreenWithHistory("generating");
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
      // Attach user origin coords for distance-based travel mode derivation
      parsed.originLat = geolocation?.lat || null;
      parsed.originLon = geolocation?.lon || null;
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

    const signal = abortRef.current?.signal;

    // Use SSE streaming for progressive rendering
    const streamResult = await streamTripPlan(formData, (event) => {
      if (signal?.aborted) return;

      switch (event.type) {
        case "destination":
          markStep("weather", "active");
          // Show results screen immediately with destination data
          setTripData(prev => ({
            ...prev,
            trip: event.data,
            parsed,
          }));
          break;

        case "weather":
          markStep("weather", "done");
          setTripData(prev => ({
            ...prev,
            weather: event.data,
          }));
          break;

        case "itinerary":
          markStep("itinerary", "done");
          setTripData(prev => ({
            ...prev,
            tripPlan: event.data,
            scheduledItinerary: event.scheduledItinerary || null,
            _totalChunks: event.totalChunks || 1,
            _receivedChunks: 1,
          }));
          // Transition to results screen once we have the first chunk
          setScreenWithHistory("results");
          break;

        case "itinerary-update":
          // Subsequent chunks — merge more days into existing itinerary
          setTripData(prev => ({
            ...prev,
            tripPlan: event.data,
            scheduledItinerary: event.scheduledItinerary || prev?.scheduledItinerary,
            _receivedChunks: event.chunk || ((prev?._receivedChunks || 1) + 1),
          }));
          break;

        case "packing":
          markStep("packing", "done");
          setPackingList(event.data?.categories ? event.data : event.data);
          break;

        case "fallback":
          // SSE failed, falling back to bundle -- show a brief status
          markStep("weather", "active");
          break;

        case "done": {
          // Final: ensure all data is set from accumulated result
          const result = event.data;
          const fullData = {
            trip: result.trip,
            weather: result.weather,
            tripPlan: result.tripPlan,
            scheduledItinerary: result.scheduledItinerary || null,
            parsed,
          };
          setTripData(fullData);
          saveJSON(STORAGE_KEYS.trip, fullData);
          if (result.packingList) {
            setPackingList(result.packingList);
          }
          setScreenWithHistory("results");
          break;
        }
      }
    }, signal);

    // Background safety fetches -- don't block results
    if (!signal?.aborted) {
      fetchSafetyInBackground(parsed, streamResult, signal);

      if (pets.length > 0) {
        fetchPetSafetyInBackground(pets, parsed, streamResult, signal);
      }

      const childAges = parsed.childrenAges || [];
      if (childAges.length > 0) {
        fetchCarSeatInBackground(childAges, streamResult, signal);
      }

      // If packing wasn't included in stream, fetch separately
      if (!streamResult.packingList) {
        fetchPackingInBackground(formData, signal);
      }
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

  async function fetchCarSeatInBackground(childrenAges, tripResult, signal) {
    try {
      const children = childrenAges.map(age => ({ age }));
      const result = await getCarSeatGuidance({
        destination: tripResult?.trip?.destination || "",
        jurisdictionCode: tripResult?.trip?.jurisdictionCode || "",
        tripDate: tripResult?.trip?.startDate || "",
        children,
      });
      if (signal?.aborted) return;
      setCarSeatData(result);
    } catch (err) {
      if (err.name === "AbortError" || signal?.aborted) return;
      console.warn("Car seat data error (non-blocking):", err.message);
    }
  }

  async function fetchPetSafetyInBackground(pets, parsed, tripResult, signal) {
    try {
      const countryCode = tripResult?.trip?.countryCode || "US";
      // Compute distance from user's geolocation to destination for travel mode
      let distMiles = null;
      const tripLat = tripResult?.trip?.lat;
      const tripLon = tripResult?.trip?.lon;
      const originLat = parsed.originLat;
      const originLon = parsed.originLon;
      if (tripLat && tripLon && originLat && originLon) {
        const toRad = (d) => (d * Math.PI) / 180;
        const R = 3958.8;
        const dLat = toRad(tripLat - originLat);
        const dLon = toRad(tripLon - originLon);
        const a = Math.sin(dLat / 2) ** 2 +
          Math.cos(toRad(originLat)) * Math.cos(toRad(tripLat)) * Math.sin(dLon / 2) ** 2;
        distMiles = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      }
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
    screen, tripInput, parsedInput, tripData, packingList, packingError, safetyData, petSafetyData, carSeatData,
    progress, error, STEPS,
    submitTrip, selectDestination, goBack, retryPacking,
  };
}
