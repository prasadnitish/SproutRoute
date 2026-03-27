import { useState, useMemo } from "react";
import HeroTile from "../components/mosaic/HeroTile";
import WeatherTile from "../components/mosaic/WeatherTile";
import ItineraryTile from "../components/mosaic/ItineraryTile";
import SafetyTile from "../components/mosaic/SafetyTile";
import MapTile from "../components/mosaic/MapTile";
import ActivityDetailPanel from "../components/ActivityDetailPanel";

const TABS = [
  { key: "plan", label: "\u{1F4C5} Plan" },
  { key: "pack", label: "\u{1F392} Pack" },
];

// Resolve activity ID strings to full activity objects using suggestedActivities lookup
function resolveItinerary(rawDays, suggestedActivities) {
  if (!rawDays || rawDays.length === 0) return [];
  const activityMap = {};
  (suggestedActivities || []).forEach((a) => {
    if (a.id) activityMap[a.id] = a;
  });

  return rawDays.map((day) => {
    const rawActivities = day.activities || day.items || [];
    const resolvedActivities = rawActivities.map((act) => {
      if (typeof act === "string") {
        return activityMap[act] || { name: act, description: "" };
      }
      return act;
    });
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
  safetyData,
  enrichedData,
  enrich,
  onGoBack,
}) {
  const [activeTab, setActiveTab] = useState("plan");
  const [selectedActivity, setSelectedActivity] = useState(null);

  const forecast = tripData?.weather?.forecast || tripData?.weather || [];
  const rawItinerary = tripData?.tripPlan?.dailyItinerary || tripData?.itinerary?.dailyItinerary || tripData?.itinerary || [];
  const suggestedActivities = tripData?.tripPlan?.suggestedActivities || [];
  const dailyItinerary = useMemo(
    () => resolveItinerary(rawItinerary, suggestedActivities),
    [rawItinerary, suggestedActivities]
  );
  const destination = tripData?.parsed?.destination || tripData?.trip?.destination;
  const lat = tripData?.trip?.lat;
  const lon = tripData?.trip?.lon;

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
    <div className="w-full max-w-6xl mx-auto">
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

      {/* Plan tab — Mission Control mosaic */}
      {activeTab === "plan" && (
        <div className="p-3 sm:p-4">
          {/* Row 1: Hero + Weather (side by side on md+) */}
          <div className="grid grid-cols-1 md:grid-cols-[1.6fr_1fr] gap-3 mb-3">
            <HeroTile
              tripData={tripData}
              parsedInput={parsedInput}
              onEdit={onGoBack}
            />
            <div className="flex flex-col gap-3">
              <WeatherTile forecast={forecast} />
            </div>
          </div>

          {/* Row 2: Itinerary + sidebar (Map + Safety) */}
          <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-3">
            {/* Itinerary — main content */}
            <ItineraryTile
              dailyItinerary={dailyItinerary}
              forecast={forecast}
              onActivityTap={handleActivityTap}
            />

            {/* Sidebar: Map + Safety stacked */}
            <div className="flex flex-col gap-3">
              <MapTile
                destination={destination}
                lat={lat}
                lon={lon}
              />
              <SafetyTile safetyData={safetyData} />
            </div>
          </div>
        </div>
      )}

      {/* Pack tab */}
      {activeTab === "pack" && (
        <div className="p-8 text-center text-gray-500">
          <p className="text-4xl mb-3">{"\u{1F392}"}</p>
          <p className="font-medium">
            Packing list &mdash;{" "}
            {packingList?.items?.length || 0} items ready when you finalize
            your plan.
          </p>
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
