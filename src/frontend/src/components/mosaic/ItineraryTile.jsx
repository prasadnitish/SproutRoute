import { useState } from "react";
import DayTabs from "../DayTabs";

export default function ItineraryTile({
  dailyItinerary,
  forecast,
  onActivityTap,
}) {
  const [activeDay, setActiveDay] = useState(0);

  if (!dailyItinerary || dailyItinerary.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-2xl p-4">
        <p className="text-xs uppercase tracking-wide font-semibold text-meadow-600 mb-2">
          {"\u{1F4C5}"} Itinerary
        </p>
        <p className="text-sm text-gray-400">No itinerary data yet</p>
      </div>
    );
  }

  // Build day tabs data
  const dayTabs = dailyItinerary.map((day, i) => ({
    label: day.date || `Day ${i + 1}`,
    date: day.date,
  }));

  const currentDay = dailyItinerary[activeDay] || dailyItinerary[0];
  const activities = currentDay?.activities || currentDay?.items || [];
  const dayForecast = forecast?.[activeDay];

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-4">
      {/* Label */}
      <p className="text-xs uppercase tracking-wide font-semibold text-meadow-600 mb-3">
        {"\u{1F4C5}"} Itinerary
      </p>

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
            {dayForecast.emoji || ""}{" "}
            {dayForecast.high ?? dayForecast.highTemp ?? ""}
            {dayForecast.high != null || dayForecast.highTemp != null
              ? "\u00B0"
              : ""}
          </span>
        )}
      </div>

      {/* Activities */}
      <div className="space-y-1">
        {activities.map((activity, i) => (
          <div
            key={i}
            onClick={() => onActivityTap?.(activity)}
            className="flex gap-3 p-3 rounded-xl cursor-pointer hover:bg-meadow-50 hover:border-meadow-200 border border-transparent transition"
          >
            {/* Emoji / thumbnail */}
            <div className="w-12 h-12 rounded-lg bg-gray-100 flex items-center justify-center text-2xl flex-shrink-0">
              {activity.emoji || "\u{1F3AF}"}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              {activity.time && (
                <p className="text-xs text-meadow-600 font-bold">
                  {activity.time}
                </p>
              )}
              <p className="font-bold text-gray-900 text-sm">
                {activity.name || activity.title || "Activity"}
              </p>
              {activity.description && (
                <p className="text-sm text-gray-500 line-clamp-2">
                  {activity.description}
                </p>
              )}
              {activity.tags && activity.tags.length > 0 && (
                <div className="flex gap-1 mt-1">
                  {activity.tags.map((tag, j) => (
                    <span
                      key={j}
                      className="text-[10px] bg-gray-100 text-gray-500 rounded-full px-2 py-0.5"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Hint */}
      {activities.length > 0 && (
        <p className="text-xs text-gray-400 text-center mt-3">
          &uarr; Tap any activity for details
        </p>
      )}
    </div>
  );
}
