const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function dayInitial(dateStr) {
  if (!dateStr) return "?";
  const d = new Date(dateStr);
  return isNaN(d) ? "?" : DAY_NAMES[d.getDay()]?.[0] || "?";
}

export default function WeatherTile({ forecast }) {
  if (!forecast || forecast.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-2xl p-4">
        <p className="text-xs uppercase tracking-wide font-semibold text-meadow-600 mb-2">
          {"\u{1F324}"} Weather
        </p>
        <p className="text-sm text-gray-400">Weather data unavailable</p>
      </div>
    );
  }

  const first = forecast[0];
  const highTemp = first.high ?? first.highTemp ?? first.temperature ?? "--";
  const conditions = first.conditions ?? first.shortForecast ?? "";
  const emoji = first.emoji ?? "\u{1F324}";

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-4">
      {/* Label */}
      <p className="text-xs uppercase tracking-wide font-semibold text-meadow-600 mb-2">
        {"\u{1F324}"} Weather
      </p>

      {/* Big temp */}
      <div className="flex items-baseline gap-2">
        <span className="text-3xl font-display font-extrabold text-meadow-700">
          {highTemp}&deg;
        </span>
        <span className="text-2xl">{emoji}</span>
      </div>
      {conditions && (
        <p className="text-sm text-gray-500 mt-0.5">{conditions}</p>
      )}

      {/* 7-day row */}
      <div className="flex gap-2 overflow-x-auto mt-3 pb-1">
        {forecast.slice(0, 7).map((day, i) => {
          const hi = day.high ?? day.highTemp ?? day.temperature ?? "--";
          const dayEmoji = day.emoji ?? "\u{1F324}";
          return (
            <div
              key={i}
              className="min-w-[50px] text-center bg-gray-50 rounded-lg p-2 flex-shrink-0"
            >
              <p className="text-xs font-medium text-gray-500">
                {dayInitial(day.date)}
              </p>
              <p className="text-base my-0.5">{dayEmoji}</p>
              <p className="text-xs font-bold text-gray-700">{hi}&deg;</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
