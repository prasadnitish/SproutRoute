import { useState } from "react";

export default function TripPlanDisplay({ tripPlan, onApprove }) {
  const [selectedActivities, setSelectedActivities] = useState(
    new Set(tripPlan.suggestedActivities.map((a) => a.id)),
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

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

  const getCategoryIcon = (category) => {
    const icons = {
      beach: "🏖️",
      hiking: "🥾",
      city: "🏙️",
      museums: "🏛️",
      parks: "🎠",
      dining: "🍽️",
      shopping: "🛍️",
      sports: "⚽",
      water: "🚣",
      wildlife: "🦁",
      theme_park: "🎢",
      camping: "⛺",
    };
    return icons[category] || "📍";
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-xl font-semibold text-gray-900 mb-2">
          Your Trip Plan
        </h3>
        <p className="text-gray-600">{tripPlan.overview}</p>
      </div>

      <div>
        <h4 className="text-lg font-semibold text-gray-800 mb-4">
          Suggested Activities
          <span className="text-sm font-normal text-gray-500 ml-2">
            ({selectedActivities.size} selected)
          </span>
        </h4>
        <p className="text-sm text-gray-600 mb-4">
          Select the activities you want to include in your trip. We'll generate
          a packing list based on your selections.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {tripPlan.suggestedActivities.map((activity) => {
            const isSelected = selectedActivities.has(activity.id);

            return (
              <label
                key={activity.id}
                className={`cursor-pointer border-2 rounded-lg p-4 transition-all ${
                  isSelected
                    ? "border-primary-500 bg-primary-50"
                    : "border-gray-200 bg-white hover:border-gray-300"
                }`}
              >
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleActivity(activity.id)}
                    className="mt-1 h-5 w-5 text-primary-600 rounded focus:ring-2 focus:ring-primary-500"
                  />
                  <div className="flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-2xl">
                          {getCategoryIcon(activity.category)}
                        </span>
                        <h5 className="font-semibold text-gray-900">
                          {activity.name}
                        </h5>
                      </div>
                      {activity.kidFriendly && (
                        <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded">
                          Kid-Friendly
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-600 mt-2">
                      {activity.description}
                    </p>
                    <div className="flex flex-wrap items-center gap-2 mt-2 text-xs text-gray-500">
                      <span>⏱️ {activity.duration}</span>
                      {activity.weatherDependent && (
                        <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
                          Weather-dependent
                        </span>
                      )}
                    </div>
                    {activity.bestDays && activity.bestDays.length > 0 && (
                      <p className="text-xs text-gray-500 mt-1">
                        Best: {activity.bestDays.join(", ")}
                      </p>
                    )}
                    <p className="text-xs text-gray-500 mt-2 italic">
                      {activity.reason}
                    </p>
                  </div>
                </div>
              </label>
            );
          })}
        </div>
      </div>

      {tripPlan.dailyItinerary && tripPlan.dailyItinerary.length > 0 && (
        <div>
          <h4 className="text-lg font-semibold text-gray-800 mb-3">
            Suggested Itinerary
          </h4>
          <div className="space-y-3">
            {tripPlan.dailyItinerary.map((day, index) => (
              <div key={index} className="bg-gray-50 rounded-lg p-4">
                <h5 className="font-semibold text-gray-900 mb-2">{day.day}</h5>
                {day.activities && day.activities.length > 0 && (
                  <div className="mb-2">
                    <p className="text-sm text-gray-600">
                      Activities: {day.activities.join(", ")}
                    </p>
                  </div>
                )}
                {day.meals && (
                  <p className="text-sm text-gray-600">Meals: {day.meals}</p>
                )}
                {day.notes && (
                  <p className="text-xs text-gray-500 mt-2 italic">
                    {day.notes}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {tripPlan.tips && tripPlan.tips.length > 0 && (
        <div>
          <h4 className="text-lg font-semibold text-gray-800 mb-3">
            Helpful Tips
          </h4>
          <ul className="space-y-2">
            {tripPlan.tips.map((tip, index) => (
              <li
                key={index}
                className="flex items-start gap-2 text-sm text-gray-700"
              >
                <span className="text-primary-600">💡</span>
                <span>{tip}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex gap-3 pt-4">
        <button
          onClick={handleApprove}
          disabled={selectedActivities.size === 0 || isSubmitting}
          className="flex-1 py-4 px-6 bg-primary-600 hover:bg-primary-700 disabled:bg-gray-400 text-white font-semibold rounded-lg shadow-lg transition-colors"
        >
          {isSubmitting
            ? "Generating Packing List..."
            : `Generate Packing List (${selectedActivities.size} activities)`}
        </button>
      </div>

      {selectedActivities.size === 0 && (
        <p className="text-sm text-red-600 text-center">
          Please select at least one activity to continue
        </p>
      )}
    </div>
  );
}
