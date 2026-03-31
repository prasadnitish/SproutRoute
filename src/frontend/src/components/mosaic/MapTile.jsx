import { useEffect, useRef } from "react";
import L from "leaflet";

// Fix Leaflet default marker icons (broken by bundlers)
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";
L.Icon.Default.mergeOptions({ iconUrl: markerIcon, iconRetinaUrl: markerIcon2x, shadowUrl: markerShadow });

export default function MapTile({ destination, lat, lon }) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);

  useEffect(() => {
    if (!mapRef.current || !lat || !lon) return;

    // Destroy previous instance
    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
      mapInstanceRef.current = null;
    }

    const map = L.map(mapRef.current, {
      center: [lat, lon],
      zoom: 12,
      zoomControl: true,
      attributionControl: true,
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 18,
    }).addTo(map);

    L.marker([lat, lon])
      .addTo(map)
      .bindPopup(`<b>${destination || "Destination"}</b>`)
      .openPopup();

    mapInstanceRef.current = map;

    // Fix map rendering in flex containers
    setTimeout(() => map.invalidateSize(), 100);

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, [lat, lon, destination]);

  if (!destination && !lat) return null;

  const googleMapsUrl = lat && lon
    ? `https://www.google.com/maps/search/things+to+do/@${lat},${lon},12z`
    : `https://www.google.com/maps/search/${encodeURIComponent(destination)}`;

  return (
    <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden h-full flex flex-col">
      <p className="text-xs uppercase tracking-wide font-semibold text-meadow-600 px-4 pt-3 pb-2">
        {"\u{1F5FA}"} Map
      </p>
      <div ref={mapRef} className="flex-1 min-h-[250px] z-0" />
      <div className="px-4 py-2">
        <a href={googleMapsUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-meadow-600 hover:underline">
          Explore on Google Maps &rarr;
        </a>
      </div>
    </div>
  );
}
