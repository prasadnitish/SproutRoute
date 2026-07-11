import { useState, useMemo } from "react";
import HeroTile from "../components/mosaic/HeroTile";
import WeatherTile from "../components/mosaic/WeatherTile";
import ItineraryTile from "../components/mosaic/ItineraryTile";
import SafetyTile from "../components/mosaic/SafetyTile";
import PetSafetyTile from "../components/mosaic/PetSafetyTile";
import RouteTimelineTile from "../components/mosaic/RouteTimelineTile";
import PremiumRouteMap from "../components/maps/PremiumRouteMap.jsx";
import ActivityDetailPanel from "../components/ActivityDetailPanel";
import PackingChecklist from "../components/PackingChecklist";
import { Icon } from "../components/Icon.jsx";
import { pointsFromActivities, pointsFromStops, toMapPoint } from "../utils/mapGeometry.js";

function resolveItinerary(rawDays, suggestedActivities) {
  if (!rawDays || rawDays.length === 0) return [];
  const activityMap = {};
  const activityNameMap = {};
  (suggestedActivities || []).forEach((a) => {
    if (a.id) activityMap[a.id] = a;
    if (a.name) activityNameMap[a.name.toLowerCase()] = a;
  });
  return rawDays.map((day) => {
    const rawActivities = day.activities || day.items || [];
    const resolvedActivities = rawActivities.map((act) =>
      typeof act === "string"
        ? activityMap[act] || activityNameMap[act.toLowerCase()] || { name: act, description: "" }
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

function parseRouteDay(value) {
  const direct = Number(value);
  if (Number.isFinite(direct) && direct > 0) return direct;
  const match = String(value || "").match(/\bday\s+(\d+)/i);
  return match ? Number(match[1]) : null;
}

function findRouteStopForDay(routePlan, day, dayIndex = 0) {
  const stops = routePlan?.stops || [];
  if (!stops.length) return null;

  const stopId = day?.stopId || day?.routeStopId;
  if (stopId) {
    const byId = stops.find((stop) => stop.id === stopId);
    if (byId) return byId;
  }

  const stopName = String(day?.stopName || day?.cityDisplayName || "").toLowerCase();
  if (stopName) {
    const byName = stops.find((stop) =>
      String(stop.name || stop.displayName || "").toLowerCase() === stopName
    );
    if (byName) return byName;
  }

  const routeDay = parseRouteDay(day?.routeDay || day?.day || day?.date) || dayIndex + 1;
  const byDay = stops.find((stop) =>
    routeDay >= (Number(stop.dayStart) || 1) &&
    routeDay <= (Number(stop.dayEnd) || Number(stop.dayStart) || 1)
  );
  return byDay || stops[Math.min(dayIndex, stops.length - 1)] || null;
}

function TabButton({ id, activeTab, setActiveTab, icon, label, count }) {
  const active = activeTab === id;
  return (
    <button
      aria-selected={active}
      onClick={() => setActiveTab(id)}
      className={`inline-flex items-center gap-2 px-4 sm:px-5 py-3 text-sm font-medium cursor-pointer transition border-b-2 -mb-px ${
        active
          ? "border-meadow-600 text-meadow-700 font-semibold"
          : "border-transparent text-gray-500 hover:text-gray-800"
      }`}
    >
      <Icon name={icon} size={14} />
      {label}
      {count != null && count > 0 && (
        <span
          className={`inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[11px] font-mono font-semibold ${
            active ? "bg-meadow-600 text-white" : "bg-gray-100 text-gray-600"
          }`}
        >
          {count}
        </span>
      )}
    </button>
  );
}

function FeedbackRow({ onFeedback }) {
  const [sent, setSent] = useState(null);
  const send = (dir) => {
    setSent(dir);
    onFeedback?.(dir);
  };
  if (sent) {
    return (
      <div className="mt-4 rounded-2xl border border-meadow-200 bg-meadow-50/60 p-4 text-center">
        <p className="text-[13px] text-meadow-800 font-medium">
          Thanks — we&rsquo;ll use this next time.
        </p>
      </div>
    );
  }
  return (
    <div className="mt-4 rounded-2xl border border-gray-200 bg-white p-4">
      <p className="text-[13px] font-semibold text-gray-900">Did this feel right?</p>
      <p className="text-[12px] text-gray-500 mt-0.5">Your signal tunes the next plan we build for you.</p>
      <div className="flex gap-2 mt-3">
        <button
          onClick={() => send("more")}
          className="flex-1 inline-flex items-center justify-center gap-1.5 text-[13px] font-medium text-gray-800 bg-gray-50 hover:bg-meadow-50 hover:text-meadow-800 border border-gray-200 hover:border-meadow-300 rounded-xl px-3 py-2 transition"
        >
          <Icon name="heart" size={13} /> More like this
        </button>
        <button
          onClick={() => send("less")}
          className="flex-1 inline-flex items-center justify-center gap-1.5 text-[13px] font-medium text-gray-800 bg-gray-50 hover:bg-red-50 hover:text-red-800 border border-gray-200 hover:border-red-200 rounded-xl px-3 py-2 transition"
        >
          <Icon name="x" size={13} /> Less like this
        </button>
      </div>
    </div>
  );
}

const STEP_LABELS = {
  resolve: "Understanding your trip",
  weather: "Checking the weather",
  itinerary: "Crafting your itinerary",
  packing: "Building packing list",
  safety: "Looking up safety info",
};

function LoadingBanner({ progress, steps }) {
  if (!progress || !steps?.length) return null;
  const done = steps.filter((s) => progress[s] === "done").length;
  const pct = Math.round((done / steps.length) * 100);
  if (pct === 100) return null;
  return (
    <div className="bg-meadow-50 border-b border-meadow-200 px-4 py-2">
      <div className="max-w-7xl mx-auto flex flex-col gap-1.5">
        <div className="flex items-center gap-3">
          <div className="h-1 flex-1 bg-meadow-100 rounded-full overflow-hidden">
            <div
              role="progressbar"
              aria-valuenow={pct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Trip generation progress"
              className="h-full bg-meadow-600 transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="text-[11px] font-mono font-semibold uppercase tracking-[0.12em] text-meadow-800 whitespace-nowrap">
            Building your trip plan
          </p>
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-0.5">
          {steps.map((s) => {
            const status = progress[s];
            const color =
              status === "done"
                ? "text-meadow-500"
                : status === "active"
                ? "text-meadow-800 font-semibold"
                : "text-meadow-700/60";
            return (
              <span key={s} className={`text-[11px] ${color}`}>
                {STEP_LABELS[s] || s}
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
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
  progress,
  steps,
}) {
  const [activeTab, setActiveTab] = useState("plan");
  const [selectedActivity, setSelectedActivity] = useState(null);
  const [activeDayMap, setActiveDayMap] = useState({ activities: [], day: null, dayIndex: 0 });

  const forecast = tripData?.weather?.forecast || tripData?.weather || [];
  const routePlan = tripData?.routePlan || null;
  const stopWeather = tripData?.stopWeather || {};
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
  const hasPets = (tripData?.trip?.pets?.length || parsedInput?.pets?.length || 0) > 0;
  const childCount = tripData?.parsed?.childrenAges?.length || parsedInput?.childrenAges?.length || 0;
  const routeMapPoints = useMemo(() => pointsFromStops(routePlan?.stops || []), [routePlan]);
  const activeDayPoints = useMemo(
    () => pointsFromActivities(activeDayMap.activities || []),
    [activeDayMap.activities],
  );
  const tripCenter = useMemo(
    () => toMapPoint({
      id: "destination",
      name: destination || "Destination",
      lat: tripData?.trip?.lat,
      lon: tripData?.trip?.lon,
    }, 0),
    [destination, tripData?.trip?.lat, tripData?.trip?.lon],
  );
  const activeDayFallbackCenter = useMemo(() => {
    const routeStop = findRouteStopForDay(routePlan, activeDayMap.day, activeDayMap.dayIndex);
    return routeStop ? toMapPoint(routeStop, activeDayMap.dayIndex || 0) : tripCenter;
  }, [activeDayMap.day, activeDayMap.dayIndex, routePlan, tripCenter]);

  // Pack count = total items
  const packCount = useMemo(() => {
    if (!packingList?.categories) return 0;
    return packingList.categories.reduce((sum, c) => sum + (c.items?.length || 0), 0);
  }, [packingList]);

  // Safety count = rough sum of advisories / tips / pet / car-seat (F4 count badge)
  const safetyCount = useMemo(() => {
    let n = 0;
    if (safetyData) {
      n += (safetyData.healthTips?.length || 0) + (safetyData.familyTips?.length || 0) + (safetyData.localCustoms?.length || 0);
      if (safetyData.advisoryLevel && safetyData.advisoryLevel !== "low") n += 1;
    }
    if (carSeatData?.children?.length) n += carSeatData.children.length;
    if (petSafetyData) n += 1;
    return n;
  }, [safetyData, carSeatData, petSafetyData]);

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
      <LoadingBanner progress={progress} steps={steps} />

      {/* Tab bar — three tabs, line icons, count badges (F4) */}
      <div
        className="flex gap-0 border-b border-gray-200 px-3 sm:px-4 sticky top-[57px] z-20 bg-[#f9fafb]/95 backdrop-blur-sm"
      >
        <TabButton id="plan" activeTab={activeTab} setActiveTab={setActiveTab} icon="calendar" label="Plan" />
        <TabButton id="pack" activeTab={activeTab} setActiveTab={setActiveTab} icon="bag" label="Pack" count={packCount} />
        <TabButton id="safety" activeTab={activeTab} setActiveTab={setActiveTab} icon="shield" label="Safety" count={safetyCount} />
      </div>

      {/* Plan tab */}
      {activeTab === "plan" && (
        <div className="p-3 sm:p-4">
          {/* Compact header — retires gradient hero (F4) */}
          <HeroTile
            tripData={tripData}
            parsedInput={parsedInput}
            onEdit={onGoBack}
          />

          {routePlan && (
            <div className="mt-3 space-y-3">
              <PremiumRouteMap
                eyebrow="Trip route"
                title={routePlan.title}
                points={routeMapPoints}
                totalDays={routePlan.totalDays}
              />
              <RouteTimelineTile
                routePlan={routePlan}
                stopWeather={stopWeather}
                receivedStopCount={Object.keys(tripData?.stopItineraries || {}).length}
              />
            </div>
          )}

          {/* Itinerary with weather folded into the day header (F4) */}
          <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1.08fr)_minmax(340px,0.92fr)] lg:items-start">
            <ItineraryTile
              dailyItinerary={dailyItinerary}
              scheduledItinerary={scheduledItinerary}
              forecast={forecast}
              onActivityTap={handleActivityTap}
              onDayChange={(activities, day, dayIndex) => setActiveDayMap({ activities, day, dayIndex })}
              hasPets={hasPets}
              totalChunks={tripData?._totalChunks || 1}
              receivedChunks={tripData?._receivedChunks || 1}
              tips={tripData?.tripPlan?.tips || []}
              destination={destination}
              tripDuration={tripData?.trip?.duration || 0}
              childCount={childCount}
              onOpenSafety={() => setActiveTab("safety")}
              isItineraryComplete={progress?.itinerary === "done"}
            />
            <PremiumRouteMap
              eyebrow="Day map"
              title={`Day ${(activeDayMap.dayIndex || 0) + 1} route`}
              points={activeDayPoints}
              fallbackCenter={activeDayFallbackCenter}
              routeMeta={activeDayMap.day?.routeMeta || null}
              minHeight="min-h-[380px]"
            />
          </div>

          {/* Full weather strip below itinerary for users who want the whole outlook */}
          <div className="mt-3">
            <WeatherTile
              forecast={forecast}
              tripStart={tripData?.parsed?.startDate || parsedInput?.startDate}
            />
          </div>

          {/* Feedback — bottom of Plan (F5) */}
          <FeedbackRow />
        </div>
      )}

      {/* Pack tab */}
      {activeTab === "pack" && (
        <div>
          {packingList ? (
            <PackingChecklist packingList={packingList} />
          ) : packingError ? (
            <div className="p-8 text-center text-gray-500" role="alert">
              <div className="mx-auto w-10 h-10 flex items-center justify-center rounded-full bg-red-50 text-red-600 mb-3">
                <Icon name="bag" size={18} />
              </div>
              <p className="font-medium text-red-600 mb-2">{packingError}</p>
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
              <div className="mx-auto w-10 h-10 flex items-center justify-center rounded-full bg-gray-100 text-gray-500 mb-3">
                <Icon name="bag" size={18} />
              </div>
              <p className="font-medium">Generating packing list&hellip;</p>
            </div>
          )}
        </div>
      )}

      {/* Safety tab — F4: own tab, not a bottom tile on Plan */}
      {activeTab === "safety" && (
        <div className="p-3 sm:p-4 space-y-3">
          <SafetyTile safetyData={safetyData} carSeatData={carSeatData} />
          {petSafetyData && <PetSafetyTile petSafetyData={petSafetyData} />}
          {!safetyData && !carSeatData && !petSafetyData && (
            <div className="p-8 text-center text-gray-500">
              <div className="mx-auto w-10 h-10 flex items-center justify-center rounded-full bg-gray-100 text-gray-500 mb-3">
                <Icon name="shield" size={18} />
              </div>
              <p className="font-medium">Gathering safety info…</p>
            </div>
          )}
        </div>
      )}

      <ActivityDetailPanel
        activity={selectedActivity}
        placesData={selectedKey ? enrichedData?.[selectedKey] : null}
        isOpen={!!selectedActivity}
        onClose={() => setSelectedActivity(null)}
      />
    </div>
  );
}
