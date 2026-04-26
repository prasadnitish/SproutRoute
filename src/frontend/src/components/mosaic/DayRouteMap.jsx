import PremiumRouteMap from "../maps/PremiumRouteMap.jsx";
import { pointsFromActivities, toMapPoint } from "../../utils/mapGeometry.js";

export default function DayRouteMap({ activities, destination, lat, lon, routeMeta = null }) {
  const points = pointsFromActivities(activities || []);
  const fallbackCenter = toMapPoint({ id: "destination", name: destination || "Destination", lat, lon }, 0);

  return (
    <PremiumRouteMap
      eyebrow="Day map"
      title="Today's route"
      points={points}
      fallbackCenter={fallbackCenter}
      routeMeta={routeMeta}
    />
  );
}
