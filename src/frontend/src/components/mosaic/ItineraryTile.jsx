import { useState, useEffect } from "react";
import DayTabs from "../DayTabs";
import LoadingEngagement from "../LoadingEngagement";
import { Icon, weatherIconName, categoryIconName } from "../Icon.jsx";

function Stars({ rating }) {
  if (!rating) return null;
  const full = Math.floor(rating);
  const half = rating - full >= 0.5;
  return (
    <span className="text-[12px] text-amber-500 inline-flex items-center gap-0.5">
      {"\u2605".repeat(full)}{half ? "\u00BD" : ""}
      <span className="text-gray-400 ml-0.5">{rating}</span>
    </span>
  );
}

function PriceLevel({ level }) {
  if (level == null) return null;
  const symbols = "$".repeat(Math.max(1, level));
  return <span className="text-[11px] text-gray-400">{symbols}</span>;
}

function PetBadge({ petFriendly, hasPets, onOpenSafety }) {
  if (!hasPets) return null;
  if (petFriendly === true) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-mono font-semibold uppercase tracking-wider bg-meadow-50 text-meadow-700 rounded-full px-2 py-0.5">
        <Icon name="paw" size={10} /> Pet OK
      </span>
    );
  }
  if (petFriendly === false) {
    return (
      <button
        onClick={(e) => { e.stopPropagation(); onOpenSafety?.(); }}
        className="inline-flex items-center gap-1 text-[11px] font-mono font-semibold uppercase tracking-wider bg-amber-50 text-amber-700 rounded-full px-2 py-0.5 hover:bg-amber-100 transition"
      >
        <Icon name="warning" size={10} /> No pets
      </button>
    );
  }
  return null;
}

function DaycareSuggestion({ onOpenSafety }) {
  return (
    <button
      onClick={onOpenSafety}
      className="w-full flex gap-3 p-3 rounded-xl border border-amber-200 bg-amber-50/60 text-left hover:bg-amber-50 transition"
    >
      <span className="w-8 h-8 rounded-lg bg-amber-100 text-amber-700 inline-flex items-center justify-center flex-shrink-0">
        <Icon name="paw" size={14} />
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-semibold text-amber-900">Pet daycare suggested</p>
        <p className="text-[13px] text-amber-800 mt-0.5 leading-snug">
          This day has several no-pet activities. Check safety tab for daycare options.
        </p>
      </div>
      <Icon name="arrowRight" size={14} className="text-amber-700 mt-0.5" />
    </button>
  );
}

