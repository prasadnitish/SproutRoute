export default function DayTabs({ days, activeDay, onSelectDay }) {
  return (
    <div className="flex gap-1.5 overflow-x-auto pb-2">
      {days.map((day, i) => (
        <button
          key={i}
          onClick={() => onSelectDay(i)}
          className={`px-3 py-1.5 rounded-full text-xs font-semibold cursor-pointer border transition whitespace-nowrap ${
            activeDay === i
              ? "bg-meadow-600 border-meadow-600 text-white"
              : "border-gray-200 text-gray-500 hover:border-meadow-300"
          }`}
        >
          {day.label || day.date || `Day ${i + 1}`}
        </button>
      ))}
    </div>
  );
}
