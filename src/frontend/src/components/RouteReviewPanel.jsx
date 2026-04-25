import { useMemo, useState } from "react";
import { Icon } from "./Icon.jsx";

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
      role: stop.role || "must_visit",
      requestedNights: stop.requestedNights || "",
      mustInclude: stop.mustInclude !== false,
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

export default function RouteReviewPanel({ parsedInput, onContinue, onBack }) {
  const [stops, setStops] = useState(() => normalizeStops(parsedInput));
  const [optimizationMode, setOptimizationMode] = useState("user_order");

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

  const updateStop = (index, patch) => {
    setStops((prev) => prev.map((stop, i) => (i === index ? { ...stop, ...patch } : stop)));
  };

  const canContinue = stops.filter((stop) => stop.name.trim()).length >= 2;

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
