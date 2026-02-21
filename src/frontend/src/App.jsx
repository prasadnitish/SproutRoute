// Main app: handles the step-by-step wizard, API calls, and result screens.
import { useState, useEffect } from "react";
import { format, addDays, differenceInDays } from "date-fns";
import TripPlanDisplay from "./components/TripPlanDisplay";
import PackingChecklist from "./components/PackingChecklist";
import TravelSafetyCard from "./components/TravelSafetyCard";
import {
  generateTripPlan,
  generatePackingList,
  getCarSeatGuidance,
  resolveDestination,
} from "./services/api";

// Shield + compass logo mark matching the SproutRoute brand asset
function LogoMark() {
  return (
    <svg
      width="36"
      height="36"
      viewBox="0 0 36 36"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {/* Shield */}
      <path
        d="M18 2L4 8v10c0 8.4 5.9 15.5 14 17 8.1-1.5 14-8.6 14-17V8L18 2z"
        fill="#2E7D32"
        stroke="#C8A84B"
        strokeWidth="1.5"
      />
      {/* Sky band */}
      <path
        d="M6 14v4c0 .6.02 1.2.06 1.8h23.88c.04-.6.06-1.2.06-1.8v-4H6z"
        fill="#4FC3F7"
        opacity="0.5"
      />
      {/* Green hills */}
      <ellipse cx="10" cy="22" rx="7" ry="4" fill="#43A047" opacity="0.7" />
      <ellipse cx="26" cy="22" rx="7" ry="4" fill="#43A047" opacity="0.7" />
      {/* Winding road */}
      <path
        d="M18 30 C16 27 14 24 16 20 C18 16 20 18 18 14"
        stroke="#C8A84B"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
        opacity="0.9"
      />
      {/* Compass rose — 4 points */}
      <g transform="translate(18,22)">
        <polygon points="0,-4 1,-1 0,0 -1,-1" fill="#C8A84B" />
        <polygon points="0,4 1,1 0,0 -1,1" fill="#795548" />
        <polygon points="-4,0 -1,-1 0,0 -1,1" fill="#C8A84B" />
        <polygon points="4,0 1,-1 0,0 1,1" fill="#795548" />
        <circle cx="0" cy="0" r="1" fill="#FDFDFD" />
      </g>
      {/* Sun */}
      <circle cx="10" cy="12" r="2.5" fill="#FFCA28" />
      <circle cx="10" cy="12" r="1.5" fill="#FFD54F" />
    </svg>
  );
}

