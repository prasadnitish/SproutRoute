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

function advisoryColor(level) {
  if (level === "low") return "green";
  if (level === "medium") return "yellow";
  if (level === "high") return "red";
  return "gray";
}

export default function SafetyTile({ safetyData }) {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-4">
      {/* Label */}
      <p className="text-xs uppercase tracking-wide font-semibold text-meadow-600 mb-3">
        {"\u{1F6E1}"} Safety
      </p>

      {!safetyData ? (
        <p className="text-sm text-gray-400">Loading safety tips...</p>
      ) : (
        <div className="space-y-3">
          {/* Advisory + Emergency row */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-700">Advisory</span>
            <Badge color={advisoryColor(safetyData.advisoryLevel)}>
              {safetyData.advisoryLevel || "Unknown"}
            </Badge>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-700">Emergency</span>
            <span className="text-sm font-bold text-gray-900">
              {safetyData.emergencyNumber || "911"}
            </span>
          </div>

          {/* Water Safety */}
          {safetyData.waterSafety && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-700">Water</span>
              <span className="text-xs text-gray-600">
                {safetyData.waterSafety}
              </span>
            </div>
          )}

          {/* Health tips */}
          {safetyData.healthTips?.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-500 mb-1">Health</p>
              <ul className="space-y-1">
                {safetyData.healthTips.slice(0, 3).map((tip, i) => (
                  <li key={i} className="text-xs text-gray-600 flex gap-1.5">
                    <span className="text-meadow-500 flex-shrink-0">{"\u2022"}</span>
                    {tip}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Family tips */}
          {safetyData.familyTips?.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-500 mb-1">Family</p>
              <ul className="space-y-1">
                {safetyData.familyTips.slice(0, 2).map((tip, i) => (
                  <li key={i} className="text-xs text-gray-600 flex gap-1.5">
                    <span className="text-meadow-500 flex-shrink-0">{"\u2022"}</span>
                    {tip}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Car seat */}
          {safetyData.carSeatLaw && (
            <div className="flex items-start gap-1.5">
              <span className="text-xs">{"\u{1F6D7}"}</span>
              <p className="text-xs text-gray-600">{safetyData.carSeatLaw}</p>
            </div>
          )}

          {/* Source note */}
          {safetyData.source === "ai-generated" && (
            <p className="text-[10px] text-gray-300 mt-1">AI-generated guidance — verify locally</p>
          )}
        </div>
      )}
    </div>
  );
}