function ActivityCard({ activity, onTap, hasPets, onOpenSafety }) {
  const isMeal = activity.isMeal || activity.status === "meal";
  const isClosed = activity.status === "closed";
  const name = activity.name || activity.title || "Activity";
  const iconName = isMeal ? "food" : categoryIconName(activity.category);
  const enriched = activity.enriched;
  const photoUrl = enriched?.photos?.[0];

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onTap?.(activity)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onTap?.(activity);
        }
      }}
      aria-label={`View details for ${name}`}
      className={`relative flex gap-3 p-3 rounded-xl border transition cursor-pointer ${
        isClosed
          ? "border-red-100 bg-red-50/50 opacity-75"
          : isMeal
            ? "border-amber-100 bg-amber-50/40 hover:bg-amber-50"
            : "border-transparent hover:bg-meadow-50/60 hover:border-meadow-200"
      }`}
    >
      {/* Timeline / thumbnail rail */}
      <div className="flex flex-col items-center flex-shrink-0 w-14">
        {activity.scheduledStart && (
          <span className={`text-[13px] font-semibold ${isMeal ? "text-amber-700" : "text-meadow-700"}`}>
            {activity.scheduledStart}
          </span>
        )}
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center mt-1 overflow-hidden ${
          photoUrl ? "" : isMeal ? "bg-amber-100 text-amber-700" : "bg-meadow-50 text-meadow-700"
        }`}>
          {photoUrl ? (
            <img src={photoUrl} alt={name} className="w-full h-full object-cover rounded-lg" />
          ) : (
            <Icon name={iconName} size={18} />
          )}
        </div>
        {activity.scheduledEnd && (
          <span className="text-[11px] text-gray-400 mt-1">{activity.scheduledEnd}</span>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {isMeal && activity.mealType && (
          <span className="inline-block text-[11px] font-mono font-bold uppercase tracking-wider bg-amber-500 text-white rounded px-2 py-0.5 mb-1">
            {activity.mealType}
          </span>
        )}

        <div className="flex items-center gap-2 flex-wrap">
          <p className={`font-semibold text-[15px] leading-tight ${isClosed ? "text-red-700 line-through" : "text-gray-900"}`}>
            {name}
          </p>
          {enriched && <Stars rating={enriched.rating} />}
          {enriched && <PriceLevel level={enriched.priceLevel} />}
          <PetBadge petFriendly={activity.petFriendly} hasPets={hasPets} onOpenSafety={onOpenSafety} />
        </div>

        {/* Category chip */}
        {!isMeal && activity.category && (
          <span className="inline-block text-[11px] font-mono font-semibold uppercase tracking-wider bg-meadow-50 text-meadow-700 rounded-full px-2 py-0.5 mt-1 capitalize">
            {String(activity.category).replace(/_/g, " ")}
          </span>
        )}

        {isMeal && activity.cuisine && (
          <span className="inline-block text-[11px] font-mono font-semibold uppercase tracking-wider bg-amber-100 text-amber-800 rounded-full px-2 py-0.5 mt-1">
            {activity.cuisine}
          </span>
        )}
        {isMeal && activity.note && (
          <p className="text-[13px] text-amber-800/90 mt-1">{activity.note}</p>
        )}

        {/* Description — promoted to 13px content floor (F6) */}
        {activity.description && !isMeal && (
          <p className="text-[13px] text-gray-600 mt-1 line-clamp-2 leading-snug">
            {activity.description}
          </p>
        )}

        {/* Why this fits — body copy, not metadata (F6) */}
        {activity.whyRecommended && !isMeal && (
          <p className="text-[13px] text-meadow-800 mt-1 line-clamp-2 leading-snug">
            <span className="font-semibold">Why this fits: </span>
            {activity.whyRecommended}
          </p>
        )}

        {/* Secondary metadata row — kept at 12-13px, no longer below floor */}
        {(enriched?.address || activity.openingHours) && (
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
            {enriched?.address && (
              <p className="text-[12px] text-gray-500 inline-flex items-center gap-1 truncate max-w-full">
                <Icon name="pin" size={11} className="text-gray-400" />
                <span className="truncate">{enriched.address}</span>
              </p>
            )}
            {activity.openingHours && (
              <p className="text-[12px] text-gray-500 inline-flex items-center gap-1">
                <Icon name="clock" size={11} className="text-gray-400" /> Open {activity.openingHours}
              </p>
            )}
          </div>
        )}

        {activity.warning && (
          <p className="text-[13px] text-amber-700 font-medium mt-1 inline-flex items-center gap-1">
            <Icon name="warning" size={12} /> {activity.warning}
          </p>
        )}

        {activity.duration && !isMeal && (
          <span className="inline-block text-[11px] font-mono font-semibold uppercase tracking-wider bg-gray-100 text-gray-600 rounded-full px-2 py-0.5 mt-1.5">
            {activity.duration >= 60
              ? `${Math.round((activity.duration / 60) * 10) / 10}h`
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
    <div className="mt-3 bg-amber-50 border border-amber-200 rounded-xl p-4">
      <p className="text-[11px] font-mono font-semibold uppercase tracking-[0.15em] text-amber-800 mb-2 inline-flex items-center gap-1.5">
        <Icon name="sparkle" size={12} /> Trip tips
      </p>
      <ul className="space-y-1.5">
        {tips.map((tip, i) => (
          <li key={i} className="flex gap-2 text-[13px] text-gray-800 leading-snug">
            <span className="text-amber-500 flex-shrink-0 mt-0.5">
              <Icon name="circle" size={4} />
            </span>
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
  onOpenSafety,
}) {
  const [activeDay, setActiveDay] = useState(0);

  const handleDayChange = (dayIndex) => {
    setActiveDay(dayIndex);
    const days = scheduledItinerary || dailyItinerary;
    if (days && onDayChange) {
      const day = days[dayIndex];
      const activities = day?.scheduled || day?.activities || day?.items || [];
      onDayChange(activities, day, dayIndex);
    }
  };

  const days = scheduledItinerary || dailyItinerary;

  useEffect(() => {
    if (days?.length > 0 && onDayChange) {
      const day = days[0];
      onDayChange(day?.scheduled || day?.activities || day?.items || [], day, 0);
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

  const dayCondition =
    dayForecast?.conditions ?? dayForecast?.condition ?? dayForecast?.shortForecast ?? "";
  const dayHi = dayForecast?.high ?? dayForecast?.highTemp ?? dayForecast?.temperature;
  const dayLo = dayForecast?.low ?? dayForecast?.lowTemp;

  return (
    <section className="bg-white border border-gray-200 rounded-2xl p-4">
      {/* Label */}
      <div className="flex items-center justify-between mb-3">
        <p className="text-[11px] font-mono font-semibold uppercase tracking-[0.15em] text-gray-500 inline-flex items-center gap-1.5">
          <Icon name="calendar" size={12} /> Itinerary
        </p>
        {isScheduled && (
          <span className="text-[11px] font-mono font-semibold uppercase tracking-wider bg-meadow-50 text-meadow-700 rounded-full px-2 py-0.5 inline-flex items-center gap-1">
            <Icon name="check" size={10} /> Verified hours
          </span>
        )}
      </div>

      <DayTabs days={dayTabs} activeDay={activeDay} onSelectDay={handleDayChange} />

      {activeDay === 0 && <TripTips tips={tips} />}

      {totalChunks > 1 && receivedChunks < totalChunks && (
        <div className="flex items-center gap-2 mt-2 mb-1 text-[12px] text-meadow-700">
          <span className="inline-block w-3 h-3 border-2 border-meadow-500 border-t-transparent rounded-full animate-spin" />
          Loading more days ({receivedChunks}/{totalChunks})…
        </div>
      )}

      {/* Day header — weather folded in (F4) */}
      <div className="flex items-center justify-between gap-2 mt-3 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          {currentDay.date && (
            <span className="text-[14px] font-semibold text-gray-800 truncate">
              {formatDayLabel(currentDay.date, activeDay)}
            </span>
          )}
        </div>
        {dayForecast && (
          <div className="flex items-center gap-1.5 text-[12px] text-gray-600 whitespace-nowrap">
            <Icon name={weatherIconName(dayCondition)} size={14} className="text-gray-500" />
            {dayHi != null && (
              <span className="font-semibold">
                {dayHi}&deg;
                {dayLo != null && <span className="text-gray-400 font-normal">/{dayLo}&deg;</span>}
              </span>
            )}
            {dayCondition && <span className="text-gray-500">{dayCondition}</span>}
          </div>
        )}
      </div>

      {currentDay.notes && (
        <div className="bg-meadow-50 border border-meadow-200 rounded-xl p-3 mb-3 inline-flex items-start gap-2 w-full">
          <Icon name="pin" size={14} className="text-meadow-700 mt-0.5" />
          <p className="text-[13px] text-meadow-900 font-medium leading-snug">{currentDay.notes}</p>
        </div>
      )}

      {warnings.filter((w) => w.type === "closed").length > 0 && (
        <div className="bg-red-50 border border-red-100 rounded-lg p-2 mb-2 inline-flex items-center gap-2 w-full">
          <Icon name="warning" size={13} className="text-red-600" />
          <p className="text-[13px] text-red-700 font-medium">
            {warnings.filter((w) => w.type === "closed").length} activity(ies) closed on this day
          </p>
        </div>
      )}

      {hasPets && activities.filter((a) => a.petFriendly === false).length >= 2 && (
        <div className="mb-2">
          <DaycareSuggestion onOpenSafety={onOpenSafety} />
        </div>
      )}

      <div className="space-y-1">
        {activities.map((activity, i) => (
          <ActivityCard
            key={i}
            activity={activity}
            onTap={onActivityTap}
            hasPets={hasPets}
            onOpenSafety={onOpenSafety}
          />
        ))}
      </div>

      {activities.length > 0 && !activities.every((a) => a.isMeal) && (
        <p className="text-[12px] text-gray-400 text-center mt-3">
          &uarr; Tap any activity for details
        </p>
      )}
    </section>
  );
}
