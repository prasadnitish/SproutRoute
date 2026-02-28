import { useState, useEffect, useRef, useCallback } from "react";
import { format, addDays, differenceInDays } from "date-fns";
import { AnimatePresence, motion } from "framer-motion";
import Header from "./components/Header";
import Footer from "./components/Footer";
import Sidebar from "./components/Sidebar";
import ResetModal from "./components/ResetModal";
import WizardProgress from "./components/WizardProgress";
import LoadingOverlay from "./components/LoadingOverlay";
import ShareExport from "./components/ShareExport";
import DestinationStep from "./components/wizard/DestinationStep";
import DatesStep from "./components/wizard/DatesStep";
import KidsStep from "./components/wizard/KidsStep";
import ActivitiesStep from "./components/wizard/ActivitiesStep";
import TripPlanDisplay from "./components/TripPlanDisplay";
import PackingChecklist from "./components/PackingChecklist";
import TravelSafetyCard from "./components/TravelSafetyCard";
import ResultTabs from "./components/ResultTabs";
import {
  replanTrip,
  generatePackingList,
  resolveDestination,
  streamTripPlan,
  getTravelAdvisory,
  getNeighborhoodSafety,
} from "./services/api";

// ── useTheme ─────────────────────────────────────────────────────────────────

function useTheme() {
  const getInitial = () => {
    const stored = localStorage.getItem("sproutroute-theme");
    if (stored === "dark" || stored === "light") return stored;
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  };

  const [theme, setTheme] = useState(getInitial);

  useEffect(() => {
    if (theme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
    localStorage.setItem("sproutroute-theme", theme);
  }, [theme]);

  const toggle = useCallback(
    () => setTheme((t) => (t === "dark" ? "light" : "dark")),
    [],
  );
  return { theme, toggle };
}

// ── App ──────────────────────────────────────────────────────────────────────

function App() {
  const { theme, toggle: toggleTheme } = useTheme();
  const today = format(new Date(), "yyyy-MM-dd");
  const tomorrow = format(addDays(new Date(), 1), "yyyy-MM-dd");

  // ── State ────────────────────────────────────────────────────────────────

  const [step, setStep] = useState("wizard");
  const [wizardStep, setWizardStep] = useState("destination");
  const [activeResultTab, setActiveResultTab] = useState("itinerary");
  const [selectedActivities, setSelectedActivities] = useState([]);
  const [tripData, setTripData] = useState(null);
  const [tripPlan, setTripPlan] = useState(null);
  const [weather, setWeather] = useState(null);
  const [packingList, setPackingList] = useState(null);
  const [safetyGuidance, setSafetyGuidance] = useState(null);
  const [travelAdvisory, setTravelAdvisory] = useState(null);
  const [neighborhoodSafety, setNeighborhoodSafety] = useState(null);
  const [showCustomize, setShowCustomize] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showResetModal, setShowResetModal] = useState(false);

  // Loading overlay phases
  const [showLoadingOverlay, setShowLoadingOverlay] = useState(false);
  const [loadingPhases, setLoadingPhases] = useState(new Set());
  const [loadingError, setLoadingError] = useState(null);
  const abortControllerRef = useRef(null);

  // Rate limit
  const [rateLimitResetAt, setRateLimitResetAt] = useState(null);
  const [rateLimitCountdown, setRateLimitCountdown] = useState(null);
  const [rateLimitRemaining, setRateLimitRemaining] = useState(null);
  const countdownIntervalRef = useRef(null);

  // Wizard input state
  const [destinationQuery, setDestinationQuery] = useState("");
  const [destinationSuggestions, setDestinationSuggestions] = useState([]);
  const [resolvedDestination, setResolvedDestination] = useState("");
  const [tripType, setTripType] = useState(null);
  const [countryCode, setCountryCode] = useState(null);
  const [lat, setLat] = useState(null);
  const [lon, setLon] = useState(null);

  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(tomorrow);
  const [numChildren, setNumChildren] = useState(0);
  const [childAges, setChildAges] = useState([]);
  const [childWeights, setChildWeights] = useState([]);
  const [childHeights, setChildHeights] = useState([]);

  // ── Helpers ──────────────────────────────────────────────────────────────

  const buildChildrenPayload = () => {
    return childAges.slice(0, numChildren).map((age, index) => {
      const child = { age };
      const weight = Number.parseFloat(childWeights[index]);
      const height = Number.parseFloat(childHeights[index]);
      if (Number.isFinite(weight) && weight > 0) child.weightLb = Math.round(weight * 10) / 10;
      if (Number.isFinite(height) && height > 0) child.heightIn = Math.round(height * 10) / 10;
      return child;
    });
  };

  const wizardStepIndex = { destination: 1, suggestions: 1, dates: 2, kids: 3, activities: 4 };
  const currentStepNum = wizardStepIndex[wizardStep] || 1;

  // ── Restore saved trip ──────────────────────────────────────────────────

  const SAVED_TRIP_TTL_MS = 7 * 24 * 60 * 60 * 1000;
  useEffect(() => {
    const savedData = localStorage.getItem("sproutroute_trip");
    if (savedData) {
      try {
        const parsed = JSON.parse(savedData);
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
          setTravelAdvisory(parsed.travelAdvisory || null);
          setNeighborhoodSafety(parsed.neighborhoodSafety || null);
          setResolvedDestination(parsed.trip.destination || "");
          setStartDate(parsed.trip.startDate || today);
          setEndDate(parsed.trip.endDate || tomorrow);
          const savedChildren = parsed.trip.children || [];
          setNumChildren(savedChildren.length || 0);
          setChildAges(savedChildren.map((c) => c.age));
          setChildWeights(savedChildren.map((c) => (Number.isFinite(c.weightLb) ? String(c.weightLb) : "")));
          setChildHeights(savedChildren.map((c) => (Number.isFinite(c.heightIn) ? String(c.heightIn) : "")));
          setStep("results");
        }
      } catch (err) {
        console.error("Failed to load saved trip:", err);
      }
    }
  }, []);

  // Rate limit countdown
  useEffect(() => {
    if (!rateLimitResetAt) {
      setRateLimitCountdown(null);
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
      }
      return;
    }
    const tick = () => {
      const secondsLeft = Math.max(0, rateLimitResetAt - Math.floor(Date.now() / 1000));
      setRateLimitCountdown(secondsLeft);
      if (secondsLeft <= 0) {
        clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
        setRateLimitResetAt(null);
        setRateLimitCountdown(null);
      }
    };
    tick();
    countdownIntervalRef.current = setInterval(tick, 1000);
    return () => {
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
      }
    };
  }, [rateLimitResetAt]);

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handleResolveDestination = async () => {
    if (!destinationQuery.trim()) {
      setError("Please enter a destination.");
      return;
    }
    setIsLoading(true);
    setError(null);

    try {
      const result = await resolveDestination(destinationQuery.trim(), {
        onRateLimitInfo: ({ remaining }) => setRateLimitRemaining(remaining),
      });
      if (result.tripType) setTripType(result.tripType);
      if (result.countryCode) setCountryCode(result.countryCode);
      if (result.coords) {
        setLat(result.coords.lat);
        setLon(result.coords.lon);
      }

      if (result.mode === "suggestions") {
        setDestinationSuggestions(result.suggestions || []);
        setWizardStep("suggestions");
      } else {
        setResolvedDestination(result.destination);
        setWizardStep("dates");
      }
    } catch (err) {
      setError(err.message || "Failed to resolve destination");
      if (err.rateLimitReset) setRateLimitResetAt(err.rateLimitReset);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectSuggestion = (place) => {
    setResolvedDestination(place.displayName || place.name);
    if (place.tripType) setTripType(place.tripType);
    if (place.countryCode) setCountryCode(place.countryCode);
    if (place.coords) {
      setLat(place.coords.lat);
      setLon(place.coords.lon);
    }
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

  const handleNextKids = () => {
    setWizardStep("activities");
  };

  // Generate trip plan with SSE streaming
  const handleGeneratePlan = async (likedActivities) => {
    setSelectedActivities(likedActivities);
    setShowLoadingOverlay(true);
    setLoadingPhases(new Set());
    setLoadingError(null);
    setError(null);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    const children = buildChildrenPayload();
    const formData = {
      destination: resolvedDestination,
      startDate,
      endDate,
      duration: differenceInDays(new Date(endDate), new Date(startDate)),
      children,
      activities: likedActivities,
      tripType: tripType || undefined,
      countryCode: countryCode || undefined,
    };

    try {
      const result = await streamTripPlan(
        formData,
        (event) => {
          setLoadingPhases((prev) => new Set([...prev, event.type]));
          if (event.type === "weather" && event.data) setWeather(event.data);
          if (event.type === "itinerary" && event.data) setTripPlan(event.data);
          if (event.type === "packing" && event.data) setPackingList(event.data);
          if (event.type === "fallback") {
            setLoadingPhases(new Set(["destination", "weather", "itinerary", "packing", "done"]));
          }
        },
        controller.signal,
      );

      const tripResult = result.trip || formData;
      setTripData(tripResult);
      if (result.tripPlan) setTripPlan(result.tripPlan);
      if (result.weather) setWeather(result.weather);
      if (result.packingList) setPackingList(result.packingList);
      setSafetyGuidance(result.safetyGuidance || null);
      setActiveResultTab("itinerary");
      setStep("results");
      setShowLoadingOverlay(false);

      // Fire advisory + neighborhood fetches in background
      const cc = tripResult.countryCode || countryCode;
      if (cc && cc !== "US") {
        getTravelAdvisory(cc)
          .then((r) => setTravelAdvisory(r?.advisory ?? null))
          .catch(() => null);
      }
      const tripLat = tripResult.lat ?? lat;
      const tripLon = tripResult.lon ?? lon;
      if (tripLat != null && tripLon != null) {
        getNeighborhoodSafety(tripLat, tripLon)
          .then((r) => setNeighborhoodSafety(r?.safety ?? null))
          .catch(() => null);
      }

      const dataToSave = {
        trip: tripResult,
        weather: result.weather,
        tripPlan: result.tripPlan,
        packingList: result.packingList,
        safetyGuidance: result.safetyGuidance || null,
        lastModified: new Date().toISOString(),
      };
      localStorage.setItem("sproutroute_trip", JSON.stringify(dataToSave));
    } catch (err) {
      if (err.name === "AbortError") {
        setShowLoadingOverlay(false);
        return;
      }
      setLoadingError(err.message || "Failed to generate trip plan");
      if (err.rateLimitReset) setRateLimitResetAt(err.rateLimitReset);
    }
  };

  const handleCancelLoading = () => {
    if (abortControllerRef.current) abortControllerRef.current.abort();
    setShowLoadingOverlay(false);
  };

  const handleRetryLoading = () => {
    setShowLoadingOverlay(false);
    handleGeneratePlan(selectedActivities);
  };

  const handleApprovePlan = async (approvedActivities) => {
    setIsLoading(true);
    setError(null);

    try {
      const activityCategories = approvedActivities.map((a) => a.category);
      const updatedTripData = { ...tripData, activities: activityCategories };
      const [tripPlanResult, packingResult] = await Promise.all([
        replanTrip({ ...updatedTripData, weather, approvedActivities }, { onRetry: () => {} }),
        generatePackingList({ ...updatedTripData, activities: activityCategories, approvedActivities }, { onRetry: () => {} }),
      ]);

      setTripData(updatedTripData);
      setTripPlan(tripPlanResult.tripPlan);
      setPackingList(packingResult.packingList);
      setShowCustomize(false);

      localStorage.setItem("sproutroute_trip", JSON.stringify({
        trip: updatedTripData, weather, tripPlan: tripPlanResult.tripPlan,
        packingList: packingResult.packingList, safetyGuidance,
        lastModified: new Date().toISOString(),
      }));
    } catch (err) {
      setError(err.message || "Failed to update trip plan");
      if (err.rateLimitReset) setRateLimitResetAt(err.rateLimitReset);
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = () => setShowResetModal(true);

  const confirmReset = () => {
    setStep("wizard");
    setWizardStep("destination");
    setActiveResultTab("itinerary");
    setSelectedActivities([]);
    setTripData(null);
    setTripPlan(null);
    setWeather(null);
    setPackingList(null);
    setSafetyGuidance(null);
    setTravelAdvisory(null);
    setNeighborhoodSafety(null);
    setError(null);
    setDestinationQuery("");
    setResolvedDestination("");
    setDestinationSuggestions([]);
    setTripType(null);
    setCountryCode(null);
    setLat(null);
    setLon(null);
    setStartDate(today);
    setEndDate(tomorrow);
    setNumChildren(0);
    setChildAges([]);
    setChildWeights([]);
    setChildHeights([]);
    localStorage.removeItem("sproutroute_trip");
    localStorage.removeItem("sproutroute_checked");
    localStorage.removeItem("sproutroute_custom_items");
    setShowResetModal(false);
  };

  const handleBack = () => {
    if (wizardStep === "activities") setWizardStep("kids");
    else if (wizardStep === "kids") setWizardStep("dates");
    else if (wizardStep === "dates") setWizardStep("destination");
    else if (wizardStep === "suggestions") setWizardStep("destination");
  };

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-paper dark:bg-dark-bg text-slate-text dark:text-dark-text relative overflow-hidden">
      <Header
        theme={theme}
        onToggleTheme={toggleTheme}
        showStartOver={step === "results"}
        onStartOver={handleReset}
      />

      <div className="mx-auto max-w-6xl px-6 py-8 relative z-10">
        <main className="grid gap-6 lg:grid-cols-[1fr_280px]">
          {/* ── Main panel ──────────────────────────────────────── */}
          <section className="min-h-[60vh] min-w-0 overflow-hidden rounded-2xl border border-sprout-light dark:border-dark-border bg-white/80 dark:bg-dark-card/80 backdrop-blur-sm shadow-soft dark:shadow-soft-dark p-8">
            {/* Rate limit warning */}
            {rateLimitRemaining !== null && rateLimitRemaining < 5 && rateLimitRemaining > 0 && !error && (
              <div className="mb-4 rounded-xl border border-sun/40 bg-sun/10 dark:bg-sun/5 px-4 py-2 text-sm text-earth flex items-center gap-2" role="status">
                <span aria-hidden="true">⏳</span>
                <span>
                  You have {rateLimitRemaining} request{rateLimitRemaining !== 1 ? "s" : ""} remaining.
                </span>
              </div>
            )}

            {/* Error banner */}
            {error && (
              <div className="mb-6 rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-4 py-3 text-sm text-red-700 dark:text-red-400 flex items-start gap-2" role="alert">
                <span className="text-base" aria-hidden="true">⚠️</span>
                <div className="flex-1">
                  <span>{error}</span>
                  {rateLimitCountdown !== null && rateLimitCountdown > 0 && (
                    <div className="mt-1 font-medium text-red-800 dark:text-red-300">
                      ⏱ Try again in {rateLimitCountdown >= 60 ? `${Math.ceil(rateLimitCountdown / 60)} min` : `${rateLimitCountdown}s`}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── WIZARD ──────────────────────────────────────── */}
            {step === "wizard" && (
              <div className="flex min-h-[48vh] flex-col justify-center gap-6">
                <WizardProgress currentStep={currentStepNum} />

                <AnimatePresence mode="wait">
                  <motion.div
                    key={wizardStep}
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -16 }}
                    transition={{ duration: 0.3 }}
                    className="flex flex-col gap-6"
                  >
                    {(wizardStep === "destination" || wizardStep === "suggestions") && (
                      <DestinationStep
                        destinationQuery={destinationQuery}
                        onQueryChange={setDestinationQuery}
                        onResolve={handleResolveDestination}
                        suggestions={destinationSuggestions}
                        onSelectSuggestion={handleSelectSuggestion}
                        onUseOriginal={handleUseOriginalDestination}
                        onBack={handleBack}
                        isLoading={isLoading}
                        showSuggestions={wizardStep === "suggestions"}
                      />
                    )}

                    {wizardStep === "dates" && (
                      <DatesStep
                        startDate={startDate}
                        endDate={endDate}
                        onStartDateChange={setStartDate}
                        onEndDateChange={setEndDate}
                        onNext={handleNextDates}
                        onBack={handleBack}
                      />
                    )}

                    {wizardStep === "kids" && (
                      <KidsStep
                        numChildren={numChildren}
                        onNumChildrenChange={setNumChildren}
                        childAges={childAges}
                        onChildAgesChange={setChildAges}
                        childWeights={childWeights}
                        onChildWeightsChange={setChildWeights}
                        childHeights={childHeights}
                        onChildHeightsChange={setChildHeights}
                        onNext={handleNextKids}
                        onBack={handleBack}
                      />
                    )}

                    {wizardStep === "activities" && (
                      <ActivitiesStep
                        tripType={tripType}
                        suggestedActivities={[]}
                        onComplete={handleGeneratePlan}
                        onBack={handleBack}
                        numChildren={numChildren}
                      />
                    )}
                  </motion.div>
                </AnimatePresence>
              </div>
            )}

            {/* ── RESULTS ─────────────────────────────────────── */}
            {step === "results" && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="space-y-6"
              >
                {/* Trip header */}
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-muted dark:text-dark-muted">
                      🗺️ Trip overview
                    </p>
                    <h2 className="font-heading text-3xl font-bold text-sprout-dark dark:text-dark-sprout mt-1">
                      {tripData?.destination}
                    </h2>
                    {tripData?.startDate && tripData?.endDate && (
                      <p className="text-sm text-muted dark:text-dark-muted">
                        {format(new Date(tripData.startDate + "T12:00:00"), "MMM d")}
                        {" → "}
                        {format(new Date(tripData.endDate + "T12:00:00"), "MMM d, yyyy")}
                        {" · "}
                        {tripData.duration} day{tripData.duration !== 1 ? "s" : ""}
                      </p>
                    )}
                    {weather?.summary && (
                      <p className="text-xs text-muted dark:text-dark-muted mt-1 flex items-center gap-1">
                        <span>🌤</span> {weather.summary}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <ShareExport tripData={tripData} isVisible={true} />
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => setShowCustomize((prev) => !prev)}
                      className="rounded-xl border border-sprout-light dark:border-dark-border px-5 py-2 text-sm font-semibold text-sprout-dark dark:text-dark-sprout transition hover:bg-sprout-light dark:hover:bg-dark-border print:hidden"
                    >
                      {showCustomize ? "Hide activities" : "✏️ Customize"}
                    </motion.button>
                  </div>
                </div>

                {/* Loading state (replan) */}
                {isLoading && (
                  <div className="rounded-xl border border-sky-light bg-sky-light/40 dark:bg-sky-light/10 px-5 py-5">
                    <div className="flex items-center gap-3 text-sm text-sky-dark font-medium">
                      <div className="w-5 h-5 border-2 border-sky-dark/30 border-t-sky-dark rounded-full animate-spin" />
                      <span>Refreshing your trip plan...</span>
                    </div>
                  </div>
                )}

                <ResultTabs activeTab={activeResultTab} onTabChange={setActiveResultTab} />

                <AnimatePresence mode="wait">
                  {activeResultTab === "itinerary" && !isLoading && tripPlan && (
                    <motion.div key="itinerary" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                      id="tabpanel-itinerary" role="tabpanel" className="overflow-hidden min-w-0">
                      <TripPlanDisplay tripPlan={tripPlan} weather={weather} onApprove={handleApprovePlan} isVisible={showCustomize} startDate={tripData?.startDate} />
                    </motion.div>
                  )}
                  {activeResultTab === "packing" && !isLoading && packingList && (
                    <motion.div key="packing" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                      id="tabpanel-packing" role="tabpanel">
                      <PackingChecklist packingList={packingList} />
                    </motion.div>
                  )}
                  {activeResultTab === "safety" && !isLoading && (
                    <motion.div key="safety" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                      id="tabpanel-safety" role="tabpanel">
                      <TravelSafetyCard safetyGuidance={safetyGuidance} travelAdvisory={travelAdvisory} neighborhoodSafety={neighborhoodSafety}
                        hasChildren={numChildren > 0} weather={weather} tripPlan={tripPlan} />
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )}
          </section>

          <Sidebar resolvedDestination={resolvedDestination} startDate={startDate} endDate={endDate}
            numChildren={numChildren} childAges={childAges} showStartOver={step === "results"} onStartOver={handleReset} />
        </main>

        <Footer />
      </div>

      <ResetModal isOpen={showResetModal} onConfirm={confirmReset} onCancel={() => setShowResetModal(false)} />
      <LoadingOverlay isVisible={showLoadingOverlay} completedPhases={loadingPhases} error={loadingError}
        onCancel={handleCancelLoading} onRetry={handleRetryLoading} />
    </div>
  );
}

export default App;
