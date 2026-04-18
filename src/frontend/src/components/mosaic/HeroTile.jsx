import { Icon } from "../Icon.jsx";

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
    const days = Math.max(1, Math.ceil(ms / 86400000) + 1);
    durationLabel = `${days} day${days !== 1 ? "s" : ""}`;
  }

  const tags = [];
  if (vibe) tags.push(vibe);
  if (childrenAges.length > 0) tags.push("Family");
  tags.push(countryCode === "US" ? "Domestic" : "International");

  const dateLine = [
    startDate && formatDate(startDate),
    endDate ? `\u2013 ${formatDate(endDate)}` : "",
    durationLabel ? `\u00B7 ${durationLabel}` : "",
  ]
    .filter(Boolean)
    .join(" ");

  const peopleLine =
    `${adults} adult${adults !== 1 ? "s" : ""}` +
    (childrenAges.length > 0
      ? ` \u00B7 ${childrenAges.length} kid${childrenAges.length !== 1 ? "s" : ""}, age${childrenAges.length !== 1 ? "s" : ""} ${childrenAges.join(" & ")}`
      : "");

  return (
    <section className="bg-white border border-gray-200 rounded-2xl px-5 py-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-[11px] font-mono uppercase tracking-[0.15em] text-gray-400 mb-0.5 inline-flex items-center gap-1.5">
            <Icon name="pin" size={11} /> Your trip
          </p>
          <h2 className="font-display font-bold text-[24px] md:text-[28px] leading-tight tracking-tight text-gray-900">
            {destination}
          </h2>
          {dateLine && (
            <p className="text-[13px] text-gray-600 mt-0.5 inline-flex items-center gap-1.5">
              <Icon name="calendar" size={12} className="text-gray-400" />
              {dateLine}
            </p>
          )}
          <p className="text-[13px] text-gray-600 mt-0.5 inline-flex items-center gap-1.5">
            <Icon name="kids" size={12} className="text-gray-400" />
            {peopleLine}
          </p>
        </div>

        <div className="flex items-start gap-2 flex-wrap">
          {tags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center bg-gray-50 border border-gray-200 text-gray-700 rounded-full px-2.5 py-1 text-[11px] font-mono font-semibold uppercase tracking-wider"
            >
              {tag}
            </span>
          ))}
          {onEdit && (
            <button
              onClick={onEdit}
              className="inline-flex items-center gap-1 text-[12px] text-gray-500 hover:text-meadow-700 underline-offset-2 hover:underline cursor-pointer"
              aria-label="Edit trip"
            >
              <Icon name="pencil" size={11} /> Edit
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
