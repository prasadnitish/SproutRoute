import { useMemo, useState } from "react";
import { Icon } from "./Icon.jsx";
import PremiumRouteMap from "./maps/PremiumRouteMap.jsx";
import { pointsFromStops } from "../utils/mapGeometry.js";

function defaultStopId(name, index) {
  const id = String(name || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return id || `stop-${index + 1}`;
}

function normalizeStops(parsedInput) {
  const stops = Array.isArray(parsedInput?.stops) ? parsedInput.stops : [];
  if (stops.length > 0) {
    return stops.map((stop, index) => ({
      id: stop.id || defaultStopId(stop.name, index),
      name: stop.name || `Stop ${index + 1}`,
      countryCode: stop.countryCode || parsedInput?.countryTour?.countryCode || null,
      lat: stop.lat ?? stop.latitude ?? null,
      lon: stop.lon ?? stop.lng ?? stop.longitude ?? null,
      role: stop.role || "must_visit",
      requestedNights: stop.requestedNights || "",
      mustInclude: stop.mustInclude ?? stop.role === "must_visit",
      notes: Array.isArray(stop.notes) ? stop.notes : [],
    }));
  }
  if (parsedInput?.countryTour?.country) {
    return [
      { id: "tokyo", name: "Tokyo", role: "suggested", requestedNights: "", mustInclude: false, notes: [] },
      { id: "kyoto", name: "Kyoto", role: "suggested", requestedNights: "", mustInclude: false, notes: [] },
      { id: "osaka", name: "Osaka", role: "suggested", requestedNights: "", mustInclude: false, notes: [] },
    ];
  }
  return [];
}

function moveItem(items, fromIndex, toIndex) {
  if (toIndex < 0 || toIndex >= items.length) return items;
  const next = [...items];
  const [item] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, item);
  return next;
}

function inclusiveDayCount(startDate, endDate) {
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return 7;
  return Math.round((end - start) / 86400000) + 1;
}

function isBlanketRoute(parsedInput, candidates) {
  return (
    parsedInput?.tripShape === "country_tour" &&
    candidates.length > 3 &&
    candidates.every((stop) => stop.role === "suggested" && stop.mustInclude === false)
  );
}

