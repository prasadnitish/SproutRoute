function Badge({ color, children }) {
  const colors = {
    green: "bg-green-100 text-green-700",
    yellow: "bg-yellow-100 text-yellow-700",
    red: "bg-red-100 text-red-700",
    gray: "bg-gray-100 text-gray-600",
  };
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${
        colors[color] || colors.gray
      }`}
    >
      {children}
    </span>
  );
}

function ScoreDots({ score, max = 5 }) {
  return (
    <div className="flex gap-1">
      {Array.from({ length: max }, (_, i) => (
        <div
          key={i}
          className={`w-2 h-2 rounded-full ${
            i < score ? "bg-meadow-500" : "bg-gray-200"
          }`}
        />
      ))}
    </div>
  );
}

export default function SafetyTile({ safetyData }) {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-4">
      {/* Label */}
      <p className="text-xs uppercase tracking-wide font-semibold text-meadow-600 mb-3">
        {"\u{1F6E1}"} Safety
      </p>

      {!safetyData ? (
        <p className="text-sm text-gray-400">Safety data unavailable</p>
      ) : (
        <div className="space-y-3">
          {/* Car Seat */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-700">Car Seat</span>
            <Badge color={safetyData.carSeatRequired === false ? "green" : "yellow"}>
              {safetyData.carSeatRequired === false
                ? "Not required"
                : safetyData.carSeatSummary || "Check local laws"}
            </Badge>
          </div>

          {/* Advisory Level */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-700">Advisory Level</span>
            <Badge
              color={
                safetyData.advisoryLevel === "low"
                  ? "green"
                  : safetyData.advisoryLevel === "medium"
                  ? "yellow"
                  : safetyData.advisoryLevel
                  ? "red"
                  : "gray"
              }
            >
              {safetyData.advisoryLevel || "Unknown"}
            </Badge>
          </div>

          {/* Neighborhood Score */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-700">Neighborhood</span>
            <ScoreDots score={safetyData.neighborhoodScore ?? 3} />
          </div>

          {/* Emergency Number */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-700">Emergency</span>
            <span className="text-sm font-bold text-gray-900">
              {safetyData.emergencyNumber || "911"}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
