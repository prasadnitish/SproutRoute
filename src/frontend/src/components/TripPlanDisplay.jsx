// Trip-plan presenter:
// - Activity customizer ABOVE day cards (fixes CLAUDE.md #7)
// - Day cards with actual calendar dates + inline weather
// - Weather carousel summary
// - Vertical layout on desktop, horizontal scroll on mobile
import { useState, useEffect, useRef } from "react";
import { format, addDays } from "date-fns";
import { motion } from "framer-motion";

export default function TripPlanDisplay({
  tripPlan,
  weather,
  onApprove,
  isVisible,
  startDate,
}) {
  const [selectedActivities, setSelectedActivities] = useState(new Set());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeDayIndex, setActiveDayIndex] = useState(0);
  const dayCarouselRef = useRef(null);

  useEffect(() => {
    if (tripPlan?.suggestedActivities) {
      setSelectedActivities(
        new Set(tripPlan.suggestedActivities.map((a) => a.id)),
      );
    }
  }, [tripPlan]);

  useEffect(() => {
    const container = dayCarouselRef.current;
    if (!container) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const index = Number(entry.target.dataset.dayIndex);
            if (!isNaN(index)) setActiveDayIndex(index);
          }
        }
      },
      { root: container, threshold: 0.6 },
    );

    const cards = container.querySelectorAll("[data-day-index]");
    cards.forEach((card) => observer.observe(card));
    return () => observer.disconnect();
  }, [tripPlan?.dailyItinerary]);

  const activityNameMap = Object.fromEntries(
    (tripPlan.suggestedActivities || []).map((a) => [a.id, a.name]),
  );

  const toggleActivity = (activityId) => {
    const newSelected = new Set(selectedActivities);
    if (newSelected.has(activityId)) newSelected.delete(activityId);
    else newSelected.add(activityId);
    setSelectedActivities(newSelected);
  };

  const handleApprove = async () => {
    const approved = tripPlan.suggestedActivities.filter((a) =>
      selectedActivities.has(a.id),
    );
    setIsSubmitting(true);
    try {
      await onApprove(approved);
    } finally {
      setIsSubmitting(false);
    }
  };

  const hasChanges =
    tripPlan?.suggestedActivities &&
    selectedActivities.size !== tripPlan.suggestedActivities.length;

  const getCategoryLabel = (category) => {
    const labels = {
      beach: "🏖 Beach", hiking: "🥾 Hiking", city: "🏙 City",
      museums: "🏛 Museums", parks: "🌳 Parks", dining: "🍽 Dining",
      shopping: "🛍 Shopping", sports: "⚽ Sports", water: "🌊 Water",
      wildlife: "🦁 Wildlife", theme_park: "🎢 Theme park", camping: "⛺ Camping",
      water_parks: "💦 Water Parks", road_trip: "🚗 Road Trip",
    };
    return labels[category] || "🗺 Activity";
  };

  const getWeatherIcon = (condition = "") => {
    const c = condition.toLowerCase();
    if (c.includes("sun") || c.includes("clear")) return "☀️";
    if (c.includes("cloud")) return "⛅";
    if (c.includes("rain") || c.includes("shower")) return "🌧";
    if (c.includes("snow")) return "❄️";
    if (c.includes("storm") || c.includes("thunder")) return "⛈";
    return "🌤";
  };

  // Build date label for each day card
  const getDayDate = (index) => {
    if (!startDate) return null;
    try {
      const date = addDays(new Date(startDate + "T12:00:00"), index);
      return format(date, "EEE, MMM d");
    } catch {
      return null;
    }
  };

  const dailyItinerary = tripPlan.dailyItinerary || [];
  const forecast = weather?.forecast || [];

  return (
    <div className="space-y-5 overflow-hidden">
      {/* Header + overview */}
      <div className="rounded-2xl border border-sprout-light dark:border-dark-border bg-white dark:bg-dark-card shadow-card dark:shadow-soft-dark p-6">
        <p className="text-xs font-bold uppercase tracking-wider text-muted dark:text-dark-muted">
          🗓 Trip plan
        </p>
        <h3 className="font-heading text-xl font-bold text-sprout-dark dark:text-dark-sprout mt-1">
          Your itinerary
        </h3>
        <p className="text-sm text-muted dark:text-dark-muted mt-1">
          {tripPlan.overview}
        </p>
      </div>

      {/* Activity customizer — ABOVE day cards (fixes CLAUDE.md #7) */}
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          className="rounded-xl border border-sky-light dark:border-dark-border bg-sky-light/20 dark:bg-dark-bg p-5 space-y-4"
        >
          <div>
            <h4 className="font-heading text-lg font-bold text-sprout-dark dark:text-dark-sprout">
              Customize activities
              <span className="text-sm font-normal text-muted ml-2">
                ({selectedActivities.size} selected)
              </span>
            </h4>
            <p className="text-sm text-muted dark:text-dark-muted mt-1">
              Deselect activities you don't want — we'll refresh your itinerary.
            </p>
          </div>

          <div className="scroll-carousel">
            {tripPlan.suggestedActivities.map((activity) => {
              const isSelected = selectedActivities.has(activity.id);
              return (
                <label
                  key={activity.id}
                  className={`w-[16rem] cursor-pointer rounded-xl border p-4 transition-all ${
                    isSelected
                      ? "border-sprout-base bg-sprout-light/60 dark:bg-dark-card shadow-card"
                      : "border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg hover:border-sprout-light dark:hover:border-dark-sprout"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleActivity(activity.id)}
                      className="mt-1 h-5 w-5 rounded"
                    />
                    <div className="flex-1 min-w-0">
                      <span className="text-xs font-semibold text-muted">
                        {getCategoryLabel(activity.category)}
                      </span>
                      <h5 className="font-semibold text-slate-text dark:text-dark-text truncate">
                        {activity.name}
                      </h5>
                      <p className="text-xs text-muted dark:text-dark-muted mt-1 line-clamp-2">
                        {activity.description}
                      </p>
                      <div className="flex flex-wrap items-center gap-1.5 mt-2 text-xs text-muted">
                        <span>⏱ {activity.duration}</span>
                        {activity.kidFriendly && (
                          <span className="bg-sprout-light text-sprout-dark px-1.5 py-0.5 rounded-full font-semibold text-[10px]">
                            🌱 Kid-friendly
                          </span>
                        )}
                        {activity.weatherDependent && (
                          <span className="bg-sky-light text-sky-dark px-1.5 py-0.5 rounded-full font-medium text-[10px]">
                            Weather
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </label>
              );
            })}
          </div>

          <div className="flex gap-3 pt-1">
            <button
              onClick={handleApprove}
              disabled={selectedActivities.size === 0 || isSubmitting}
              className="flex-1 rounded-xl bg-sprout-dark text-white py-3 px-6 font-semibold text-sm hover:bg-sprout-base transition-colors disabled:opacity-60 shadow-soft"
            >
              {isSubmitting
                ? "Refreshing itinerary..."
                : hasChanges
                  ? `🔄 Refresh Itinerary (${selectedActivities.size} activities)`
                  : `Apply changes (${selectedActivities.size} activities)`}
            </button>
          </div>

          {selectedActivities.size === 0 && (
            <p className="text-sm text-red-600 dark:text-red-400 text-center">
              Please select at least one activity to continue.
            </p>
          )}
        </motion.div>
      )}

      {/* Weather carousel */}
      {forecast.length > 0 && (
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-muted dark:text-dark-muted mb-2 px-1">
            🌤 Weather forecast
          </p>
          <div className="scroll-carousel">
            {forecast.map((day, i) => (
              <div
                key={i}
                className="w-[8rem] rounded-xl border border-sprout-light dark:border-dark-border bg-white dark:bg-dark-card p-3 text-center"
              >
                <p className="text-xs font-semibold text-sprout-dark dark:text-dark-sprout truncate">
                  {getDayDate(i) || day.day || `Day ${i + 1}`}
                </p>
                <p className="text-2xl my-1">{getWeatherIcon(day.condition)}</p>
                <p className="text-sm font-bold text-slate-text dark:text-dark-text">
                  {day.high}° / {day.low}°
                </p>
                <p className="text-[10px] text-muted dark:text-dark-muted truncate mt-0.5">
                  {day.condition}
                </p>
                {day.precipitation > 0 && (
                  <p className="text-[10px] text-sky-dark mt-0.5">
                    💧 {day.precipitation}%
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Day-by-day cards */}
      {dailyItinerary.length > 0 && (
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-muted dark:text-dark-muted mb-2 px-1">
            📋 Day-by-day
          </p>

          {/* Desktop: vertical stack / Mobile: horizontal scroll */}
          <div className="hidden md:block space-y-3">
            {dailyItinerary.map((day, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                className="rounded-xl border border-sprout-light dark:border-dark-border bg-white dark:bg-dark-card p-5 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <h5 className="font-semibold text-sprout-dark dark:text-dark-sprout text-sm">
                      {day.day}
                    </h5>
                    {getDayDate(index) && (
                      <span className="text-xs text-muted dark:text-dark-muted">
                        — {getDayDate(index)}
                      </span>
                    )}
                  </div>
                  {forecast[index] && (
                    <div className="flex items-center gap-1.5 text-xs text-muted dark:text-dark-muted">
                      <span>{getWeatherIcon(forecast[index].condition)}</span>
                      <span className="font-semibold text-slate-text dark:text-dark-text">
                        {forecast[index].high}°/{forecast[index].low}°
                      </span>
                    </div>
                  )}
                </div>

                {day.activities && day.activities.length > 0 && (
                  <div className="space-y-1.5">
                    {day.activities.map((id, ai) => (
                      <p key={ai} className="text-sm text-slate-text dark:text-dark-text flex items-start gap-2">
                        <span className="text-sprout-base mt-0.5">●</span>
                        {activityNameMap[id] || id}
                      </p>
                    ))}
                  </div>
                )}

                {day.meals && (
                  <p className="text-xs text-muted dark:text-dark-muted">🍽 {day.meals}</p>
                )}
                {day.notes && (
                  <p className="text-xs text-muted dark:text-dark-muted italic">
                    {day.notes}
                  </p>
                )}
              </motion.div>
            ))}
          </div>

          {/* Mobile: horizontal scroll carousel */}
          <div className="md:hidden">
            <div className="scroll-carousel" ref={dayCarouselRef}>
              {dailyItinerary.map((day, index) => (
                <div
                  key={index}
                  data-day-index={index}
                  className="w-[18rem] rounded-xl border border-sprout-light dark:border-dark-border bg-white dark:bg-dark-card p-4 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h5 className="font-semibold text-sprout-dark dark:text-dark-sprout text-sm">
                        {day.day}
                      </h5>
                      {getDayDate(index) && (
                        <p className="text-[10px] text-muted dark:text-dark-muted">
                          {getDayDate(index)}
                        </p>
                      )}
                    </div>
                    <span className="text-xs text-muted dark:text-dark-muted">
                      {index + 1}/{dailyItinerary.length}
                    </span>
                  </div>

                  {forecast[index] && (
                    <div className="flex items-center gap-2 text-xs text-muted dark:text-dark-muted">
                      <span>{getWeatherIcon(forecast[index].condition)}</span>
                      <span className="font-semibold text-slate-text dark:text-dark-text">
                        {forecast[index].high}° / {forecast[index].low}°
                      </span>
                      <span>{forecast[index].condition}</span>
                    </div>
                  )}

                  {day.activities && day.activities.length > 0 && (
                    <div className="space-y-1">
                      {day.activities.map((id, ai) => (
                        <p key={ai} className="text-sm text-slate-text dark:text-dark-text">
                          • {activityNameMap[id] || id}
                        </p>
                      ))}
                    </div>
                  )}

                  {day.meals && (
                    <p className="text-xs text-muted dark:text-dark-muted">🍽 {day.meals}</p>
                  )}
                  {day.notes && (
                    <p className="text-xs text-muted dark:text-dark-muted italic">
                      {day.notes}
                    </p>
                  )}
                </div>
              ))}
            </div>

            {dailyItinerary.length > 1 && (
              <div className="page-dots">
                {dailyItinerary.map((_, i) => (
                  <div
                    key={i}
                    className={`page-dot ${i === activeDayIndex ? "active" : ""}`}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
