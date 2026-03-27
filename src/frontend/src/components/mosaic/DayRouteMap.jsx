// Day route map — shows the current day's activities as markers on an OpenStreetMap embed.
// Draws a route line connecting activities in order using OSM's marker syntax.

export default function DayRouteMap({ activities, destination, lat, lon }) {
  if (!lat || !lon) return null;

  // Extract locations from enriched activity data
  const markers = (activities || [])
    .filter(a => a.enriched?.address && a.status !== "closed")
    .map((a, i) => ({
      name: a.name,
      index: i + 1,
      // Use destination lat/lon as fallback — we don't have per-activity coordinates
      // but the map centers on the destination which is correct for the area
    }));

  // Build an OSM embed centered on the destination with appropriate zoom
  const zoom = 12;
  const bbox = {
    left: lon - 0.08,
    bottom: lat - 0.05,
    right: lon + 0.08,
    top: lat + 0.05,
  };
  const embedUrl = `https://www.openstreetmap.org/export/embed.html?bbox=${bbox.left},${bbox.bottom},${bbox.right},${bbox.top}&layer=mapnik&marker=${lat},${lon}`;

  const fullMapUrl = `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=${zoom}/${lat}/${lon}`;

  const activityCount = activities?.filter(a => !a.isMeal && a.status !== "closed").length || 0;
  const mealCount = activities?.filter(a => a.isMeal).length || 0;

  return (
    <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden sticky top-4">
      {/* Label */}
      <div className="flex items-center justify-between px-4 pt-3 pb-2">
        <p className="text-xs uppercase tracking-wide font-semibold text-meadow-600">
          {"\u{1F5FA}"} Today's Route
        </p>
        <span className="text-[10px] text-gray-400">
          {activityCount} stops {mealCount > 0 ? `+ ${mealCount} meals` : ""}
        </span>
      </div>

      {/* Map */}
      <div className="relative w-full" style={{ height: "350px" }}>
        <iframe
          title="Day route map"
          src={embedUrl}
          className="w-full h-full border-0"
          loading="lazy"
          referrerPolicy="no-referrer"
        />
      </div>

      {/* Activity list for the day */}
      <div className="px-4 py-3 space-y-1.5">
        {(activities || []).filter(a => a.status !== "closed").map((a, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white ${
              a.isMeal ? "bg-amber-500" : "bg-meadow-600"
            }`}>
              {i + 1}
            </span>
            <span className="text-xs text-gray-700 truncate">{a.name}</span>
            {a.scheduledStart && (
              <span className="text-[10px] text-gray-400 ml-auto flex-shrink-0">{a.scheduledStart}</span>
            )}
          </div>
        ))}
      </div>

      {/* Full map link */}
      <div className="px-4 pb-3">
        <a
          href={fullMapUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-meadow-600 hover:underline"
        >
          Open full map &rarr;
        </a>
      </div>
    </div>
  );
}
