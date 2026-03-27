import { useState } from "react";
import DayTabs from "../DayTabs";

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

function ActivityCard({ activity, onTap }) {
  const isMeal = activity.isMeal || activity.status === "meal";
  const isClosed = activity.status === "closed";
  const name = activity.name || activity.title || "Activity";
  const emoji = activity.emoji || CATEGORY_EMOJI[activity.category] || (isMeal ? "\u{1F37D}" : "\u{1F3AF}");
  const enriched = activity.enriched;
  const photoUrl = enriched?.photos?.[0];

  return (
    <div
      onClick={() => !isMeal && onTap?.(activity)}
      className={`relative flex gap-3 p-3 rounded-xl border transition ${
        isClosed
          ? "border-red-100 bg-red-50/50 opacity-70"
          : isMeal
            ? "border-amber-100 bg-amber-50/30"
            : "border-transparent hover:bg-meadow-50 hover:border-meadow-200 cursor-pointer"
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
        <div className="flex items-center gap-2 flex-wrap">
          <p className={`font-bold text-sm ${isClosed ? "text-red-700 line-through" : "text-gray-900"}`}>
            {name}
          </p>
          {enriched && <Stars rating={enriched.rating} />}
          {enriched && <PriceLevel level={enriched.priceLevel} />}
        </div>

        {activity.description && (
          <p className="text-xs text-gray-500 line-clamp-2 mt-0.5">
            {activity.description}
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

export default function ItineraryTile({
  dailyItinerary,
  scheduledItinerary,
  forecast,
  onActivityTap,
}) {
  const [activeDay, setActiveDay] = useState(0);

  // Use scheduled data if available, fall back to raw itinerary
  const days = scheduledItinerary || dailyItinerary;

  if (!days || days.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-2xl p-4">
        <p className="text-xs uppercase tracking-wide font-semibold text-meadow-600 mb-2">
          {"\u{1F4C5}"} Itinerary
        </p>
        <p className="text-sm text-gray-400">No itinerary data yet</p>
      </div>
    );
  }

  const isScheduled = !!scheduledItinerary;
  const dayTabs = days.map((day, i) => ({
    label: day.date || day.day || `Day ${i + 1}`,
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
      <DayTabs days={dayTabs} activeDay={activeDay} onSelectDay={setActiveDay} />

      {/* Day header */}
      <div className="flex items-center gap-2 mt-3 mb-2">
        {currentDay.date && (
          <span className="text-sm font-medium text-gray-700">
            {currentDay.date}
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

      {/* Activities timeline */}
      <div className="space-y-0.5">
        {activities.map((activity, i) => (
          <ActivityCard
            key={i}
            activity={activity}
            onTap={onActivityTap}
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
    </div>
  );
}
