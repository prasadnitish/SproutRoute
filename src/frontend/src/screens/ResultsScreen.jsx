import { useState, useMemo } from "react";
import HeroTile from "../components/mosaic/HeroTile";
import WeatherTile from "../components/mosaic/WeatherTile";
import ItineraryTile from "../components/mosaic/ItineraryTile";
import SafetyTile from "../components/mosaic/SafetyTile";
import PetSafetyTile from "../components/mosaic/PetSafetyTile";
import MapTile from "../components/mosaic/MapTile";
import ActivityDetailPanel from "../components/ActivityDetailPanel";
import PackingChecklist from "../components/PackingChecklist";
import DayRouteMap from "../components/mosaic/DayRouteMap";

const TABS = [
  { key: "plan", label: "\u{1F4C5} Plan" },
  { key: "pack", label: "\u{1F392} Pack" },
];

function resolveItinerary(rawDays, suggestedActivities) {
  if (!rawDays || rawDays.length === 0) return [];
  const activityMap = {};
  (suggestedActivities || []).forEach((a) => {
    if (a.id) activityMap[a.id] = a;
  });
  return rawDays.map((day) => {
    const rawActivities = day.activities || day.items || [];
    const resolvedActivities = rawActivities.map((act) =>
      typeof act === "string"
        ? activityMap[act] || { name: act, description: "" }
        : act
    );
    return {
      date: day.day || day.date || null,
      activities: resolvedActivities,
      meals: day.meals,
      notes: day.notes,
    };
  });
}

export default function ResultsScreen({
  tripData,
  parsedInput,
  packingList,
  packingError,
  safetyData,
  petSafetyData,
  carSeatData,
  enrichedData,
  enrich,
  onGoBack,
  onRetryPacking,
}) {
  const [activeTab, setActiveTab] = useState("plan");
  const [selectedActivity, setSelectedActivity] = useState(null);
  const [activeDayActivities, setActiveDayActivities] = useState([]);

  const forecast = tripData?.weather?.forecast || tripData?.weather || [];
  const rawItinerary =
    tripData?.tripPlan?.dailyItinerary ||
    tripData?.itinerary?.dailyItinerary ||
    tripData?.itinerary ||
    [];
  const suggestedActivities = tripData?.tripPlan?.suggestedActivities || [];
  const scheduledItinerary = tripData?.scheduledItinerary || null;
  const dailyItinerary = useMemo(
    () => resolveItinerary(rawItinerary, suggestedActivities),
    [rawItinerary, suggestedActivities]
  );
  const destination =
    tripData?.parsed?.destination || tripData?.trip?.destination;
  const lat = tripData?.trip?.lat;
  const lon = tripData?.trip?.lon;
  const hasPets = (tripData?.trip?.pets?.length || parsedInput?.pets?.length || 0) > 0;

  const handleActivityTap = (activity) => {
    setSelectedActivity(activity);
    const activityName = activity.name || activity.title || "";
    if (activityName && destination) {
      enrich?.(activityName, destination, activity.category);
    }
  };

  const selectedKey = selectedActivity
    ? `${selectedActivity.name || selectedActivity.title || ""}||${destination}`
    : null;

  return (
    <div className="w-full max-w-7xl mx-auto">
      {/* Tab bar */}
      <div className="flex gap-0 border-b border-gray-200 mb-0 px-3 sm:px-4">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 sm:px-5 py-3 text-sm font-medium cursor-pointer transition ${
              activeTab === tab.key
                ? "border-b-2 border-meadow-600 text-meadow-600 font-bold"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Plan tab — Mission Control Mosaic ── */}
      {activeTab === "plan" && (
        <div className="p-3 sm:p-4">
          {/*
            Desktop (lg+): 3-column grid
            ┌─────────────┬──────────┬──────────┐
            │  Hero       │ Weather  │  Map     │
            │  (spans 2r) │          │          │
            │             ├──────────┼──────────┤
            │             │ Safety   │          │
            ├─────────────┴──────────┴──────────┤
            │         Itinerary (full width)     │
            └───────────────────────────────────┘

            Tablet (md): 2 columns
            Mobile: single column stack
          */}

          {/* Top mosaic: Hero + info tiles */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-[1.2fr_1fr_1fr] gap-3 mb-3">
            {/* Hero — spans 2 rows on lg */}
            <div className="md:col-span-2 lg:col-span-1 lg:row-span-2">
              <HeroTile
                tripData={tripData}
                parsedInput={parsedInput}
                onEdit={onGoBack}
              />
            </div>

            {/* Weather */}
            <div>
              <WeatherTile
                forecast={forecast}
                tripStart={tripData?.parsed?.startDate || parsedInput?.startDate}
              />
            </div>

            {/* Map */}
            <div>
              <MapTile destination={destination} lat={lat} lon={lon} />
            </div>

            {/* Safety — fills remaining space on lg row 2 */}
            <div className="lg:col-span-2">
              <SafetyTile safetyData={safetyData} carSeatData={carSeatData} />
            </div>

            {/* Pet Safety — shown when pet safety data is available */}
            {petSafetyData && (
              <div className="md:col-span-2 lg:col-span-3">
                <PetSafetyTile petSafetyData={petSafetyData} />
              </div>
            )}
          </div>

          {/* Itinerary + Day Route Map — side by side on desktop */}
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-3">
            <ItineraryTile
              dailyItinerary={dailyItinerary}
              scheduledItinerary={scheduledItinerary}
              forecast={forecast}
              onActivityTap={handleActivityTap}
              onDayChange={setActiveDayActivities}
              hasPets={hasPets}
            />
            <div className="hidden lg:block">
              <DayRouteMap
                activities={activeDayActivities}
                destination={destination}
                lat={lat}
                lon={lon}
              />
            </div>
          </div>
        </div>
      )}

      {/* Pack tab */}
      {activeTab === "pack" && (
        <div>
          {packingList ? (
            <PackingChecklist packingList={packingList} />
          ) : packingError ? (
            <div className="p-8 text-center text-gray-500" role="alert">
              <p className="text-4xl mb-3">{"\u{1F392}"}</p>
              <p className="font-medium text-red-600 dark:text-red-400 mb-2">
                {packingError}
              </p>
              {onRetryPacking && (
                <button
                  onClick={onRetryPacking}
                  className="px-4 py-2 rounded-lg bg-meadow-600 text-white text-sm font-medium hover:bg-meadow-700 transition"
                >
                  Retry
                </button>
              )}
            </div>
          ) : (
            <div className="p-8 text-center text-gray-500">
              <p className="text-4xl mb-3">{"\u{1F392}"}</p>
              <p className="font-medium">Generating packing list&hellip;</p>
            </div>
          )}
        </div>
      )}

      {/* Activity Detail Panel */}
      <ActivityDetailPanel
        activity={selectedActivity}
        placesData={selectedKey ? enrichedData?.[selectedKey] : null}
        isOpen={!!selectedActivity}
        onClose={() => setSelectedActivity(null)}
      />
    </div>
  );
}
