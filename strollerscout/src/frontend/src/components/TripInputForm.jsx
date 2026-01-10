import { useState } from "react";
import { format, addDays, differenceInDays } from "date-fns";

const ACTIVITIES = [
  { id: "beach", label: "Beach/Pool", emoji: "🏖️" },
  { id: "hiking", label: "Hiking/Nature", emoji: "🥾" },
  { id: "city", label: "City Tours", emoji: "🏙️" },
  { id: "museums", label: "Museums", emoji: "🏛️" },
  { id: "parks", label: "Parks/Playgrounds", emoji: "🎠" },
  { id: "dining", label: "Restaurants", emoji: "🍽️" },
  { id: "shopping", label: "Shopping", emoji: "🛍️" },
  { id: "sports", label: "Sports/Recreation", emoji: "⚽" },
  { id: "water", label: "Water Activities", emoji: "🚣" },
  { id: "wildlife", label: "Zoo/Aquarium", emoji: "🦁" },
  { id: "theme_park", label: "Theme Parks", emoji: "🎢" },
  { id: "camping", label: "Camping", emoji: "⛺" },
];

export default function TripInputForm({ onSubmit }) {
  const today = format(new Date(), "yyyy-MM-dd");
  const tomorrow = format(addDays(new Date(), 1), "yyyy-MM-dd");

  const [formData, setFormData] = useState({
    destination: "",
    startDate: today,
    endDate: tomorrow,
    activities: [],
    numChildren: 1,
    childAges: [2],
  });

  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const validateForm = () => {
    const newErrors = {};

    if (!formData.destination.trim()) {
      newErrors.destination = "Please enter a destination";
    }

    if (!formData.startDate) {
      newErrors.startDate = "Please select a start date";
    }

    if (!formData.endDate) {
      newErrors.endDate = "Please select an end date";
    }

    if (formData.startDate && formData.endDate) {
      const start = new Date(formData.startDate);
      const end = new Date(formData.endDate);
      const duration = differenceInDays(end, start);

      if (end < start) {
        newErrors.endDate = "End date must be after start date";
      } else if (duration > 14) {
        newErrors.endDate = "Trip duration cannot exceed 14 days";
      } else if (duration === 0) {
        newErrors.endDate = "Trip must be at least 1 day";
      }
    }

    if (formData.activities.length === 0) {
      newErrors.activities = "Please select at least one activity";
    }

    if (formData.numChildren < 0 || formData.numChildren > 10) {
      newErrors.numChildren = "Number of children must be between 0 and 10";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);

    try {
      const tripData = {
        ...formData,
        children: formData.childAges
          .slice(0, formData.numChildren)
          .map((age) => ({ age })),
      };
      await onSubmit(tripData);
    } catch (error) {
      setErrors({
        submit: "Failed to generate packing list. Please try again.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleActivityToggle = (activityId) => {
    setFormData((prev) => ({
      ...prev,
      activities: prev.activities.includes(activityId)
        ? prev.activities.filter((id) => id !== activityId)
        : [...prev.activities, activityId],
    }));
  };

  const handleNumChildrenChange = (num) => {
    const newNum = Math.max(0, Math.min(10, num));
    setFormData((prev) => ({
      ...prev,
      numChildren: newNum,
      childAges: Array(newNum)
        .fill(0)
        .map((_, i) => prev.childAges[i] || 2),
    }));
  };

  const handleChildAgeChange = (index, age) => {
    const newAges = [...formData.childAges];
    newAges[index] = Math.max(0, Math.min(18, parseInt(age) || 0));
    setFormData((prev) => ({ ...prev, childAges: newAges }));
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <label
          htmlFor="destination"
          className="block text-sm font-medium text-gray-700 mb-2"
        >
          Where are you going?
        </label>
        <input
          type="text"
          id="destination"
          value={formData.destination}
          onChange={(e) =>
            setFormData({ ...formData, destination: e.target.value })
          }
          placeholder="e.g., Seattle, WA"
          className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent ${
            errors.destination ? "border-red-500" : "border-gray-300"
          }`}
        />
        {errors.destination && (
          <p className="mt-1 text-sm text-red-600">{errors.destination}</p>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label
            htmlFor="startDate"
            className="block text-sm font-medium text-gray-700 mb-2"
          >
            Start Date
          </label>
          <input
            type="date"
            id="startDate"
            value={formData.startDate}
            onChange={(e) =>
              setFormData({ ...formData, startDate: e.target.value })
            }
            min={today}
            className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent ${
              errors.startDate ? "border-red-500" : "border-gray-300"
            }`}
          />
          {errors.startDate && (
            <p className="mt-1 text-sm text-red-600">{errors.startDate}</p>
          )}
        </div>

        <div>
          <label
            htmlFor="endDate"
            className="block text-sm font-medium text-gray-700 mb-2"
          >
            End Date
          </label>
          <input
            type="date"
            id="endDate"
            value={formData.endDate}
            onChange={(e) =>
              setFormData({ ...formData, endDate: e.target.value })
            }
            min={formData.startDate || today}
            className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent ${
              errors.endDate ? "border-red-500" : "border-gray-300"
            }`}
          />
          {errors.endDate && (
            <p className="mt-1 text-sm text-red-600">{errors.endDate}</p>
          )}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-3">
          What activities are you interested in?
        </label>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {ACTIVITIES.map((activity) => (
            <button
              key={activity.id}
              type="button"
              onClick={() => handleActivityToggle(activity.id)}
              className={`px-4 py-3 rounded-lg border-2 transition-all ${
                formData.activities.includes(activity.id)
                  ? "border-primary-500 bg-primary-50 text-primary-700"
                  : "border-gray-300 bg-white text-gray-700 hover:border-gray-400"
              }`}
            >
              <span className="text-2xl mr-2">{activity.emoji}</span>
              <span className="font-medium">{activity.label}</span>
            </button>
          ))}
        </div>
        {errors.activities && (
          <p className="mt-1 text-sm text-red-600">{errors.activities}</p>
        )}
      </div>

      <div>
        <label
          htmlFor="numChildren"
          className="block text-sm font-medium text-gray-700 mb-2"
        >
          Number of Children
        </label>
        <input
          type="number"
          id="numChildren"
          value={formData.numChildren}
          onChange={(e) =>
            handleNumChildrenChange(parseInt(e.target.value) || 0)
          }
          min="0"
          max="10"
          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
        />
        {errors.numChildren && (
          <p className="mt-1 text-sm text-red-600">{errors.numChildren}</p>
        )}
      </div>

      {formData.numChildren > 0 && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Children Ages
          </label>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Array(formData.numChildren)
              .fill(0)
              .map((_, index) => (
                <div key={index}>
                  <label
                    htmlFor={`age-${index}`}
                    className="block text-xs text-gray-600 mb-1"
                  >
                    Child {index + 1}
                  </label>
                  <input
                    type="number"
                    id={`age-${index}`}
                    value={formData.childAges[index] || 0}
                    onChange={(e) =>
                      handleChildAgeChange(index, e.target.value)
                    }
                    min="0"
                    max="18"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  />
                </div>
              ))}
          </div>
        </div>
      )}

      {errors.submit && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-800">{errors.submit}</p>
        </div>
      )}

      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full py-4 px-6 bg-primary-600 hover:bg-primary-700 disabled:bg-gray-400 text-white font-semibold rounded-lg shadow-lg transition-colors"
      >
        {isSubmitting ? "Generating Trip Plan..." : "Generate Trip Plan"}
      </button>
    </form>
  );
}
