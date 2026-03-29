// Map tile using OpenStreetMap embed with activity markers.
// Shows destination area with a centered pin. Taller to be useful.

export default function MapTile({ destination, lat, lon }) {
  if (!destination && !lat) {
    return null;
  }

  // Wider bbox for better overview (0.15 degree ~= 10 miles)
  const embedUrl = lat && lon
    ? `https://www.openstreetmap.org/export/embed.html?bbox=${lon - 0.12},${lat - 0.08},${lon + 0.12},${lat + 0.08}&layer=mapnik&marker=${lat},${lon}`
    : `https://www.openstreetmap.org/export/embed.html?bbox=-180,-90,180,90&layer=mapnik`;

  const fullMapUrl = lat && lon
    ? `https://www.google.com/maps/search/things+to+do/@${lat},${lon},12z`
    : `https://www.google.com/maps/search/${encodeURIComponent(destination)}`;

  return (
    <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden h-full flex flex-col">
      {/* Label */}
      <p className="text-xs uppercase tracking-wide font-semibold text-meadow-600 px-4 pt-3 pb-2">
        {"\u{1F5FA}"} Map
      </p>

      <div className="relative flex-1 min-h-[250px]">
        <iframe
          title="Trip destination map"
          src={embedUrl}
          className="w-full h-full border-0"
          loading="lazy"
          referrerPolicy="no-referrer"
        />
      </div>

      {/* Link to Google Maps (much more useful than OSM for trip planning) */}
      <div className="px-4 py-2">
        <a
          href={fullMapUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-meadow-600 hover:underline"
        >
          Explore on Google Maps &rarr;
        </a>
      </div>
    </div>
  );
}
