import { useMemo, useState } from "react";
import { Icon } from "../Icon.jsx";
import {
  googleMapsEmbedUrl,
  googleMapsOpenUrl,
  routeMetrics,
} from "../../utils/mapGeometry.js";

function MetricChip({ icon, label }) {
  if (!label) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-white/70 bg-white/85 px-2.5 py-1 text-[11px] font-semibold text-gray-700 shadow-sm backdrop-blur">
      {icon && <Icon name={icon} size={12} />}
      {label}
    </span>
  );
}

function RouteLegend({ points }) {
  if (!points.length) return null;
  return (
    <div className="absolute left-3 top-3 max-w-[calc(100%-1.5rem)] rounded-xl border border-white/70 bg-white/90 p-2.5 shadow-lg backdrop-blur">
      <div className="flex max-w-full gap-1.5 overflow-x-auto pb-0.5">
        {points.slice(0, 8).map((point, index) => (
          <div
            key={point.id || `${point.name}-${index}`}
            className="flex min-w-[92px] items-center gap-2 rounded-lg bg-gray-50/90 px-2 py-1.5"
          >
            <span className={`inline-flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white ${
              point.isMeal ? "bg-amber-500" : "bg-meadow-600"
            }`}>
              {index + 1}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-[12px] font-bold text-gray-900">{point.name}</span>
              {point.subtitle && (
                <span className="block truncate text-[10px] text-gray-500">{point.subtitle}</span>
              )}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function PremiumRouteMap({
  eyebrow = "Map",
  title = "Route map",
  points = [],
  fallbackCenter = null,
  totalDays = null,
  routeMeta = null,
  className = "",
  minHeight = "min-h-[320px]",
}) {
  const [loaded, setLoaded] = useState(false);
  const metrics = useMemo(() => routeMetrics(points, totalDays), [points, totalDays]);
  const src = useMemo(() => googleMapsEmbedUrl(points, fallbackCenter), [points, fallbackCenter]);
  const openUrl = useMemo(() => googleMapsOpenUrl(points, fallbackCenter), [points, fallbackCenter]);
  const mappedPoints = points.filter((point) => point.lat != null && point.lon != null);
  const visiblePoints = mappedPoints.length > 0 ? mappedPoints : points.slice(0, 8);

  if (!src && points.length === 0) return null;

  const travelLabel = routeMeta?.totalTravelMinutes
    ? `${Math.round(routeMeta.totalTravelMinutes)} min mapped travel`
    : metrics.longestMiles
      ? `Longest hop ${metrics.longestMiles} mi`
      : "";

  return (
    <section
      aria-label={`${eyebrow} ${title}`}
      className={`overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-card ${className}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-gray-100 px-4 py-3">
        <div className="min-w-0">
          <p className="inline-flex items-center gap-1.5 text-[11px] font-mono font-semibold uppercase tracking-[0.15em] text-meadow-700">
            <Icon name="map" size={12} /> {eyebrow}
          </p>
          <p className="mt-1 truncate font-display text-[18px] font-bold text-gray-950">{title}</p>
        </div>
        <div className="flex flex-wrap justify-end gap-1.5">
          <MetricChip icon="pin" label={`${metrics.stopCount || points.length || 1} stop${(metrics.stopCount || points.length) === 1 ? "" : "s"}`} />
          <MetricChip icon="clock" label={travelLabel} />
          <MetricChip icon="sparkle" label={metrics.paceLabel} />
        </div>
      </div>

      <div className={`relative bg-gray-100 ${minHeight}`}>
        {src && !loaded && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-gradient-to-br from-meadow-50 via-white to-sky-light/40">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-meadow-500 border-t-transparent" />
          </div>
        )}
        {src ? (
          <iframe
            title={`${title} Google map`}
            src={src}
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            onLoad={() => setLoaded(true)}
            className="absolute inset-0 h-full w-full border-0"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center px-6 text-center">
            <p className="text-sm font-medium text-gray-500">Map appears once we have coordinates.</p>
          </div>
        )}
        <RouteLegend points={visiblePoints} />
        <div className="absolute bottom-3 right-3 flex flex-col items-end gap-1.5">
          {metrics.backtrackingLabel && (
            <span className="rounded-full border border-white/70 bg-white/90 px-2.5 py-1 text-[11px] font-semibold text-gray-700 shadow-sm backdrop-blur">
              {metrics.backtrackingLabel}
            </span>
          )}
          <a
            href={openUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-full bg-meadow-700 px-3 py-1.5 text-[11px] font-bold text-white shadow-lg transition hover:bg-meadow-800"
          >
            Open map <Icon name="arrowRight" size={11} />
          </a>
        </div>
      </div>
    </section>
  );
}