function App() {
  // Single orchestrator component for MVP:
  // keeps wizard flow, API lifecycle, and local persistence in one predictable place.
  const today = format(new Date(), "yyyy-MM-dd");
  const tomorrow = format(addDays(new Date(), 1), "yyyy-MM-dd");

  // Step state: wizard vs results, plus which wizard question is active.
  const [step, setStep] = useState("wizard");
  const [wizardStep, setWizardStep] = useState("destination");
  const [tripData, setTripData] = useState(null);
  const [tripPlan, setTripPlan] = useState(null);
  const [weather, setWeather] = useState(null);
  const [packingList, setPackingList] = useState(null);
  const [safetyGuidance, setSafetyGuidance] = useState(null);
  const [showCustomize, setShowCustomize] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  // Wizard input state.
  const [destinationQuery, setDestinationQuery] = useState("");
  const [destinationSuggestions, setDestinationSuggestions] = useState([]);
  const [resolvedDestination, setResolvedDestination] = useState("");

  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(tomorrow);
  const [numChildren, setNumChildren] = useState(1);
  const [childAges, setChildAges] = useState([2]);
  const [childWeights, setChildWeights] = useState([""]);
  const [childHeights, setChildHeights] = useState([""]);

  const buildChildrenPayload = () => {
    return childAges.slice(0, numChildren).map((age, index) => {
      const child = { age };
      const weight = Number.parseFloat(childWeights[index]);
      const height = Number.parseFloat(childHeights[index]);

      if (Number.isFinite(weight) && weight > 0) {
        child.weightLb = Math.round(weight * 10) / 10;
      }

      if (Number.isFinite(height) && height > 0) {
        child.heightIn = Math.round(height * 10) / 10;
      }

      return child;
    });
  };

  const buildCustomizedTripPlan = (currentTripPlan, approvedActivities) => {
    if (!currentTripPlan) return currentTripPlan;

    const selectedIds = new Set((approvedActivities || []).map((a) => a.id));
    const filteredItinerary = (currentTripPlan.dailyItinerary || [])
      .map((day) => ({
        ...day,
        activities: (day.activities || []).filter((id) => selectedIds.has(id)),
      }))
      .filter(
        (day) =>
          (day.activities && day.activities.length > 0) ||
          (typeof day.meals === "string" && day.meals.trim().length > 0) ||
          (typeof day.notes === "string" && day.notes.trim().length > 0),
      );

    return {
      ...currentTripPlan,
      suggestedActivities: approvedActivities,
      dailyItinerary: filteredItinerary,
    };
  };

  // Restore previous trip from localStorage, subject to a 7-day TTL.
  const SAVED_TRIP_TTL_MS = 7 * 24 * 60 * 60 * 1000;
  useEffect(() => {
    const savedData = localStorage.getItem("sproutroute_trip");
    if (savedData) {
      try {
        const parsed = JSON.parse(savedData);

        // Purge stale data so children's personal details don't linger indefinitely.
        if (parsed.lastModified) {
          const ageMs = Date.now() - new Date(parsed.lastModified).getTime();
          if (ageMs > SAVED_TRIP_TTL_MS) {
            localStorage.removeItem("sproutroute_trip");
            localStorage.removeItem("sproutroute_checked");
            return;
          }
        }

        if (parsed.trip) {
          setTripData(parsed.trip);
          setTripPlan(parsed.tripPlan);
          setWeather(parsed.weather);
          setPackingList(parsed.packingList);
          setSafetyGuidance(parsed.safetyGuidance || null);
          setResolvedDestination(parsed.trip.destination || "");
          setStartDate(parsed.trip.startDate || today);
          setEndDate(parsed.trip.endDate || tomorrow);
          const savedChildren = parsed.trip.children || [];
          setNumChildren(savedChildren.length || 0);
          setChildAges(savedChildren.map((c) => c.age));
          setChildWeights(
            savedChildren.map((c) =>
              Number.isFinite(c.weightLb) ? String(c.weightLb) : "",
            ),
          );
          setChildHeights(
            savedChildren.map((c) =>
              Number.isFinite(c.heightIn) ? String(c.heightIn) : "",
            ),
          );
          setStep("results");
        } else if (parsed.packingList) {
          // Legacy format missing trip metadata — clear so it stops re-triggering.
          localStorage.removeItem("sproutroute_trip");
        }
      } catch (err) {
        console.error("Failed to load saved trip:", err);
      }
    }
  }, []);

  // Step 1: resolve destination intent into a concrete city or suggestions.
  const handleResolveDestination = async () => {
    if (!destinationQuery.trim()) {
      setError("Please enter a destination.");
      return;
    }
    setIsLoading(true);
    setError(null);

    try {
      const result = await resolveDestination(destinationQuery.trim());
      if (result.mode === "suggestions") {
        setDestinationSuggestions(result.suggestions || []);
        setWizardStep("suggestions");
      } else {
        setResolvedDestination(result.destination);
        setWizardStep("dates");
      }
    } catch (err) {
      setError(err.message || "Failed to resolve destination");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectSuggestion = (place) => {
    setResolvedDestination(place.displayName || place.name);
    setWizardStep("dates");
  };

  const handleUseOriginalDestination = () => {
    setResolvedDestination(destinationQuery.trim());
    setWizardStep("dates");
  };

  const handleNextDates = () => {
    if (!startDate || !endDate) {
      setError("Please select both dates.");
      return;
    }
    if (endDate <= startDate) {
      setError("End date must be after start date.");
      return;
    }
    const days = differenceInDays(new Date(endDate), new Date(startDate));
    if (days > 14) {
      setError("Trip duration cannot exceed 14 days.");
      return;
    }
    setError(null);
    setWizardStep("kids");
  };

  // Step 3: generate trip plan + packing list together.
  const handleGeneratePlan = async () => {
    setIsLoading(true);
    setError(null);

    const children = buildChildrenPayload();
    const formData = {
      destination: resolvedDestination,
      startDate,
      endDate,
      duration: differenceInDays(new Date(endDate), new Date(startDate)),
      children,
    };

    try {
      const result = await generateTripPlan(formData);
      setTripData(result.trip || formData);
      setTripPlan(result.tripPlan);
      setWeather(result.weather);

      const safeChildren = (result.trip?.children || children).filter(
        (c) => Number.isFinite(c.weightLb) || Number.isFinite(c.heightIn),
      );
      const safetyResult =
        safeChildren.length > 0
          ? getCarSeatGuidance({
              destination: result.trip.destination || formData.destination,
              jurisdictionCode: result.trip.jurisdictionCode || "",
              tripDate: result.trip.startDate || startDate,
              children: safeChildren,
            }).catch(() => ({
              status: "Unavailable",
              jurisdictionCode: result.trip.jurisdictionCode || null,
              jurisdictionName:
                result.trip.jurisdictionName || "Not found in repo",
              message:
                "Safety guidance is unavailable right now. Please verify rules manually.",
              sourceUrl: null,
              effectiveDate: "Not found in repo",
              lastUpdated: "Not found in repo",
              results: safeChildren.map((_, index) => ({
                childId: `child-${index + 1}`,
                status: "Unavailable",
                requiredRestraintLabel: "Not found in repo",
                seatPosition: "not_found",
                rationale: "Safety guidance unavailable.",
              })),
            }))
          : Promise.resolve(null);

      const packingData = {
        ...(result.trip || formData),
        activities: result.tripPlan?.suggestedActivities?.map(
          (a) => a.category,
        ),
        approvedActivities: result.tripPlan?.suggestedActivities,
        weather: result.weather,
      };

      const [packingResult, safetyResolved] = await Promise.all([
        generatePackingList(packingData),
        safetyResult,
      ]);

      setPackingList(packingResult.packingList);
      setSafetyGuidance(safetyResolved);
      setStep("results");

      const dataToSave = {
        trip: result.trip || formData,
        weather: result.weather,
        tripPlan: result.tripPlan,
        packingList: packingResult.packingList,
        safetyGuidance: safetyResolved,
        lastModified: new Date().toISOString(),
      };
      localStorage.setItem("sproutroute_trip", JSON.stringify(dataToSave));
    } catch (err) {
      setError(err.message || "Failed to generate trip plan");
    } finally {
      setIsLoading(false);
    }
  };

  // Optional: regenerate packing list based on selected activities.
  const handleApprovePlan = async (approvedActivities) => {
    setIsLoading(true);
    setError(null);

    try {
      const activityCategories = approvedActivities.map((a) => a.category);
      const updatedTripData = {
        ...tripData,
        activities: activityCategories,
      };
      const updatedTripPlan = buildCustomizedTripPlan(
        tripPlan,
        approvedActivities,
      );

      const packingData = {
        ...updatedTripData,
        activities: activityCategories,
        approvedActivities,
      };

      const result = await generatePackingList(packingData);

      setTripData(updatedTripData);
      setTripPlan(updatedTripPlan);
      setPackingList(result.packingList);
      setShowCustomize(false);

      const dataToSave = {
        trip: updatedTripData,
        weather,
        tripPlan: updatedTripPlan,
        packingList: result.packingList,
        safetyGuidance,
        lastModified: new Date().toISOString(),
      };
      localStorage.setItem("sproutroute_trip", JSON.stringify(dataToSave));
    } catch (err) {
      setError(err.message || "Failed to generate packing list");
    } finally {
      setIsLoading(false);
    }
  };

  // Clear state and localStorage for a fresh start.
  const handleReset = () => {
    setStep("wizard");
    setWizardStep("destination");
    setTripData(null);
    setTripPlan(null);
    setWeather(null);
    setPackingList(null);
    setSafetyGuidance(null);
    setError(null);
    setDestinationQuery("");
    setResolvedDestination("");
    setDestinationSuggestions([]);
    setStartDate(today);
    setEndDate(tomorrow);
    setNumChildren(1);
    setChildAges([2]);
    setChildWeights([""]);
    setChildHeights([""]);
    localStorage.removeItem("sproutroute_trip");
    localStorage.removeItem("sproutroute_checked");
  };

  // Wizard back navigation.
  const handleBack = () => {
    if (wizardStep === "kids") setWizardStep("dates");
    if (wizardStep === "dates") setWizardStep("destination");
    if (wizardStep === "suggestions") setWizardStep("destination");
  };

  // Wizard progress — 3 steps
  const wizardStepIndex = { destination: 1, suggestions: 1, dates: 2, kids: 3 };
  const currentStepNum = wizardStepIndex[wizardStep] || 1;

  return (
    <div className="min-h-screen bg-paper text-slate-text relative overflow-hidden">
      {/* ── Top nav ───────────────────────────────────────────── */}
      <header className="sticky top-0 z-20 bg-white/95 backdrop-blur-sm border-b border-sprout-light shadow-soft">
        <div className="mx-auto max-w-6xl px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <LogoMark />
            <div>
              <span className="font-heading text-xl font-bold text-earth leading-none">
                SproutRoute
              </span>
              <p className="text-xs text-muted leading-none mt-0.5 hidden sm:block">
                Growing little explorers, one trip at a time.
              </p>
            </div>
          </div>
          {step === "results" && (
            <button
              onClick={handleReset}
              className="text-xs font-semibold uppercase tracking-wider text-muted hover:text-sprout-dark transition-colors px-3 py-1.5 rounded-xl hover:bg-sprout-light"
            >
              ↩ Start Over
            </button>
          )}
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-6 py-8 relative z-10">
        <main className="grid gap-6 lg:grid-cols-[1fr_280px]">
          {/* ── Main panel ──────────────────────────────────────── */}
          <section className="min-h-[60vh] rounded-2xl border border-sprout-light bg-white shadow-soft p-8">
            {/* Error banner */}
            {error && (
              <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex items-start gap-2">
                <span className="text-base">⚠️</span>
                <span>{error}</span>
              </div>
            )}

            {/* ── WIZARD ──────────────────────────────────────── */}
            {step === "wizard" && (
              <div
                key={wizardStep}
                className="wizard-step flex min-h-[48vh] flex-col justify-center gap-6"
              >
                {/* Progress dots */}
                <div className="flex items-center gap-2">
                  {[1, 2, 3].map((n) => (
                    <div
                      key={n}
                      className={`h-2 rounded-full transition-all duration-300 ${
                        n < currentStepNum
                          ? "w-8 bg-sprout-dark"
                          : n === currentStepNum
                            ? "w-8 bg-sky-base"
                            : "w-4 bg-sprout-light"
                      }`}
                    />
                  ))}
                  <span className="text-xs text-muted ml-1">
                    Step {currentStepNum} of 3
                  </span>
                </div>

                {/* ── Step 1: Destination ── */}
                {wizardStep === "destination" && (
                  <>
                    <div>
                      <h2 className="font-heading text-3xl md:text-4xl font-bold text-sprout-dark">
                        Where are you headed? 🗺️
                      </h2>
                      <p className="text-muted mt-2">
                        Try "Seattle, WA" or "2 hour drive from Seattle."
                      </p>
                    </div>
                    <input
                      type="text"
                      value={destinationQuery}
                      onChange={(e) => setDestinationQuery(e.target.value)}
                      onKeyDown={(e) =>
                        e.key === "Enter" && handleResolveDestination()
                      }
                      placeholder="Type your destination..."
                      className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-4 text-xl text-slate-text placeholder:text-muted focus:border-sprout-base focus:ring-2 focus:ring-sprout-light focus:outline-none transition"
                    />
                    <div>
                      <button
                        onClick={handleResolveDestination}
                        disabled={isLoading}
                        className="rounded-xl bg-sprout-dark text-white py-3 px-8 font-semibold text-sm hover:bg-sprout-base transition-colors disabled:opacity-60 shadow-soft"
                      >
                        {isLoading ? "Finding places..." : "Continue →"}
                      </button>
                    </div>
                  </>
                )}

                {/* ── Step 1b: Suggestions ── */}
                {wizardStep === "suggestions" && (
                  <>
                    <div>
                      <h2 className="font-heading text-3xl md:text-4xl font-bold text-sprout-dark">
                        Pick a destination 📍
                      </h2>
                      <p className="text-muted mt-2">
                        These places match your request — choose one to
                        continue.
                      </p>
                    </div>
                    <div className="space-y-3">
                      {destinationSuggestions.map((place) => (
                        <button
                          key={`${place.displayName}-${place.distanceMiles}`}
                          onClick={() => handleSelectSuggestion(place)}
                          className="w-full rounded-xl border border-sprout-light bg-white px-5 py-4 text-left transition hover:border-sprout-base hover:shadow-soft group"
                        >
                          <div className="text-base font-semibold text-slate-text group-hover:text-sprout-dark">
                            {place.displayName || place.name}
                          </div>
                          <div className="text-xs text-muted mt-0.5">
                            About {place.distanceMiles} miles away
                          </div>
                        </button>
                      ))}
                    </div>
                    <div className="flex flex-wrap items-center gap-4">
                      <button
                        onClick={handleUseOriginalDestination}
                        className="text-sm font-semibold text-sprout-dark hover:text-sprout-base transition-colors"
                      >
                        Use my original input instead
                      </button>
                      <button
                        onClick={handleBack}
                        className="text-sm text-muted hover:text-slate-text transition-colors"
                      >
                        ← Back
                      </button>
                    </div>
                  </>
                )}

                {/* ── Step 2: Dates ── */}
                {wizardStep === "dates" && (
                  <>
                    <div>
                      <h2 className="font-heading text-3xl md:text-4xl font-bold text-sprout-dark">
                        When are you going? 📅
                      </h2>
                      <p className="text-muted mt-2">
                        Select your trip start and end dates (max 14 days).
                      </p>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <label className="block text-sm font-medium text-slate-text">
                        Start date
                        <input
                          type="date"
                          value={startDate}
                          onChange={(e) => {
                            const newStart = e.target.value;
                            setStartDate(newStart);
                            if (endDate <= newStart) {
                              setEndDate(
                                format(
                                  addDays(new Date(newStart), 1),
                                  "yyyy-MM-dd",
                                ),
                              );
                            }
                          }}
                          min={today}
                          className="mt-2 w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-slate-text focus:border-sprout-base focus:ring-2 focus:ring-sprout-light focus:outline-none transition"
                        />
                      </label>
                      <label className="block text-sm font-medium text-slate-text">
                        End date
                        <input
                          type="date"
                          value={endDate}
                          onChange={(e) => setEndDate(e.target.value)}
                          min={startDate}
                          className="mt-2 w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-slate-text focus:border-sprout-base focus:ring-2 focus:ring-sprout-light focus:outline-none transition"
                        />
                      </label>
                    </div>
                    <div className="flex items-center gap-4">
                      <button
                        onClick={handleNextDates}
                        className="rounded-xl bg-sprout-dark text-white py-3 px-8 font-semibold text-sm hover:bg-sprout-base transition-colors shadow-soft"
                      >
                        Continue →
                      </button>
                      <button
                        onClick={handleBack}
                        className="text-sm text-muted hover:text-slate-text transition-colors"
                      >
                        ← Back
                      </button>
                    </div>
                  </>
                )}

                {/* ── Step 3: Kids ── */}
                {wizardStep === "kids" && (
                  <>
                    <div>
                      <h2 className="font-heading text-3xl md:text-4xl font-bold text-sprout-dark">
                        Who's coming along? 👧🧒
                      </h2>
                      <p className="text-muted mt-2">
                        Add your little explorers so we can tailor the
                        itinerary.
                      </p>
                    </div>
                    <label className="block text-sm font-medium text-slate-text">
                      Number of children
                      <input
                        type="number"
                        value={numChildren}
                        min="0"
                        max="10"
                        onChange={(e) => {
                          const value = Math.max(
                            0,
                            Math.min(10, parseInt(e.target.value) || 0),
                          );
                          setNumChildren(value);
                          setChildAges((prev) =>
                            Array(value)
                              .fill(0)
                              .map((_, i) => prev[i] || 2),
                          );
                          setChildWeights((prev) =>
                            Array(value)
                              .fill("")
                              .map((_, i) => prev[i] || ""),
                          );
                          setChildHeights((prev) =>
                            Array(value)
                              .fill("")
                              .map((_, i) => prev[i] || ""),
                          );
                        }}
                        className="mt-2 w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-slate-text focus:border-sprout-base focus:ring-2 focus:ring-sprout-light focus:outline-none transition"
                      />
                    </label>
                    {numChildren > 0 && (
                      <div className="grid gap-3 md:grid-cols-2">
                        {Array(numChildren)
                          .fill(0)
                          .map((_, index) => (
                            <div
                              key={`child-${index}`}
                              className="rounded-2xl border border-sprout-light bg-sprout-light/40 p-4 space-y-3"
                            >
                              <p className="text-xs font-bold uppercase tracking-wider text-sprout-dark">
                                🌱 Child {index + 1}
                              </p>
                              <label className="block text-sm font-medium text-slate-text">
                                Age (years)
                                <input
                                  type="number"
                                  min="0"
                                  max="18"
                                  value={childAges[index] || 0}
                                  onChange={(e) => {
                                    const value = Math.max(
                                      0,
                                      Math.min(
                                        18,
                                        parseInt(e.target.value) || 0,
                                      ),
                                    );
                                    setChildAges((prev) => {
                                      const next = [...prev];
                                      next[index] = value;
                                      return next;
                                    });
                                  }}
                                  className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-slate-text focus:border-sprout-base focus:ring-2 focus:ring-sprout-light focus:outline-none transition"
                                />
                              </label>
                              <div className="grid gap-3 md:grid-cols-2">
                                <label className="block text-sm font-medium text-slate-text">
                                  Weight (lb, optional)
                                  <input
                                    type="number"
                                    min="2"
                                    max="300"
                                    step="0.1"
                                    value={childWeights[index] || ""}
                                    onChange={(e) => {
                                      const value = e.target.value;
                                      setChildWeights((prev) => {
                                        const next = [...prev];
                                        next[index] = value;
                                        return next;
                                      });
                                    }}
                                    placeholder="Not set"
                                    className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-slate-text placeholder:text-muted focus:border-sprout-base focus:ring-2 focus:ring-sprout-light focus:outline-none transition"
                                  />
                                </label>
                                <label className="block text-sm font-medium text-slate-text">
                                  Height (in, optional)
                                  <input
                                    type="number"
                                    min="10"
                                    max="90"
                                    step="0.1"
                                    value={childHeights[index] || ""}
                                    onChange={(e) => {
                                      const value = e.target.value;
                                      setChildHeights((prev) => {
                                        const next = [...prev];
                                        next[index] = value;
                                        return next;
                                      });
                                    }}
                                    placeholder="Not set"
                                    className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-slate-text placeholder:text-muted focus:border-sprout-base focus:ring-2 focus:ring-sprout-light focus:outline-none transition"
                                  />
                                </label>
                              </div>
                            </div>
                          ))}
                      </div>
                    )}
                    <div className="flex items-center gap-4">
                      <button
                        onClick={handleGeneratePlan}
                        disabled={isLoading}
                        className="rounded-xl bg-sprout-dark text-white py-3 px-8 font-semibold text-sm hover:bg-sprout-base transition-colors disabled:opacity-60 shadow-soft"
                      >
                        {isLoading
                          ? "Building your plan... 🌍"
                          : "Generate plan 🚀"}
                      </button>
                      <button
                        onClick={handleBack}
                        className="text-sm text-muted hover:text-slate-text transition-colors"
                      >
                        ← Back
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* ── RESULTS ─────────────────────────────────────── */}
            {step === "results" && (
              <div className="space-y-8">
                {/* Trip header */}
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-muted">
                      🗺️ Trip overview
                    </p>
                    <h2 className="font-heading text-3xl font-bold text-sprout-dark mt-1">
                      {tripData.destination}
                    </h2>
                    <p className="text-sm text-muted">
                      {tripData.startDate} → {tripData.endDate} ·{" "}
                      {tripData.duration} days
                    </p>
                    {weather?.summary && (
                      <p className="text-xs text-muted mt-1 flex items-center gap-1">
                        <span>🌤</span> {weather.summary}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => setShowCustomize((prev) => !prev)}
                    className="rounded-xl border border-sprout-light px-5 py-2 text-sm font-semibold text-sprout-dark transition hover:bg-sprout-light"
                  >
                    {showCustomize ? "Hide activities" : "✏️ Customize"}
                  </button>
                </div>

                {/* Loading state */}
                {isLoading && (
                  <div className="rounded-xl border border-sky-light bg-sky-light/50 px-5 py-6 text-sm text-sky-dark flex items-center gap-3">
                    <span className="text-xl animate-spin">🌍</span>
                    Building your itinerary and packing list...
                  </div>
                )}

                {!isLoading && tripPlan && (
                  <TripPlanDisplay
                    tripPlan={tripPlan}
                    weather={weather}
                    onApprove={handleApprovePlan}
                    isVisible={showCustomize}
                  />
                )}

                {!isLoading && safetyGuidance && (
                  <TravelSafetyCard safetyGuidance={safetyGuidance} />
                )}

                {!isLoading && packingList && (
                  <PackingChecklist packingList={packingList} />
                )}
              </div>
            )}
          </section>

          {/* ── Sidebar ─────────────────────────────────────────── */}
          <aside className="rounded-2xl border border-sprout-light bg-white shadow-soft p-6 h-fit">
            <p className="text-xs font-bold uppercase tracking-wider text-sprout-dark mb-4">
              🧭 Your trip
            </p>
            <div className="space-y-4 text-sm">
              <div>
                <p className="text-xs text-muted font-medium">Destination</p>
                <p className="text-base font-semibold text-slate-text mt-0.5">
                  {resolvedDestination || (
                    <span className="text-muted italic">Not set yet</span>
                  )}
                </p>
              </div>
              <div className="border-t border-sprout-light pt-4">
                <p className="text-xs text-muted font-medium">Dates</p>
                <p className="text-base font-semibold text-slate-text mt-0.5">
                  {startDate && endDate ? (
                    <>
                      {startDate}
                      <span className="text-muted mx-1">→</span>
                      {endDate}
                    </>
                  ) : (
                    <span className="text-muted italic">Not set yet</span>
                  )}
                </p>
              </div>
              <div className="border-t border-sprout-light pt-4">
                <p className="text-xs text-muted font-medium">Travelers</p>
                <p className="text-base font-semibold text-slate-text mt-0.5">
                  {numChildren} child{numChildren === 1 ? "" : "ren"}
                </p>
              </div>
              {numChildren > 0 && childAges.slice(0, numChildren).length > 0 && (
                <div className="border-t border-sprout-light pt-4">
                  <p className="text-xs text-muted font-medium">Ages</p>
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {childAges.slice(0, numChildren).map((age, i) => (
                      <span
                        key={i}
                        className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-sprout-light text-sprout-dark"
                      >
                        🌱 {age}y
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {step === "results" && (
                <div className="border-t border-sprout-light pt-4">
                  <button
                    onClick={handleReset}
                    className="w-full rounded-xl border border-sprout-light px-4 py-2.5 text-sm font-semibold text-sprout-dark hover:bg-sprout-light transition-colors"
                  >
                    ↩ Start over
                  </button>
                </div>
              )}
            </div>
          </aside>
        </main>

        {/* ── Footer ──────────────────────────────────────────── */}
        <footer className="mt-12 text-center text-xs text-muted">
          <span className="font-heading font-bold text-earth">SproutRoute</span>
          {" · "}Built with React, Vite &amp; Weather.gov
        </footer>
      </div>
    </div>
  );
}

export default App;
