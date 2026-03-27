import { useState, useMemo } from "react";
import HeroTile from "../components/mosaic/HeroTile";
import WeatherTile from "../components/mosaic/WeatherTile";
import ItineraryTile from "../components/mosaic/ItineraryTile";
import SafetyTile from "../components/mosaic/SafetyTile";
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
    // If activities are already full objects, pass through
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
    <div className="w-full max-w-5xl mx-auto">
      {/* Tab bar */}
      <div className="flex gap-0 border-b border-gray-200 mb-0 px-4">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-5 py-3 text-sm font-medium cursor-pointer transition ${
              activeTab === tab.key
                ? "border-b-2 border-meadow-600 text-meadow-600 font-bold"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Plan tab */}
      {activeTab === "plan" && (
        <div className="grid grid-cols-1 lg:grid-cols-[1.5fr_1fr] gap-3 p-4">
          {/* Col 1: Hero spans 2 rows on lg */}
          <div className="lg:row-span-2">
            <HeroTile
              tripData={tripData}
              parsedInput={parsedInput}
              onEdit={onGoBack}
            />
          </div>

          {/* Col 2, row 1: Weather */}
          <div>
            <WeatherTile forecast={forecast} />
          </div>

          {/* Col 1, rows 2-3: Itinerary */}
          <div className="lg:col-start-1 lg:row-start-3">
            <ItineraryTile
              dailyItinerary={dailyItinerary}
              forecast={forecast}
              onActivityTap={handleActivityTap}
            />
          </div>

          {/* Col 2, row 2: Safety */}
          <div>
            <SafetyTile safetyData={safetyData} />
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
