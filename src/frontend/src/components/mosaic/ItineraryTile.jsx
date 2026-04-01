import { useState, useEffect } from "react";
import DayTabs from "../DayTabs";
import LoadingEngagement from "../LoadingEngagement";

const CATEGORY_EMOJI = {
  beach: "\u{1F3D6}", hiking: "\u{1F3D4}", city: "\u{1F3D9}", museums: "\u{1F3DB}",
  parks: "\u{1F333}", dining: "\u{1F37D}", shopping: "\u{1F6CD}", sports: "\u{26BD}",
  water: "\u{1F30A}", wildlife: "\u{1F98B}", theme_park: "\u{1F3A2}", camping: "\u{26FA}",
  cruise: "\u{1F6F3}", shore_excursion: "\u{2693}", spa: "\u{1F9D6}",
};

function Stars({ rating }) {
  if (!rating) return null;
  const full = Math.floor(rating);
  const half = rating - full >= 0.5;
  return (
    <span className="text-[11px] text-amber-500 flex items-center gap-0.5">
      {"★".repeat(full)}{half ? "½" : ""}
      <span className="text-gray-400 ml-0.5">{rating}</span>
    </span>
  );
}

function PriceLevel({ level }) {
  if (level == null) return null;
  const symbols = "$".repeat(Math.max(1, level));
  return <span className="text-[10px] text-gray-400">{symbols}</span>;
}

function PetBadge({ petFriendly, hasPets }) {
  if (!hasPets) return null;
  if (petFriendly === true) {
    return (
      <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold bg-meadow-50 text-meadow-700 rounded-full px-1.5 py-0.5">
        {"\uD83D\uDC3E"} Pet friendly
      </span>
    );
  }
  if (petFriendly === false) {
    return (
      <span className="inline-flex items-center gap-0.5 text-[10px] font-medium bg-amber-50 text-amber-600 rounded-full px-1.5 py-0.5">
        {"\u26A0\uFE0F"} No pets
      </span>
    );
  }
  return null;
}

function DaycareSuggestion() {
  return (
    <div className="flex gap-3 p-3 rounded-xl border border-amber-100 bg-amber-50/40">
      <div className="flex flex-col items-center flex-shrink-0 w-14">
        <span className="text-lg">{"\uD83D\uDC3E"}</span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-bold text-amber-700">Pet daycare suggestion</p>
        <p className="text-[10px] text-amber-600 mt-0.5">
          This day has several no-pets activities. Consider booking a nearby pet daycare
          or pet-sitting service so your furry friend is well cared for.
        </p>
      </div>
    </div>
  );
}

