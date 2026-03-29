import { useState } from "react";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

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

function isHistoricalForecast(forecast, tripStart) {
  if (!forecast?.length || !tripStart) return false;
  const firstForecast = new Date(forecast[0].date + "T00:00:00");
  const tripDate = new Date(tripStart + "T00:00:00");
  const diffDays = Math.abs((tripDate - firstForecast) / 86400000);
  return diffDays > 7;
}

const COMPACT_DAYS = 5;

export default function WeatherTile({ forecast, tripStart }) {
  const [expanded, setExpanded] = useState(false);

  if (!forecast || forecast.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-2xl p-4 h-full">
        <p className="text-xs uppercase tracking-wide font-semibold text-meadow-600 mb-2">
          {"\u{1F324}"} Weather
        </p>
        <p className="text-sm text-gray-400">Weather data unavailable</p>
      </div>
    );
  }

  const mismatch = isHistoricalForecast(forecast, tripStart);
  const first = forecast[0];
  const highTemp = first.high ?? first.highTemp ?? first.temperature ?? "--";
  const conditions =
    first.conditions ?? first.condition ?? first.shortForecast ?? "";
  const emoji = first.emoji ?? weatherEmoji(conditions);

  const showAll = expanded || forecast.length <= COMPACT_DAYS;
  const visibleDays = showAll ? forecast : forecast.slice(0, COMPACT_DAYS);

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-4 h-full flex flex-col">
      {/* Label */}
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs uppercase tracking-wide font-semibold text-meadow-600">
          {"\u{1F324}"} Weather
        </p>
        {mismatch && (
          <span className="text-[10px] bg-amber-50 text-amber-600 rounded-full px-2 py-0.5">
            Historical avg
          </span>
        )}
      </div>

      {/* Compact: inline temp + condition */}
      <div className="flex items-center gap-2 mb-1">
        <span className="text-2xl font-display font-extrabold text-meadow-700">
          {highTemp}&deg;
        </span>
        <span className="text-xl">{emoji}</span>
        {conditions && (
          <span className="text-xs text-gray-500">{conditions}</span>
        )}
      </div>

      {/* Daily forecast strip */}
      <div className="flex gap-1 overflow-x-auto mt-1 pb-1 -mx-1 px-1">
        {visibleDays.map((day, i) => {
          const hi = day.high ?? day.highTemp ?? day.temperature ?? "--";
          const lo = day.low ?? day.lowTemp ?? "";
          const cond =
            day.conditions ?? day.condition ?? day.shortForecast ?? "";
          const dayEmoji = day.emoji ?? weatherEmoji(cond);
          const { day: dayName, date } = formatDayLabel(day.date);

          return (
            <div
              key={i}
              className={`min-w-[48px] text-center rounded-xl py-1.5 px-1 flex-shrink-0 transition ${
                i === 0
                  ? "bg-meadow-50 border border-meadow-200"
                  : "bg-gray-50"
              }`}
            >
              <p className="text-[10px] font-bold text-gray-700">{dayName}</p>
              <p className="text-[9px] text-gray-400 leading-tight">{date}</p>
              <p className="text-sm my-0.5">{dayEmoji}</p>
              <p className="text-xs font-bold text-gray-700">{hi}&deg;</p>
              {lo !== "" && (
                <p className="text-[10px] text-gray-400">{lo}&deg;</p>
              )}
            </div>
          );
        })}
      </div>

      {/* Show all / collapse toggle */}
      {forecast.length > COMPACT_DAYS && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-xs text-meadow-600 hover:text-meadow-800 mt-1 cursor-pointer self-end"
        >
          {expanded ? "Show less" : `Show all ${forecast.length} days`}
        </button>
      )}
    </div>
  );
}
