// Lightweight map tile using OpenStreetMap embed (no API key needed).
// Shows destination with a pin. Future: add activity markers.

export default function MapTile({ destination, lat, lon }) {
  if (!destination && !lat) {
    return null;
  }

  // Use OpenStreetMap embed with destination search or coordinates
  const query = lat && lon
    ? `#map=13/${lat}/${lon}`
    : `?query=${encodeURIComponent(destination)}`;

  const embedUrl = lat && lon
    ? `https://www.openstreetmap.org/export/embed.html?bbox=${lon - 0.05},${lat - 0.03},${lon + 0.05},${lat + 0.03}&layer=mapnik&marker=${lat},${lon}`
    : `https://www.openstreetmap.org/export/embed.html?bbox=-180,-90,180,90&layer=mapnik`;

  return (
    <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
      {/* Label */}
      <p className="text-xs uppercase tracking-wide font-semibold text-meadow-600 px-4 pt-3 pb-2">
        {"\u{1F5FA}"} Map
      </p>

      <div className="relative w-full" style={{ height: "200px" }}>
        <iframe
          title="Trip destination map"
          src={embedUrl}
          className="w-full h-full border-0"
          loading="lazy"
          referrerPolicy="no-referrer"
        />
      </div>

      {/* Link to full map */}
      <div className="px-4 py-2">
        <a
          href={lat && lon
            ? `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=13/${lat}/${lon}`
            : `https://www.openstreetmap.org/search?query=${encodeURIComponent(destination)}`
          }
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
