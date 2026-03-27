// Day route map — shows the current day's activities as numbered markers on an OpenStreetMap embed.
// When enriched activities have coordinates, markers are positioned over the map.

export default function DayRouteMap({ activities, destination, lat, lon }) {
  if (!lat || !lon) return null;

  // Extract locations with coordinates from enriched data
  const markers = (activities || [])
    .filter(a => a.status !== "closed")
    .map((a, i) => ({
      name: a.name,
      index: i + 1,
      isMeal: !!a.isMeal,
      lat: a.enriched?.latitude,
      lon: a.enriched?.longitude,
      scheduledStart: a.scheduledStart,
    }));

  const geoMarkers = markers.filter(m => m.lat && m.lon);

  // Compute bounding box from all marker coords (or fallback to destination)
  let bbox;
  if (geoMarkers.length >= 2) {
    const lats = geoMarkers.map(m => m.lat);
    const lons = geoMarkers.map(m => m.lon);
    const pad = 0.01;
    bbox = {
      left: Math.min(...lons) - pad,
      bottom: Math.min(...lats) - pad,
      right: Math.max(...lons) + pad,
      top: Math.max(...lats) + pad,
    };
  } else {
    bbox = {
      left: lon - 0.08,
      bottom: lat - 0.05,
      right: lon + 0.08,
      top: lat + 0.05,
    };
  }

  const centerLat = (bbox.top + bbox.bottom) / 2;
  const centerLon = (bbox.left + bbox.right) / 2;

  const embedUrl = `https://www.openstreetmap.org/export/embed.html?bbox=${bbox.left},${bbox.bottom},${bbox.right},${bbox.top}&layer=mapnik&marker=${centerLat},${centerLon}`;

  const zoom = 13;
  const fullMapUrl = `https://www.openstreetmap.org/?mlat=${centerLat}&mlon=${centerLon}#map=${zoom}/${centerLat}/${centerLon}`;

  const activityCount = activities?.filter(a => !a.isMeal && a.status !== "closed").length || 0;
  const mealCount = activities?.filter(a => a.isMeal).length || 0;

  // Convert lat/lon to pixel position within the map container
  // This is approximate — works well for city-scale maps
  function toPixel(markerLat, markerLon, mapWidth, mapHeight) {
    const x = ((markerLon - bbox.left) / (bbox.right - bbox.left)) * mapWidth;
    const y = ((bbox.top - markerLat) / (bbox.top - bbox.bottom)) * mapHeight;
    return { x: Math.round(x), y: Math.round(y) };
  }

  const MAP_HEIGHT = 350;

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

      {/* Map with overlay markers */}
      <div className="relative w-full" style={{ height: `${MAP_HEIGHT}px` }}>
        <iframe
          title="Day route map"
          src={embedUrl}
          className="w-full h-full border-0"
          loading="lazy"
          referrerPolicy="no-referrer"
        />
        {/* Numbered marker overlays */}
        {geoMarkers.map((m) => {
          // Use parentElement width approximation (container is full-width)
          const pos = toPixel(m.lat, m.lon, 400, MAP_HEIGHT);
          return (
            <div
              key={m.index}
              className="absolute pointer-events-none"
              style={{
                left: `${(pos.x / 400) * 100}%`,
                top: `${pos.y}px`,
                transform: "translate(-50%, -100%)",
                zIndex: 10,
              }}
            >
              <div
                className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white shadow-lg border-2 border-white ${
                  m.isMeal ? "bg-amber-500" : "bg-meadow-600"
                }`}
              >
                {m.index}
              </div>
            </div>
          );
        })}
      </div>

      {/* Activity list for the day */}
      <div className="px-4 py-3 space-y-1.5">
        {markers.map((m) => (
          <div key={m.index} className="flex items-center gap-2">
            <span className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white ${
              m.isMeal ? "bg-amber-500" : "bg-meadow-600"
            }`}>
              {m.index}
            </span>
            <span className="text-xs text-gray-700 truncate">{m.name}</span>
            {m.scheduledStart && (
              <span className="text-[10px] text-gray-400 ml-auto flex-shrink-0">{m.scheduledStart}</span>
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
