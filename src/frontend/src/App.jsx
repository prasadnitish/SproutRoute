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

  // If suggestions are shown, pick one to continue.
  const handleSelectSuggestion = (suggestion) => {
    setResolvedDestination(suggestion.displayName || suggestion.name);
    setDestinationSuggestions([]);
    setWizardStep("dates");
  };

  // Allow user to keep their original input without picking a suggestion.
  const handleUseOriginalDestination = () => {
    setResolvedDestination(destinationQuery.trim());
    setDestinationSuggestions([]);
    setWizardStep("dates");
  };

  // Step 2: validate date range before moving forward.
  const handleNextDates = () => {
    if (!startDate || !endDate) {
      setError("Please select a start and end date.");
      return;
    }
    const duration = differenceInDays(new Date(endDate), new Date(startDate));
    if (duration <= 0) {
      setError("Trip must be at least 1 day.");
      return;
    }
    if (duration > 14) {
      setError("Trip duration cannot exceed 14 days.");
      return;
    }
    setError(null);
    setWizardStep("kids");
  };

  // Step 3: generate itinerary + packing list in one shot.
  const handleGeneratePlan = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const children = buildChildrenPayload();
      const formData = {
        destination: resolvedDestination,
        startDate,
        endDate,
        activities: [],
        children,
      };

      const result = await generateTripPlan(formData);

      setTripData(result.trip || formData);
      setWeather(result.weather);
      setTripPlan(result.tripPlan);
      setStep("results");

      const rawCategories = Array.from(
        new Set(
          (result.tripPlan?.suggestedActivities || []).map((a) => a.category),
        ),
      );
      // Fall back to the same defaults the server uses when no activities are provided.
      const activityCategories =
        rawCategories.length > 0
          ? rawCategories
          : ["family-friendly", "parks", "city"];

      const safeChildren = result.trip.children || children;

      const [packingResult, safetyResult] = await Promise.all([
        generatePackingList({
          ...result.trip,
          activities: activityCategories,
          children: safeChildren,
        }),
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
                requiredRestraint: "not_found",
                requiredRestraintLabel: "Not found in repo",
                seatPosition: "not_found",
                rationale: "Safety guidance request failed.",
              })),
            }))
          : Promise.resolve(null),
      ]);

      setPackingList(packingResult.packingList);
      setSafetyGuidance(safetyResult);
      setShowCustomize(false);

      const dataToSave = {
        trip: result.trip || formData,
        weather: result.weather,
        tripPlan: result.tripPlan,
        packingList: packingResult.packingList,
        safetyGuidance: safetyResult,
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

  return (
    <div className="min-h-screen bg-ink text-paper relative overflow-hidden">
      <div className="pointer-events-none absolute -top-32 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-primary-500/10 blur-3xl"></div>
      <div className="pointer-events-none absolute bottom-0 right-0 h-80 w-80 translate-x-1/3 translate-y-1/3 rounded-full bg-white/5 blur-3xl"></div>
      <div className="mx-auto max-w-6xl px-6 py-10 relative">
        <header className="flex items-center justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-muted">
              StrollerScout
            </p>
            <h1 className="text-3xl md:text-4xl font-serif font-semibold">
              Smart packing, minus the chaos
            </h1>
          </div>
          {step === "results" && (
            <button
              onClick={handleReset}
              className="text-xs uppercase tracking-[0.2em] text-muted hover:text-paper"
            >
              Start Over
            </button>
          )}
        </header>

        <main className="mt-10 grid gap-10 lg:grid-cols-[1.7fr_0.8fr]">
          <section className="min-h-[60vh] rounded-3xl border border-white/10 bg-white/5 p-8 shadow-[0_30px_80px_-60px_rgba(0,0,0,0.8)]">
            {error && (
              <div className="mb-6 rounded-2xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                {error}
              </div>
            )}

            {step === "wizard" && (
              <div
                key={wizardStep}
                className="wizard-step flex min-h-[48vh] flex-col justify-center gap-6"
              >
                {wizardStep === "destination" && (
                  <>
                    <p className="text-xs uppercase tracking-[0.3em] text-muted">
                      Step 1
                    </p>
                    <h2 className="text-3xl md:text-4xl font-semibold">
                      Where do you want to go?
                    </h2>
                    <p className="text-sm text-muted">
                      Try a city like "Seattle, WA" or "2 hour drive from
                      Seattle."
                    </p>
                    <input
                      type="text"
                      value={destinationQuery}
                      onChange={(e) => setDestinationQuery(e.target.value)}
                      placeholder="Type your destination intent"
                      className="w-full border-b border-white/20 bg-transparent py-4 text-xl text-paper placeholder:text-muted focus:border-primary-500 focus:outline-none"
                    />
                    <div className="flex items-center gap-4">
                      <button
                        onClick={handleResolveDestination}
                        disabled={isLoading}
                        className="rounded-full bg-primary-500 px-6 py-3 text-sm font-semibold text-ink transition hover:bg-primary-600 disabled:opacity-60"
                      >
                        {isLoading ? "Finding places..." : "Continue"}
                      </button>
                    </div>
                  </>
                )}

                {wizardStep === "suggestions" && (
                  <>
                    <p className="text-xs uppercase tracking-[0.3em] text-muted">
                      Step 1
                    </p>
                    <h2 className="text-3xl md:text-4xl font-semibold">
                      Pick a destination
                    </h2>
                    <p className="text-sm text-muted">
                      These places fit your request. Choose one to keep going.
                    </p>
                    <div className="space-y-3">
                      {destinationSuggestions.map((place) => (
                        <button
                          key={`${place.displayName}-${place.distanceMiles}`}
                          onClick={() => handleSelectSuggestion(place)}
                          className="w-full rounded-2xl border border-white/10 bg-white/5 px-5 py-4 text-left transition hover:border-primary-500"
                        >
                          <div className="text-lg font-semibold">
                            {place.displayName || place.name}
                          </div>
                          <div className="text-xs text-muted">
                            About {place.distanceMiles} miles away
                          </div>
                        </button>
                      ))}
                    </div>
                    <div className="flex flex-wrap items-center gap-4">
                      <button
                        onClick={handleUseOriginalDestination}
                        className="text-xs uppercase tracking-[0.2em] text-paper hover:text-primary-500"
                      >
                        Use my original input
                      </button>
                      <button
                        onClick={handleBack}
                        className="text-xs uppercase tracking-[0.2em] text-muted hover:text-paper"
                      >
                        Back
                      </button>
                    </div>
                  </>
                )}

                {wizardStep === "dates" && (
                  <>
                    <p className="text-xs uppercase tracking-[0.3em] text-muted">
                      Step 2
                    </p>
                    <h2 className="text-3xl md:text-4xl font-semibold">
                      When are you traveling?
                    </h2>
                    <div className="grid gap-4 md:grid-cols-2">
                      <label className="text-sm text-muted">
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
                          className="mt-2 w-full border-b border-white/20 bg-transparent py-3 text-lg text-paper focus:border-primary-500 focus:outline-none"
                        />
                      </label>
                      <label className="text-sm text-muted">
                        End date
                        <input
                          type="date"
                          value={endDate}
                          onChange={(e) => setEndDate(e.target.value)}
                          min={startDate}
                          className="mt-2 w-full border-b border-white/20 bg-transparent py-3 text-lg text-paper focus:border-primary-500 focus:outline-none"
                        />
                      </label>
                    </div>
                    <div className="flex items-center gap-4">
                      <button
                        onClick={handleNextDates}
                        className="rounded-full bg-primary-500 px-6 py-3 text-sm font-semibold text-ink transition hover:bg-primary-600"
                      >
                        Continue
                      </button>
                      <button
                        onClick={handleBack}
                        className="text-xs uppercase tracking-[0.2em] text-muted hover:text-paper"
                      >
                        Back
                      </button>
                    </div>
                  </>
                )}

                {wizardStep === "kids" && (
                  <>
                    <p className="text-xs uppercase tracking-[0.3em] text-muted">
                      Step 3
                    </p>
                    <h2 className="text-3xl md:text-4xl font-semibold">
                      Who is traveling?
                    </h2>
                    <label className="text-sm text-muted">
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
                        className="mt-2 w-full border-b border-white/20 bg-transparent py-3 text-lg text-paper focus:border-primary-500 focus:outline-none"
                      />
                    </label>
                    {numChildren > 0 && (
                      <div className="grid gap-3 md:grid-cols-2">
                        {Array(numChildren)
                          .fill(0)
                          .map((_, index) => (
                            <div
                              key={`child-${index}`}
                              className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-3"
                            >
                              <p className="text-xs uppercase tracking-[0.2em] text-muted">
                                Child {index + 1}
                              </p>
                              <label className="text-sm text-muted block">
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
                                  className="mt-1 w-full border-b border-white/20 bg-transparent py-2 text-lg text-paper focus:border-primary-500 focus:outline-none"
                                />
                              </label>
                              <div className="grid gap-3 md:grid-cols-2">
                                <label className="text-sm text-muted block">
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
                                    className="mt-1 w-full border-b border-white/20 bg-transparent py-2 text-sm text-paper placeholder:text-muted focus:border-primary-500 focus:outline-none"
                                  />
                                </label>
                                <label className="text-sm text-muted block">
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
                                    className="mt-1 w-full border-b border-white/20 bg-transparent py-2 text-sm text-paper placeholder:text-muted focus:border-primary-500 focus:outline-none"
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
                        className="rounded-full bg-primary-500 px-6 py-3 text-sm font-semibold text-ink transition hover:bg-primary-600 disabled:opacity-60"
                      >
                        {isLoading ? "Building your plan..." : "Generate plan"}
                      </button>
                      <button
                        onClick={handleBack}
                        className="text-xs uppercase tracking-[0.2em] text-muted hover:text-paper"
                      >
                        Back
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}

            {step === "results" && (
              <div className="space-y-8">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-xs uppercase tracking-[0.3em] text-muted">
                      Trip overview
                    </p>
                    <h2 className="text-3xl font-semibold">
                      {tripData.destination}
                    </h2>
                    <p className="text-sm text-muted">
                      {tripData.startDate} to {tripData.endDate} ·{" "}
                      {tripData.duration} days
                    </p>
                    {weather?.summary && (
                      <p className="text-xs text-muted mt-1">
                        {weather.summary}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => setShowCustomize((prev) => !prev)}
                    className="rounded-full border border-white/20 px-5 py-2 text-xs uppercase tracking-[0.2em] text-paper transition hover:border-primary-500"
                  >
                    {showCustomize ? "Hide activity picker" : "Customize"}
                  </button>
                </div>

                {isLoading && (
                  <div className="rounded-2xl border border-white/10 bg-white/5 px-5 py-6 text-sm text-muted">
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

          <aside className="rounded-3xl border border-white/10 bg-white/5 p-6">
            <p className="text-xs uppercase tracking-[0.3em] text-muted">
              Your plan
            </p>
            <div className="mt-4 space-y-4 text-sm">
              <div>
                <p className="text-muted">Destination</p>
                <p className="text-base text-paper">
                  {resolvedDestination || "Not set yet"}
                </p>
              </div>
              <div>
                <p className="text-muted">Dates</p>
                <p className="text-base text-paper">
                  {startDate && endDate
                    ? `${startDate} → ${endDate}`
                    : "Not set yet"}
                </p>
              </div>
              <div>
                <p className="text-muted">Kids</p>
                <p className="text-base text-paper">
                  {numChildren} child{numChildren === 1 ? "" : "ren"}
                </p>
              </div>
              {numChildren > 0 && (
                <div>
                  <p className="text-muted">Ages</p>
                  <p className="text-base text-paper">
                    {childAges.slice(0, numChildren).join(", ")}
                  </p>
                </div>
              )}
              {step === "results" && (
                <button
                  onClick={handleReset}
                  className="mt-6 w-full rounded-full border border-white/20 px-4 py-2 text-xs uppercase tracking-[0.2em] text-paper hover:border-primary-500"
                >
                  Start over
                </button>
              )}
            </div>
          </aside>
        </main>

        <footer className="mt-12 text-center text-xs uppercase tracking-[0.2em] text-muted">
          Built with React, Vite, and Weather.gov
        </footer>
      </div>
    </div>
  );
}

export default App;
