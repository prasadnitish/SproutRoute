export default function ActivityDetailPanel({ activity, placesData, isOpen, onClose }) {
  if (!activity) return null;

  const name = activity.name || activity.title || "Activity";
  const emoji = activity.emoji || "\u{1F3AF}";
  const category = activity.category || activity.tags?.[0] || "Activity";
  const description = activity.description || "";

  const priceLevelMap = { 0: "Free", 1: "$", 2: "$$", 3: "$$$", 4: "$$$$" };
  const priceLabel = placesData?.priceLevel != null
    ? priceLevelMap[placesData.priceLevel] ?? "\u2014"
    : "\u2014";

  const mapsUrl = placesData?.mapsUrl
    || `https://www.google.com/maps/search/${encodeURIComponent(name)}`;

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/20 z-40"
          onClick={onClose}
        />
      )}

      {/* Panel */}
      <div
        className={`fixed top-0 right-0 bottom-0 w-full sm:w-[380px] bg-white border-l border-gray-200 shadow-2xl z-50 overflow-y-auto transition-transform duration-300 ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 bg-gray-100 hover:bg-gray-200 rounded-full w-8 h-8 flex items-center justify-center cursor-pointer text-gray-600 z-10"
          aria-label="Close panel"
        >
          {"\u2715"}
        </button>

        {/* Photo / emoji hero */}
        {placesData?.photos?.length > 0 ? (
          <img
            src={placesData.photos[0]}
            alt={name}
            className="w-full h-48 object-cover"
          />
        ) : (
          <div className="bg-meadow-50 w-full h-48 flex items-center justify-center text-6xl">
            {emoji}
          </div>
        )}

        {/* Body */}
        <div className="p-5">
          {/* Category badge */}
          <p className="text-xs font-bold uppercase tracking-wider text-meadow-600 mb-1">
            {category}
          </p>

          {/* Name */}
          <h2 className="font-display font-extrabold text-xl text-gray-900 mb-1">
            {name}
          </h2>

          {/* Star rating */}
          {placesData?.rating != null && (
            <div className="flex items-center gap-1.5 mb-3">
              {Array.from({ length: 5 }, (_, i) => (
                <span key={i} className={i < Math.round(placesData.rating) ? "text-yellow-400" : "text-gray-300"}>
                  {"\u2605"}
                </span>
              ))}
              <span className="text-sm font-bold text-gray-900">{placesData.rating}</span>
              {placesData.reviewCount != null && (
                <span className="text-xs text-gray-400">
                  ({placesData.reviewCount})
                </span>
              )}
            </div>
          )}

          {/* Description */}
          {description && (
            <p className="text-sm text-gray-500 leading-relaxed mb-5">
              {description}
            </p>
          )}

          {/* Info grid */}
          <div className="grid grid-cols-2 gap-3 mb-5">
            {placesData?.address && (
              <InfoCell label="Address" value={placesData.address} />
            )}
            <InfoCell label="Duration" value={activity.duration || "\u2014"} />
            <InfoCell label="Cost" value={priceLabel} />
            <InfoCell label="Best Age" value={activity.bestAge || activity.ageRange || "All ages"} />
            {placesData?.phone && (
              <InfoCell label="Phone" value={placesData.phone} />
            )}
            {placesData?.website && (
              <div className="bg-gray-50 rounded-xl p-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-0.5">
                  Website
                </p>
                <a
                  href={placesData.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-semibold text-meadow-600 hover:underline break-all"
                >
                  Visit site
                </a>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <a
              href={mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="bg-meadow-600 text-white flex-1 py-2.5 rounded-xl font-bold text-sm text-center hover:bg-meadow-700 transition"
            >
              Open in Maps
            </a>
            <button
              onClick={onClose}
              className="border border-gray-300 text-gray-600 flex-1 py-2.5 rounded-xl font-bold text-sm text-center hover:bg-gray-50 transition cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

function InfoCell({ label, value }) {
  return (
    <div className="bg-gray-50 rounded-xl p-3">
      <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-0.5">
        {label}
      </p>
      <p className="text-sm font-semibold text-gray-900">{value}</p>
    </div>
  );
}
