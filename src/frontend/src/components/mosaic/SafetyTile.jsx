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

function InfoChip({ label, value }) {
  return (
    <div className="bg-gray-50 rounded-xl px-3 py-2 min-w-0">
      <p className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold mb-0.5">
        {label}
      </p>
      <p className="text-xs font-medium text-gray-700 truncate">{value}</p>
    </div>
  );
}

export default function SafetyTile({ safetyData }) {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-4">
      <p className="text-xs uppercase tracking-wide font-semibold text-meadow-600 mb-3">
        {"\u{1F6E1}"} Safety
      </p>

      {!safetyData || safetyData.source === "fallback" ? (
        <p className="text-sm text-gray-400">Safety data unavailable</p>
      ) : (
        <>
          {/* Quick-glance row: advisory + emergency + water */}
          <div className="flex flex-wrap gap-2 mb-3">
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-gray-500">Advisory</span>
              <Badge color={advisoryColor(safetyData.advisoryLevel)}>
                {safetyData.advisoryLevel || "Unknown"}
              </Badge>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-gray-500">Emergency</span>
              <span className="text-xs font-bold text-gray-800">
                {safetyData.emergencyNumber || "911"}
              </span>
            </div>
            {safetyData.waterSafety && (
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-gray-500">Water</span>
                <span className="text-xs text-gray-700">
                  {safetyData.waterSafety}
                </span>
              </div>
            )}
          </div>

          {/* Tips in a horizontal flow for wider layouts */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {/* Health */}
            {safetyData.healthTips?.length > 0 && (
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-1">
                  Health
                </p>
                <ul className="space-y-1">
                  {safetyData.healthTips.slice(0, 3).map((tip, i) => (
                    <li
                      key={i}
                      className="text-xs text-gray-600 flex gap-1.5 leading-snug"
                    >
                      <span className="text-meadow-500 flex-shrink-0 mt-0.5">
                        {"\u2022"}
                      </span>
                      <span>{tip}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Family */}
            {safetyData.familyTips?.length > 0 && (
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-1">
                  Family
                </p>
                <ul className="space-y-1">
                  {safetyData.familyTips.slice(0, 2).map((tip, i) => (
                    <li
                      key={i}
                      className="text-xs text-gray-600 flex gap-1.5 leading-snug"
                    >
                      <span className="text-meadow-500 flex-shrink-0 mt-0.5">
                        {"\u2022"}
                      </span>
                      <span>{tip}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Car seat + customs */}
            <div className="space-y-2">
              {safetyData.carSeatLaw && (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-1">
                    Car Seat
                  </p>
                  <p className="text-xs text-gray-600 leading-snug">
                    {safetyData.carSeatLaw}
                  </p>
                </div>
              )}
              {safetyData.localCustoms?.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-1">
                    Local Tips
                  </p>
                  <ul className="space-y-0.5">
                    {safetyData.localCustoms.slice(0, 2).map((tip, i) => (
                      <li key={i} className="text-xs text-gray-600 leading-snug">
                        {tip}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>

          {/* Source note */}
          {safetyData.source === "ai-generated" && (
            <p className="text-[10px] text-gray-300 mt-2">
              AI-generated guidance — verify locally
            </p>
          )}
        </>
      )}
    </div>
  );
}
