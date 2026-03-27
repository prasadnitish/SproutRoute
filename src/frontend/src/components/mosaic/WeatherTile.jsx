const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatDayLabel(dateStr) {
  if (!dateStr) return { day: "?", date: "" };
  const d = new Date(dateStr + "T00:00:00");
  if (isNaN(d)) return { day: "?", date: "" };
  return {
    day: DAY_NAMES[d.getDay()],
    date: `${MONTH_NAMES[d.getMonth()]} ${d.getDate()}`,
  };
}

function weatherEmoji(condition) {
  if (!condition) return "\u{1F324}";
  const c = condition.toLowerCase();
  if (c.includes("rain") || c.includes("shower")) return "\u{1F327}";
  if (c.includes("snow")) return "\u{2744}";
  if (c.includes("cloud") || c.includes("overcast")) return "\u{2601}";
  if (c.includes("partly") || c.includes("partial")) return "\u{26C5}";
  if (c.includes("sun") || c.includes("clear")) return "\u{2600}";
  if (c.includes("thunder") || c.includes("storm")) return "\u{26C8}";
  if (c.includes("fog") || c.includes("mist")) return "\u{1F32B}";
  return "\u{1F324}";
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
  const lowTemp = first.low ?? first.lowTemp ?? "";
  const conditions = first.conditions ?? first.condition ?? first.shortForecast ?? "";
  const emoji = first.emoji ?? weatherEmoji(conditions);

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-4">
      {/* Label */}
      <p className="text-xs uppercase tracking-wide font-semibold text-meadow-600 mb-2">
        {"\u{1F324}"} Weather
      </p>

      {/* Big temp + conditions */}
      <div className="flex items-baseline gap-2">
        <span className="text-3xl font-display font-extrabold text-meadow-700">
          {highTemp}&deg;
        </span>
        <span className="text-2xl">{emoji}</span>
      </div>
      {conditions && (
        <p className="text-sm text-gray-500 mt-0.5">{conditions}</p>
      )}

      {/* Trip date forecast strip */}
      <div className="flex gap-1.5 overflow-x-auto mt-3 pb-1">
        {forecast.map((day, i) => {
          const hi = day.high ?? day.highTemp ?? day.temperature ?? "--";
          const lo = day.low ?? day.lowTemp ?? "";
          const cond = day.conditions ?? day.condition ?? day.shortForecast ?? "";
          const dayEmoji = day.emoji ?? weatherEmoji(cond);
          const { day: dayName, date } = formatDayLabel(day.date);

          return (
            <div
              key={i}
              className={`min-w-[56px] text-center rounded-xl p-2 flex-shrink-0 transition ${
                i === 0
                  ? "bg-meadow-50 border border-meadow-200"
                  : "bg-gray-50 border border-transparent"
              }`}
            >
              <p className="text-[10px] font-bold text-gray-700">{dayName}</p>
              <p className="text-[9px] text-gray-400">{date}</p>
              <p className="text-base my-0.5">{dayEmoji}</p>
              <p className="text-xs font-bold text-gray-700">{hi}&deg;</p>
              {lo !== "" && (
                <p className="text-[10px] text-gray-400">{lo}&deg;</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
