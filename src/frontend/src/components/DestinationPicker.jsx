export default function DestinationPicker({ suggestions, onPick }) {
  return (
    <div className="flex flex-col items-center gap-5">
      <h2 className="font-display font-bold text-2xl text-center">
        We found a few great matches
      </h2>
      <div className="w-full space-y-3">
        {suggestions.map((s, i) => (
          <button
            key={s.name || i}
            onClick={() => onPick(s.name)}
            className="w-full text-left bg-white border border-gray-200 rounded-xl p-4 cursor-pointer hover:border-meadow-400 hover:shadow-md transition"
          >
            <div className="flex items-start gap-3">
              {s.emoji && (
                <span className="text-2xl mt-0.5">{s.emoji}</span>
              )}
              <div className="flex-1 min-w-0">
                <p className="font-bold text-gray-900">{s.name}</p>
                {s.description && (
                  <p className="text-sm text-gray-500 mt-0.5">
                    {s.description}
                  </p>
                )}
                {s.season_note && (
                  <p className="text-xs text-gray-400 mt-1">
                    {s.season_note}
                  </p>
                )}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
