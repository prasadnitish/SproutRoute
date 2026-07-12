import { useEffect, useRef } from "react";
import L from "leaflet";

// Fix default marker icons
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";
L.Icon.Default.mergeOptions({ iconUrl: markerIcon, iconRetinaUrl: markerIcon2x, shadowUrl: markerShadow });

function createNumberedIcon(number, isMeal) {
  const color = isMeal ? "#f59e0b" : "#16a34a";
  return L.divIcon({
    className: "custom-numbered-marker",
    html: `<div style="
      width:28px;height:28px;border-radius:50%;
      background:${color};color:white;
      display:flex;align-items:center;justify-content:center;
      font-size:12px;font-weight:700;
      border:2px solid white;
      box-shadow:0 2px 6px rgba(0,0,0,0.3);
    ">${number}</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -16],
  });
}

function appendPopupLine(root, tagName, text, color) {
  if (text === undefined || text === null || text === "") return;
  root.appendChild(document.createElement("br"));
  const node = document.createElement(tagName);
  node.textContent = String(text);
  if (color) node.style.color = color;
  root.appendChild(node);
}

export function createRoutePopupNode(marker) {
  const root = document.createElement("div");
  const title = document.createElement("strong");
  title.textContent = String(marker.name || "Stop");
  root.appendChild(title);
  appendPopupLine(root, "span", marker.time, "#666");
  const rating = Number(marker.rating);
  if (Number.isFinite(rating) && rating > 0 && rating <= 5) {
    appendPopupLine(root, "span", `${"\u2605".repeat(Math.round(rating))} ${rating}`);
  }
  appendPopupLine(root, "small", marker.address);
  return root;
}

export default function DayRouteMap({ activities, destination, lat, lon }) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);

  // Extract activities with coordinates
  const markers = (activities || [])
    .filter(a => a.status !== "closed")
    .map((a, i) => ({
      name: a.name || "Stop",
      index: i + 1,
      isMeal: !!a.isMeal,
      lat: a.enriched?.latitude,
      lon: a.enriched?.longitude,
      time: a.scheduledStart || "",
      rating: a.enriched?.rating,
      address: a.enriched?.address,
    }));

  const geoMarkers = markers.filter(m => m.lat && m.lon);
  const mealCount = markers.filter(m => m.isMeal).length;
  const activityCount = markers.length - mealCount;

  useEffect(() => {
    if (!mapRef.current) return;

    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
      mapInstanceRef.current = null;
    }

    const map = L.map(mapRef.current, { zoomControl: true, attributionControl: true });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>',
      maxZoom: 18,
    }).addTo(map);

    if (geoMarkers.length >= 2) {
      const latLngs = [];
      geoMarkers.forEach(m => {
        const icon = createNumberedIcon(m.index, m.isMeal);
        L.marker([m.lat, m.lon], { icon }).addTo(map).bindPopup(createRoutePopupNode(m));
        latLngs.push([m.lat, m.lon]);
      });

      if (latLngs.length >= 2) {
        L.polyline(latLngs, { color: "#16a34a", weight: 3, opacity: 0.6, dashArray: "8, 8" }).addTo(map);
      }

      map.fitBounds(L.latLngBounds(latLngs), { padding: [30, 30], maxZoom: 14 });
    } else if (lat && lon) {
      map.setView([lat, lon], 12);
      const popupLabel = document.createElement("span");
      popupLabel.textContent = destination || "Destination";
      L.marker([lat, lon]).addTo(map).bindPopup(popupLabel);
    } else {
      map.setView([0, 0], 2);
    }

    mapInstanceRef.current = map;
    setTimeout(() => map.invalidateSize(), 100);

    return () => { map.remove(); mapInstanceRef.current = null; };
  }, [activities, lat, lon]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!lat && !lon) return null;

  return (
    <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
      <div className="flex items-center justify-between px-4 pt-3 pb-2">
        <p className="text-xs uppercase tracking-wide font-semibold text-meadow-600">
          {"\u{1F5FA}"} Today&rsquo;s Route
        </p>
        <span className="text-[10px] text-gray-400">
          {activityCount} stop{activityCount !== 1 ? "s" : ""} + {mealCount} meal{mealCount !== 1 ? "s" : ""}
        </span>
      </div>

      <div ref={mapRef} style={{ height: 350 }} className="z-0" />

      <div className="px-3 py-2 space-y-1">
        {markers.slice(0, 8).map((m, i) => (
          <div key={i} className="flex items-center gap-2 text-xs">
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0 ${m.isMeal ? "bg-amber-500" : "bg-meadow-600"}`}>
              {m.index}
            </span>
            <span className="text-gray-700 truncate flex-1">{m.name}</span>
            {m.time && <span className="text-gray-400 flex-shrink-0">{m.time}</span>}
          </div>
        ))}
      </div>

      {lat && lon && (
        <div className="px-4 py-2 border-t border-gray-100">
          <a
            href={`https://www.google.com/maps/dir/${geoMarkers.map(m => `${m.lat},${m.lon}`).join("/") || `${lat},${lon}`}`}
            target="_blank" rel="noopener noreferrer"
            className="text-xs text-meadow-600 hover:underline"
          >
            Open route in Google Maps &rarr;
          </a>
        </div>
      )}
    </div>
  );
}
