// Trip-plan presenter:
// - Displays AI itinerary details + weather context.
// - Lets users select approved activities before regenerating packing lists.
// - Keeps selection state local so parent page only handles final approval.
import { useState, useEffect } from "react";

export default function TripPlanDisplay({ tripPlan, weather, onApprove, isVisible }) {
  const [selectedActivities, setSelectedActivities] = useState(new Set());
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Open by default so users see the itinerary immediately on first load.
  const [isItineraryOpen, setIsItineraryOpen] = useState(true);

  // Initialize selected activities whenever a new plan arrives.
  useEffect(() => {
    if (tripPlan?.suggestedActivities) {
      setSelectedActivities(new Set(tripPlan.suggestedActivities.map((a) => a.id)));
    }
  }, [tripPlan]);

  // Resolve activity IDs in dailyItinerary to their display names.
  const activityNameMap = Object.fromEntries(
    (tripPlan.suggestedActivities || []).map((a) => [a.id, a.name]),
  );

  // Toggle activities used to regenerate the packing list.
  const toggleActivity = (activityId) => {
    const newSelected = new Set(selectedActivities);
    if (newSelected.has(activityId)) {
      newSelected.delete(activityId);
    } else {
      newSelected.add(activityId);
    }
    setSelectedActivities(newSelected);
  };

  const handleApprove = async () => {
    // Sends only approved activities upstream so packing regeneration stays intentional.
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

  const getCategoryLabel = (category) => {
    // Friendly labels keep category taxonomy readable without exposing raw keys.
    const labels = {
      beach: "🏖 Beach",
      hiking: "🥾 Hiking",
      city: "🏙 City",
      museums: "🏛 Museums",
      parks: "🌳 Parks",
      dining: "🍽 Dining",
      shopping: "🛍 Shopping",
      sports: "⚽ Sports",
      water: "🌊 Water",
      wildlife: "🦁 Wildlife",
      theme_park: "🎢 Theme park",
      camping: "⛺ Camping",
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

  return (
    <div className="space-y-5 rounded-2xl border border-sprout-light bg-white shadow-soft p-6">
      {/* Header */}
      <div>
        <p className="text-xs font-bold uppercase tracking-wider text-muted">
          🗓 Trip plan
        </p>
        <h3 className="font-heading text-xl font-bold text-sprout-dark mt-1">
          Your itinerary
        </h3>
        <p className="text-sm text-muted mt-1">{tripPlan.overview}</p>
      </div>

      {/* Activity customizer — rendered ABOVE itinerary so users see it first */}
      {isVisible && (
        <div className="rounded-xl border border-sky-light bg-sky-light/20 p-5 space-y-4">
          <div>
            <h4 className="font-heading text-lg font-bold text-sprout-dark">
              Customize activities
              <span className="text-sm font-normal text-muted ml-2">
                ({selectedActivities.size} selected)
              </span>
            </h4>
            <p className="text-sm text-muted mt-1">
              Select the activities you want — we'll update the packing list to match.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {tripPlan.suggestedActivities.map((activity) => {
              const isSelected = selectedActivities.has(activity.id);

              return (
                <label
                  key={activity.id}
                  className={`cursor-pointer rounded-xl border p-4 transition-all ${
                    isSelected
                      ? "border-sprout-base bg-sprout-light/60 shadow-soft"
                      : "border-gray-200 bg-white hover:border-sprout-light hover:bg-sprout-light/20"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleActivity(activity.id)}
                      className="mt-1 h-5 w-5 rounded"
                    />
                    <div className="flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <span className="text-xs font-semibold text-muted">
                            {getCategoryLabel(activity.category)}
                          </span>
                          <h5 className="font-semibold text-slate-text">
                            {activity.name}
                          </h5>
                        </div>
                        {activity.kidFriendly && (
                          <span className="text-xs bg-sprout-light text-sprout-dark px-2 py-0.5 rounded-full font-semibold whitespace-nowrap">
                            🌱 Kid-friendly
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-muted mt-1.5">
                        {activity.description}
                      </p>
                      <div className="flex flex-wrap items-center gap-2 mt-2 text-xs text-muted">
                        <span>⏱ {activity.duration}</span>
                        {activity.weatherDependent && (
                          <span className="bg-sky-light text-sky-dark px-2 py-0.5 rounded-full font-medium">
                            Weather-dependent
                          </span>
                        )}
                      </div>
                      {activity.bestDays && activity.bestDays.length > 0 && (
                        <p className="text-xs text-muted mt-1">
                          Best: {activity.bestDays.join(", ")}
                        </p>
                      )}
                      <p className="text-xs text-muted mt-1.5 italic">
                        {activity.reason}
                      </p>
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
                ? "Updating packing list..."
                : `Update packing list (${selectedActivities.size} activities)`}
            </button>
          </div>

          {selectedActivities.size === 0 && (
            <p className="text-sm text-red-600 text-center">
              Please select at least one activity to continue.
            </p>
          )}
        </div>
      )}

      {/* Collapsible detailed itinerary — open by default */}
      <div>
        <button
          onClick={() => setIsItineraryOpen((prev) => !prev)}
          className="flex w-full items-center justify-between rounded-xl border border-sprout-light bg-sprout-light/50 px-4 py-3 text-left text-sm font-semibold text-sprout-dark transition hover:bg-sprout-light"
        >
          <span>📋 Detailed itinerary</span>
          <span className="text-xs font-normal text-muted">
            {isItineraryOpen ? "▲ Hide" : "▼ Show"}
          </span>
        </button>

        {isItineraryOpen && (
          <div className="mt-4 space-y-3">
            {tripPlan.dailyItinerary && tripPlan.dailyItinerary.length > 0 && (
              <div className="space-y-3">
                {tripPlan.dailyItinerary.map((day, index) => (
                  <div
                    key={index}
                    className="rounded-xl border border-sprout-light bg-sprout-light/30 p-4"
                  >
                    <h5 className="font-semibold text-sprout-dark">
                      {day.day}
                    </h5>
                    {day.activities && day.activities.length > 0 && (
                      <p className="text-sm text-slate-text mt-1">
                        {day.activities
                          .map((id) => activityNameMap[id] || id)
                          .join(" · ")}
                      </p>
                    )}
                    {day.meals && (
                      <p className="text-sm text-muted mt-1">🍽 {day.meals}</p>
                    )}
                    {day.notes && (
                      <p className="text-xs text-muted mt-1 italic">
                        {day.notes}
                      </p>
                    )}
                    {weather?.forecast?.[index] && (
                      // UI pairs itinerary day and forecast by index from generated outputs.
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted mt-3 pt-2 border-t border-sprout-light">
                        <span>
                          {getWeatherIcon(weather.forecast[index].condition)}
                        </span>
                        <span className="font-semibold text-slate-text">
                          {weather.forecast[index].high}° /{" "}
                          {weather.forecast[index].low}°
                        </span>
                        <span>{weather.forecast[index].condition}</span>
                        {weather.forecast[index].precipitation > 0 && (
                          <span className="bg-sky-light text-sky-dark px-2 py-0.5 rounded-full font-medium">
                            {weather.forecast[index].precipitation}% rain
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {tripPlan.tips && tripPlan.tips.length > 0 && (
              <div className="rounded-xl border border-sun/40 bg-sun/10 p-4">
                <h4 className="text-sm font-bold text-earth mb-2">
                  💡 Helpful tips
                </h4>
                <ul className="space-y-1.5">
                  {tripPlan.tips.map((tip, index) => (
                    <li
                      key={index}
                      className="flex items-start gap-2 text-sm text-slate-text"
                    >
                      <span className="text-sprout-base mt-0.5">●</span>
                      <span>{tip}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
