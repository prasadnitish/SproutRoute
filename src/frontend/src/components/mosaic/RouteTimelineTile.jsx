import { Icon } from "../Icon.jsx";

function formatDate(dateStr) {
  if (!dateStr) return "";
  try {
    return new Date(`${dateStr}T12:00:00`).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  } catch {
    return dateStr;
  }
}

export default function RouteTimelineTile({ routePlan, stopWeather = {}, receivedStopCount = 0 }) {
  if (!routePlan?.stops?.length) return null;

  return (
    <section className="bg-white border border-gray-200 rounded-2xl p-4">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <p className="text-[11px] font-mono font-semibold uppercase tracking-[0.15em] text-gray-500 inline-flex items-center gap-1.5">
            <Icon name="map" size={12} /> Route
          </p>
          <h3 className="font-display font-bold text-[18px] text-gray-900 mt-1">{routePlan.title}</h3>
        </div>
        <span className="rounded-full bg-meadow-50 px-2.5 py-1 text-[11px] font-mono font-semibold uppercase tracking-wider text-meadow-700">
          {routePlan.totalDays} days
        </span>
      </div>

      <div className="space-y-2">
        {routePlan.stops.map((stop, index) => {
          const weather = stopWeather?.[stop.id];
          const forecast = weather?.forecast?.[0];
          const condition = forecast?.condition || forecast?.conditions || forecast?.shortForecast || weather?.summary;
          const high = forecast?.high ?? forecast?.highTemp ?? forecast?.temperature;
          const isLoaded = receivedStopCount > index;
          return (
            <div key={stop.id} className="grid grid-cols-[28px_1fr_auto] gap-3 items-start">
              <span className={`mt-0.5 w-7 h-7 rounded-full inline-flex items-center justify-center text-[12px] font-bold ${
                isLoaded ? "bg-meadow-600 text-white" : "bg-gray-100 text-gray-500"
              }`}>
                {index + 1}
              </span>
              <div className="min-w-0">
                <p className="text-[15px] font-semibold text-gray-900">{stop.displayName || stop.name}</p>
                <p className="text-[12px] text-gray-500">
                  {formatDate(stop.arrivalDate)} to {formatDate(stop.departureDate)}
                  {stop.nights ? ` · ${stop.nights} night${stop.nights === 1 ? "" : "s"}` : ""}
                </p>
                {routePlan.transitLegs?.[index] && (
                  <p className="text-[12px] text-gray-400 mt-1 inline-flex items-center gap-1">
                    <Icon name={routePlan.transitLegs[index].mode === "flight" ? "plane" : "arrowRight"} size={11} />
                    {routePlan.transitLegs[index].mode} to next stop
                  </p>
                )}
              </div>
              {condition ? (
                <span className="text-[12px] text-gray-600 whitespace-nowrap">
                  {high ? `${high} deg · ` : ""}{condition}
                </span>
              ) : (
                <span className="text-[12px] text-gray-400">Loading</span>
              )}
            </div>
          );
        })}
      </div>

      {routePlan.warnings?.length > 0 && (
        <div className="mt-3 rounded-xl bg-amber-50 border border-amber-200 p-3">
          {routePlan.warnings.slice(0, 3).map((warning) => (
            <p key={warning} className="text-[13px] text-amber-800 inline-flex gap-2">
              <Icon name="warning" size={13} className="mt-0.5" /> {warning}
            </p>
          ))}
        </div>
      )}
    </section>
  );
}