function clampCount(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function countForPace({ totalDays, candidateCount, hasChildren, pace }) {
  const totalNights = Math.max(1, totalDays - 1);
  const minNightsByPace = {
    relaxed: hasChildren ? 4 : 3,
    balanced: hasChildren ? 3 : 2,
    ambitious: hasChildren ? 2.25 : 1.5,
  };
  return clampCount(Math.floor(totalNights / minNightsByPace[pace]), 2, candidateCount);
}

function buildRouteBundles(parsedInput, candidates) {
  if (!isBlanketRoute(parsedInput, candidates)) return [];
  const totalDays = inclusiveDayCount(parsedInput?.startDate, parsedInput?.endDate);
  const hasChildren = (parsedInput?.childrenAges || []).length > 0;
  const relaxedCount = countForPace({ totalDays, candidateCount: candidates.length, hasChildren, pace: "relaxed" });
  const balancedCount = clampCount(
    Math.max(relaxedCount, countForPace({ totalDays, candidateCount: candidates.length, hasChildren, pace: "balanced" })),
    2,
    candidates.length,
  );
  const ambitiousCount = clampCount(
    Math.max(balancedCount, countForPace({ totalDays, candidateCount: candidates.length, hasChildren, pace: "ambitious" })),
    2,
    candidates.length,
  );

  return [
    { id: "relaxed", label: "Relaxed", count: relaxedCount, stops: candidates.slice(0, relaxedCount) },
    { id: "balanced", label: "Balanced", count: balancedCount, stops: candidates.slice(0, balancedCount) },
    { id: "ambitious", label: "Ambitious", count: ambitiousCount, stops: candidates.slice(0, ambitiousCount) },
  ].filter((bundle, index, all) => index === 0 || bundle.count !== all[index - 1].count);
}

function initialStopsFor(parsedInput) {
  const candidates = normalizeStops(parsedInput);
  const bundles = buildRouteBundles(parsedInput, candidates);
  return bundles.find((bundle) => bundle.id === "balanced")?.stops || bundles[0]?.stops || candidates;
}

export default function RouteReviewPanel({ parsedInput, routePrefetch, onContinue, onBack }) {
  const candidates = useMemo(() => normalizeStops(parsedInput), [parsedInput]);
  const routeBundles = useMemo(() => buildRouteBundles(parsedInput, candidates), [parsedInput, candidates]);
  const [stops, setStops] = useState(() => initialStopsFor(parsedInput));
  const [selectedBundle, setSelectedBundle] = useState(
    () => routeBundles.find((bundle) => bundle.id === "balanced")?.id || routeBundles[0]?.id || null,
  );
  const [optimizationMode, setOptimizationMode] = useState(
    parsedInput?.tripShape === "country_tour" ? "recommended" : "user_order",
  );
  const showCandidatePicker = routeBundles.length > 0;

  const title = parsedInput?.tripShape === "country_tour"
    ? `${parsedInput?.countryTour?.country || parsedInput?.destination} route`
    : "Multi-stop route";

  const dateLine = parsedInput?.startDate
    ? `${parsedInput.startDate}${parsedInput.endDate ? ` to ${parsedInput.endDate}` : ""}`
    : "";

  const warnings = useMemo(
    () => stops.flatMap((stop) => (stop.notes || []).map((note) => `${stop.name}: ${note}`)),
    [stops],
  );
  const totalDays = inclusiveDayCount(parsedInput?.startDate, parsedInput?.endDate);
  const routeMapPoints = useMemo(() => pointsFromStops(stops), [stops]);

  const updateStop = (index, patch) => {
    setStops((prev) => prev.map((stop, i) => (i === index ? { ...stop, ...patch } : stop)));
    setSelectedBundle(null);
  };

  const moveStop = (index, direction) => {
    setStops((prev) => moveItem(prev, index, index + direction));
    setOptimizationMode("user_order");
    setSelectedBundle(null);
  };

  const applyBundle = (bundle) => {
    setStops(bundle.stops);
    setSelectedBundle(bundle.id);
    setOptimizationMode("recommended");
  };

  const toggleCandidate = (candidate) => {
    setStops((prev) => {
      const exists = prev.some((stop) => stop.id === candidate.id);
      if (exists) return prev.filter((stop) => stop.id !== candidate.id);
      return [...prev, candidate];
    });
    setOptimizationMode("user_order");
    setSelectedBundle(null);
  };

  const canContinue = stops.filter((stop) => stop.name.trim()).length >= 2;
  const prefetchStatuses = routePrefetch?.statusByStopId || {};
  const readyCount = stops.filter((stop) => prefetchStatuses[stop.id] === "ready").length;
  const loadingCount = stops.filter((stop) => prefetchStatuses[stop.id] === "loading").length;
  const prefetchLabel = readyCount > 0
    ? `${readyCount}/${stops.length} ideas ready`
    : loadingCount > 0
      ? "Finding ideas..."
      : "";
  const routeReason = optimizationMode === "recommended"
    ? `${selectedBundle ? `${routeBundles.find((bundle) => bundle.id === selectedBundle)?.label || "Recommended"} route` : "Recommended route"}: ${stops.length} selected stop${stops.length === 1 ? "" : "s"} with manageable transfers.`
    : "Your order: we will keep the stops in this order unless you move them.";

  return (
    <section className="bg-white border border-gray-200 rounded-2xl p-4 md:p-5" aria-label="Review route">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-mono font-semibold uppercase tracking-[0.15em] text-meadow-700">
            Review route
          </p>
          <h3 className="font-display font-bold text-[20px] text-gray-900 mt-1">{title}</h3>
          {dateLine && <p className="text-[13px] text-gray-500 mt-0.5">{dateLine}</p>}
        </div>
        <span className="inline-flex items-center gap-1 rounded-full bg-meadow-50 text-meadow-700 px-2.5 py-1 text-[11px] font-mono font-semibold uppercase tracking-wider">
          <Icon name="map" size={12} /> {stops.length} stops
        </span>
      </div>

      <div className="mt-3 rounded-xl border border-gray-200 bg-gray-50 p-3">
        <p className="text-[13px] text-gray-700">{routeReason}</p>
        {prefetchLabel && (
          <p className="mt-1 inline-flex items-center gap-1 text-[12px] font-semibold text-meadow-700">
            <Icon name={readyCount > 0 ? "check" : "sparkle"} size={12} /> {prefetchLabel}
          </p>
        )}
      </div>

      <div className="mt-4">
        <PremiumRouteMap
          eyebrow="Route map"
          title={title}
          points={routeMapPoints}
          totalDays={totalDays}
          minHeight="min-h-[280px]"
        />
      </div>

      {showCandidatePicker && (
        <div className="mt-4 space-y-3">
          <div className="grid grid-cols-3 gap-2">
            {routeBundles.map((bundle) => (
              <button
                key={bundle.id}
                type="button"
                onClick={() => applyBundle(bundle)}
                className={`rounded-xl border px-3 py-2 text-left transition ${
                  selectedBundle === bundle.id
                    ? "border-meadow-500 bg-meadow-50 text-meadow-800"
                    : "border-gray-200 bg-white text-gray-700 hover:border-meadow-300"
                }`}
              >
                <span className="block text-[13px] font-bold">{bundle.label}</span>
                <span className="block text-[11px] text-gray-500">{bundle.count} stops</span>
              </button>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            {candidates.map((candidate) => {
              const checked = stops.some((stop) => stop.id === candidate.id);
              const disableRemove = checked && stops.length <= 2;
              return (
                <label
                  key={candidate.id}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-semibold ${
                    checked ? "border-meadow-300 bg-meadow-50 text-meadow-800" : "border-gray-200 bg-white text-gray-600"
                  } ${disableRemove ? "opacity-70" : ""}`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={disableRemove}
                    onChange={() => toggleCandidate(candidate)}
                    aria-label={`Include ${candidate.name}`}
                    className="h-3.5 w-3.5 accent-meadow-600"
                  />
                  {candidate.name}
                </label>
              );
            })}
          </div>
        </div>
      )}

      <div className="mt-4 flex gap-1 rounded-xl bg-gray-100 p-1">
        <button
          type="button"
          onClick={() => setOptimizationMode("user_order")}
          className={`flex-1 rounded-lg px-3 py-2 text-[13px] font-semibold transition ${
            optimizationMode === "user_order" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"
          }`}
        >
          Keep order
        </button>
        <button
          type="button"
          onClick={() => setOptimizationMode("optimized")}
          className={`flex-1 rounded-lg px-3 py-2 text-[13px] font-semibold transition ${
            optimizationMode === "optimized" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"
          }`}
        >
          Optimize
        </button>
      </div>

      <div className="mt-4 space-y-2">
        {stops.map((stop, index) => (
          <div key={stop.id || index} className="flex items-center gap-3 rounded-xl border border-gray-200 bg-gray-50/60 p-3">
            <span className="w-7 h-7 rounded-full bg-meadow-600 text-white inline-flex items-center justify-center text-[12px] font-bold flex-shrink-0">
              {index + 1}
            </span>
            <div className="flex flex-col gap-1">
              <button
                type="button"
                disabled={index === 0}
                onClick={() => moveStop(index, -1)}
                aria-label={`Move ${stop.name} up`}
                className="w-7 h-6 inline-flex items-center justify-center rounded-md border border-gray-200 bg-white text-gray-600 hover:border-meadow-300 hover:text-meadow-700 disabled:opacity-30 disabled:hover:border-gray-200 disabled:hover:text-gray-600 transition"
              >
                <Icon name="arrowUp" size={12} />
              </button>
              <button
                type="button"
                disabled={index === stops.length - 1}
                onClick={() => moveStop(index, 1)}
                aria-label={`Move ${stop.name} down`}
                className="w-7 h-6 inline-flex items-center justify-center rounded-md border border-gray-200 bg-white text-gray-600 hover:border-meadow-300 hover:text-meadow-700 disabled:opacity-30 disabled:hover:border-gray-200 disabled:hover:text-gray-600 transition"
              >
                <Icon name="arrowUp" size={12} className="rotate-180" />
              </button>
            </div>
            <div className="flex-1 min-w-0">
              <input
                value={stop.name}
                onChange={(e) => updateStop(index, { name: e.target.value })}
                className="w-full bg-transparent text-[15px] font-semibold text-gray-900 outline-none"
                aria-label={`Stop ${index + 1} name`}
              />
              {stop.notes?.length > 0 && (
                <p className="text-[12px] text-amber-700 mt-0.5">{stop.notes[0]}</p>
              )}
              {prefetchStatuses[stop.id] === "ready" && (
                <p className="text-[12px] text-meadow-700 mt-0.5">Ready</p>
              )}
            </div>
            <label className="w-20 flex-shrink-0">
              <span className="sr-only">Nights at {stop.name}</span>
              <input
                type="number"
                min="1"
                max="14"
                inputMode="numeric"
                value={stop.requestedNights}
                onChange={(e) => updateStop(index, { requestedNights: e.target.value })}
                placeholder="Auto"
                className="w-full rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-[13px] text-gray-800"
              />
            </label>
          </div>
        ))}
      </div>

      {warnings.length > 0 && (
        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
          {warnings.map((warning) => (
            <p key={warning} className="text-[13px] text-amber-800 inline-flex gap-2">
              <Icon name="warning" size={13} className="mt-0.5" /> {warning}
            </p>
          ))}
        </div>
      )}

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-[13px] font-semibold text-gray-700 hover:border-gray-300 transition"
        >
          <Icon name="arrowLeft" size={13} /> Edit prompt
        </button>
        <button
          type="button"
          disabled={!canContinue}
          onClick={() => onContinue?.({
            tripShape: parsedInput?.tripShape || "multi_stop",
            countryTour: parsedInput?.countryTour || null,
            routeOptimizationMode: optimizationMode,
            stops: stops
              .filter((stop) => stop.name.trim())
              .map((stop, index) => ({
                ...stop,
                id: stop.id || defaultStopId(stop.name, index),
                requestedNights: stop.requestedNights ? Number(stop.requestedNights) : null,
              })),
          })}
          className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-meadow-600 px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-meadow-700 disabled:bg-gray-200 disabled:text-gray-400 transition"
        >
          Continue <Icon name="arrowRight" size={13} />
        </button>
      </div>
    </section>
  );
}