function ActivityCard({ activity, onTap, hasPets }) {
  const isMeal = activity.isMeal || activity.status === "meal";
  const isClosed = activity.status === "closed";
  const name = activity.name || activity.title || "Activity";
  const mealEmojis = { breakfast: "\u{2615}", lunch: "\u{1F37D}", dinner: "\u{1F377}" };
  const emoji = isMeal
    ? (mealEmojis[activity.mealType] || "\u{1F37D}")
    : (activity.emoji || CATEGORY_EMOJI[activity.category] || "\u{1F3AF}");
  const enriched = activity.enriched;
  const photoUrl = enriched?.photos?.[0];

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onTap?.(activity)}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onTap?.(activity); } }}
      aria-label={`View details for ${activity.name || activity.title || "activity"}`}
      className={`relative flex gap-3 p-3 rounded-xl border transition cursor-pointer ${
        isClosed
          ? "border-red-100 bg-red-50/50 opacity-70"
          : isMeal
            ? "border-amber-100 bg-amber-50/30 hover:bg-amber-50"
            : "border-transparent hover:bg-meadow-50 hover:border-meadow-200"
      }`}
    >
      {/* Timeline dot */}
      <div className="flex flex-col items-center flex-shrink-0 w-14">
        {activity.scheduledStart && (
          <span className={`text-xs font-bold ${isMeal ? "text-amber-600" : "text-meadow-600"}`}>
            {activity.scheduledStart}
          </span>
        )}
        {/* Thumbnail or emoji */}
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-lg mt-1 overflow-hidden ${
          photoUrl ? "" : "bg-gray-100"
        }`}>
          {photoUrl ? (
            <img src={photoUrl} alt={name} className="w-full h-full object-cover rounded-lg" />
          ) : (
            emoji
          )}
        </div>
        {activity.scheduledEnd && (
          <span className="text-[10px] text-gray-400 mt-0.5">
            {activity.scheduledEnd}
          </span>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {/* Meal type badge — prominent label above restaurant name */}
        {isMeal && activity.mealType && (
          <span className="inline-block text-[10px] font-bold uppercase tracking-wider bg-amber-500 text-white rounded px-2 py-0.5 mb-1">
            {activity.mealType}
          </span>
        )}

        <div className="flex items-center gap-2 flex-wrap">
          <p className={`font-bold text-sm ${isClosed ? "text-red-700 line-through" : "text-gray-900"}`}>
            {name}
          </p>
          {enriched && <Stars rating={enriched.rating} />}
          {enriched && <PriceLevel level={enriched.priceLevel} />}
          <PetBadge petFriendly={activity.petFriendly} hasPets={hasPets} />
        </div>

        {/* Category label for activities */}
        {!isMeal && activity.category && (
          <span className="inline-block text-[10px] font-semibold bg-meadow-50 text-meadow-700 rounded-full px-2 py-0.5 mt-0.5 capitalize">
            {activity.category.replace(/_/g, " ")}
          </span>
        )}

        {/* Cuisine tag + note for meals */}
        {isMeal && activity.cuisine && (
          <span className="inline-block text-[10px] bg-amber-100 text-amber-700 rounded-full px-2 py-0.5 mt-0.5">
            {activity.cuisine}
          </span>
        )}
        {isMeal && activity.note && (
          <p className="text-xs text-amber-600/80 mt-0.5">{activity.note}</p>
        )}

        {activity.description && !isMeal && (
          <p className="text-xs text-gray-500 line-clamp-2 mt-0.5">
            {activity.description}
          </p>
        )}

        {activity.whyRecommended && !isMeal && (
          <p className="text-[11px] text-meadow-700 mt-1 line-clamp-2">
            Why this fits: {activity.whyRecommended}
          </p>
        )}

        {/* Enriched details row */}
        {enriched?.address && (
          <p className="text-[10px] text-gray-400 mt-1 truncate">
            {"\u{1F4CD}"} {enriched.address}
          </p>
        )}

        {activity.openingHours && (
          <p className="text-[10px] text-gray-400">
            {"\u{1F552}"} Open {activity.openingHours}
          </p>
        )}

        {/* Warning */}
        {activity.warning && (
          <p className="text-[10px] text-amber-600 font-medium mt-1">
            {"\u{26A0}"} {activity.warning}
          </p>
        )}

        {/* Duration chip */}
        {activity.duration && !isMeal && (
          <span className="inline-block text-[10px] bg-gray-100 text-gray-500 rounded-full px-2 py-0.5 mt-1">
            {activity.duration >= 60
              ? `${Math.round(activity.duration / 60 * 10) / 10}h`
              : `${activity.duration}min`}
          </span>
        )}
      </div>
    </div>
  );
}

function TripTips({ tips }) {
  if (!tips || tips.length === 0) return null;
  return (
    <div className="mt-4 bg-amber-50 border border-amber-200 rounded-xl p-4">
      <p className="text-xs uppercase tracking-wide font-semibold text-amber-700 mb-2">
        {"\u{1F4A1}"} Trip Tips
      </p>
      <ul className="space-y-1.5">
        {tips.map((tip, i) => (
          <li key={i} className="flex gap-2 text-sm text-gray-700">
            <span className="text-amber-500 flex-shrink-0">{"\u2022"}</span>
            <span>{tip}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function ItineraryTile({
  dailyItinerary,
  scheduledItinerary,
  forecast,
  onActivityTap,
  onDayChange,
  hasPets = false,
  totalChunks = 1,
  receivedChunks = 1,
  tips = [],
  destination = "",
  tripDuration = 0,
  childCount = 0,
}) {
  const [activeDay, setActiveDay] = useState(0);

  const handleDayChange = (dayIndex) => {
    setActiveDay(dayIndex);
    const days = scheduledItinerary || dailyItinerary;
    if (days && onDayChange) {
      const day = days[dayIndex];
      const activities = day?.scheduled || day?.activities || day?.items || [];
      onDayChange(activities);
    }
  };

  // Use scheduled data if available, fall back to raw itinerary
  const days = scheduledItinerary || dailyItinerary;

  // Notify parent of initial day's activities for the route map
  useEffect(() => {
    if (days?.length > 0 && onDayChange) {
      const day = days[0];
      onDayChange(day?.scheduled || day?.activities || day?.items || []);
    }
  }, [days]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!days || days.length === 0) {
    return (
      <LoadingEngagement
        destination={destination}
        duration={tripDuration}
        childCount={childCount}
      />
    );
  }

  const isScheduled = !!scheduledItinerary;

  const formatDayLabel = (dateStr, index) => {
    if (!dateStr) return `Day ${index + 1}`;
    try {
      const d = new Date(dateStr + "T12:00:00");
      const dayName = d.toLocaleDateString("en-US", { weekday: "short" });
      const month = d.toLocaleDateString("en-US", { month: "short" });
      const dayNum = d.getDate();
      return `${dayName}, ${month} ${dayNum}`;
    } catch { return dateStr; }
  };

  const dayTabs = days.map((day, i) => ({
    label: formatDayLabel(day.date, i),
    date: day.date,
  }));

  const currentDay = days[activeDay] || days[0];
  const activities = isScheduled
    ? (currentDay?.scheduled || [])
    : (currentDay?.activities || currentDay?.items || []);
  const dayForecast = forecast?.[activeDay];
  const warnings = isScheduled ? (currentDay?.warnings || []) : [];

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-4">
      {/* Label */}
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs uppercase tracking-wide font-semibold text-meadow-600">
          {"\u{1F4C5}"} Itinerary
        </p>
        {isScheduled && (
          <span className="text-[10px] bg-meadow-50 text-meadow-600 rounded-full px-2 py-0.5">
            {"\u{2705}"} Verified hours
          </span>
        )}
      </div>

      {/* Day tabs */}
      <DayTabs days={dayTabs} activeDay={activeDay} onSelectDay={handleDayChange} />

      {/* Loading indicator for additional chunks */}
      {totalChunks > 1 && receivedChunks < totalChunks && (
        <div className="flex items-center gap-2 mt-1 mb-1 text-xs text-meadow-600 animate-pulse">
          <span className="inline-block w-3 h-3 border-2 border-meadow-500 border-t-transparent rounded-full animate-spin" />
          Loading more days ({receivedChunks}/{totalChunks})...
        </div>
      )}

      {/* Day header */}
      <div className="flex items-center gap-2 mt-3 mb-2">
        {currentDay.date && (
          <span className="text-sm font-medium text-gray-700">
            {formatDayLabel(currentDay.date, activeDay)}
          </span>
        )}
        {dayForecast && (
          <span className="text-xs text-gray-400">
            {dayForecast.high ?? dayForecast.highTemp ?? ""}
            {dayForecast.high != null || dayForecast.highTemp != null ? "\u00B0" : ""}
          </span>
        )}
      </div>

      {/* Day-level warnings */}
      {warnings.filter(w => w.type === "closed").length > 0 && (
        <div className="bg-red-50 border border-red-100 rounded-lg p-2 mb-2">
          <p className="text-xs text-red-600 font-medium">
            {"\u{26A0}"} {warnings.filter(w => w.type === "closed").length} activity(ies) closed on this day
          </p>
        </div>
      )}

      {/* Daycare suggestion when 2+ non-pet-friendly activities in a day */}
      {hasPets &&
        activities.filter((a) => a.petFriendly === false).length >= 2 && (
          <DaycareSuggestion />
        )}

      {/* Activities timeline */}
      <div className="space-y-0.5">
        {activities.map((activity, i) => (
          <ActivityCard
            key={i}
            activity={activity}
            onTap={onActivityTap}
            hasPets={hasPets}
          />
        ))}
      </div>

      {/* Notes */}
      {currentDay.notes && (
        <p className="text-xs text-gray-400 mt-3 px-2 italic">
          {"\u{1F4DD}"} {currentDay.notes}
        </p>
      )}

      {/* Hint */}
      {activities.length > 0 && !activities.every(a => a.isMeal) && (
        <p className="text-xs text-gray-400 text-center mt-3">
          &uarr; Tap any activity for details
        </p>
      )}

      {/* Trip tips — shown below itinerary */}
      <TripTips tips={tips} />
    </div>
  );
}
