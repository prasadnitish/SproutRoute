import PremiumRouteMap from "../maps/PremiumRouteMap.jsx";
import { toMapPoint } from "../../utils/mapGeometry.js";

export default function MapTile({ destination, lat, lon }) {
  const point = toMapPoint({ id: "destination", name: destination || "Destination", lat, lon }, 0);

  return (
    <PremiumRouteMap
      eyebrow="Destination map"
      title={destination || "Destination"}
      points={point.lat != null && point.lon != null ? [point] : []}
      fallbackCenter={point}
    />
  );
}
