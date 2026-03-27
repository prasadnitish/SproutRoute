export default function HeroTile({ tripData, parsedInput, onEdit }) {
  const destination =
    tripData?.parsed?.destination || parsedInput?.destination || "Your Trip";
  const startDate = tripData?.parsed?.startDate || parsedInput?.startDate;
  const endDate = tripData?.parsed?.endDate || parsedInput?.endDate;
  const adults = tripData?.parsed?.adults || parsedInput?.adults || 2;
  const childrenAges =
    tripData?.parsed?.childrenAges || parsedInput?.childrenAges || [];
  const vibe = tripData?.parsed?.vibe || parsedInput?.vibe;

  // Compute duration
  let durationLabel = "";
  if (startDate && endDate) {
    const ms = new Date(endDate) - new Date(startDate);
    const days = Math.max(1, Math.round(ms / 86400000));
    durationLabel = `${days} day${days !== 1 ? "s" : ""}`;
  }

  // Tags
  const tags = [];
  if (vibe) tags.push(vibe);
  if (childrenAges.length > 0) tags.push("Family");
  tags.push("Domestic");

  return (
    <div className="bg-gradient-to-br from-meadow-900 via-meadow-600 to-meadow-400 text-white rounded-2xl p-6 h-full flex flex-col justify-between">
      <div>
        {/* Eyebrow */}
        <p className="text-xs uppercase tracking-wide font-semibold opacity-80 mb-2">
          Your trip plan &#x2728;
        </p>

        {/* Destination */}
        <h2 className="font-display font-extrabold text-3xl md:text-4xl leading-tight">
          {destination}
        </h2>

        {/* Dates + duration */}
        {startDate && (
          <p className="mt-2 text-sm opacity-90">
            {startDate}
            {endDate ? ` \u2013 ${endDate}` : ""}
            {durationLabel ? ` \u00B7 ${durationLabel}` : ""}
          </p>
        )}

        {/* Tag chips */}
        <div className="flex flex-wrap gap-2 mt-4">
          {tags.map((tag) => (
            <span
              key={tag}
              className="bg-white/15 border border-white/25 rounded-full px-3 py-1 text-xs font-semibold"
            >
              {tag}
            </span>
          ))}
        </div>
      </div>

      {/* Bottom edit */}
      <div className="mt-6 text-xs opacity-80">
        <span>
          Assumed: {adults} adult{adults !== 1 ? "s" : ""}
          {childrenAges.length > 0 &&
            ` \u00B7 kids ${childrenAges.join(" & ")}`}
          {vibe ? ` \u00B7 vibe ${vibe}` : ""}
        </span>
        {onEdit && (
          <button
            onClick={onEdit}
            className="ml-2 underline opacity-90 hover:opacity-100 cursor-pointer"
          >
            Edit &rarr;
          </button>
        )}
      </div>
    </div>
  );
}
