function formatDate(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T00:00:00");
  if (isNaN(d)) return dateStr;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function HeroTile({ tripData, parsedInput, onEdit }) {
  const destination =
    tripData?.parsed?.destination || parsedInput?.destination || "Your Trip";
  const startDate = tripData?.parsed?.startDate || parsedInput?.startDate;
  const endDate = tripData?.parsed?.endDate || parsedInput?.endDate;
  const adults = tripData?.parsed?.adults || parsedInput?.adults || 2;
  const childrenAges =
    tripData?.parsed?.childrenAges || parsedInput?.childrenAges || [];
  const vibe = tripData?.parsed?.vibe || parsedInput?.vibe;
  const countryCode =
    tripData?.trip?.countryCode || parsedInput?.countryCode || "US";

  let durationLabel = "";
  if (startDate && endDate) {
    const ms = new Date(endDate) - new Date(startDate);
    const days = Math.max(1, Math.round(ms / 86400000));
    durationLabel = `${days} day${days !== 1 ? "s" : ""}`;
  }

  const tags = [];
  if (vibe) tags.push(vibe);
  if (childrenAges.length > 0) tags.push("Family");
  tags.push(countryCode === "US" ? "Domestic" : "International");

  return (
    <div className="bg-gradient-to-r from-meadow-800 via-meadow-600 to-meadow-500 text-white rounded-2xl px-6 py-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        {/* Left: destination + dates */}
        <div className="flex items-center gap-4">
          <div>
            <h2 className="font-display font-extrabold text-2xl md:text-3xl leading-tight">
              {destination}
            </h2>
            <p className="text-sm opacity-90 mt-0.5">
              {startDate && formatDate(startDate)}
              {endDate ? ` \u2013 ${formatDate(endDate)}` : ""}
              {durationLabel ? ` \u00B7 ${durationLabel}` : ""}
            </p>
          </div>
        </div>

        {/* Right: tags + edit */}
        <div className="flex items-center gap-2 flex-wrap">
          {tags.map((tag) => (
            <span
              key={tag}
              className="bg-white/15 border border-white/25 rounded-full px-3 py-1 text-xs font-semibold"
            >
              {tag}
            </span>
          ))}
          <span className="text-xs opacity-70 hidden sm:inline">
            {adults} adult{adults !== 1 ? "s" : ""}
            {childrenAges.length > 0 &&
              ` \u00B7 ${childrenAges.length} kid${childrenAges.length !== 1 ? "s" : ""}, age${childrenAges.length !== 1 ? "s" : ""} ${childrenAges.join(" & ")}`}
          </span>
          {onEdit && (
            <button
              onClick={onEdit}
              className="ml-1 text-xs underline opacity-80 hover:opacity-100 cursor-pointer"
            >
              Edit
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
