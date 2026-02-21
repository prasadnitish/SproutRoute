// Safety guidance presenter:
// - Summarizes jurisdiction-level car seat guidance.
// - Surfaces per-child recommendation status with source transparency metadata.
// - Emphasizes that output is informational, not legal advice.
function statusStyles(status) {
  // Visual severity mapping for quick scanning of confidence/availability.
  if (status === "Verified") {
    return {
      badge: "bg-sprout-light text-sprout-dark border border-sprout-base/40",
      card: "border-sprout-light bg-sprout-light/30",
    };
  }

  if (status === "Needs review") {
    return {
      badge: "bg-sun/20 text-earth border border-sun/50",
      card: "border-sun/30 bg-sun/10",
    };
  }

  return {
    badge: "bg-red-50 text-red-700 border border-red-200",
    card: "border-red-100 bg-red-50/50",
  };
}

function prettySeatPosition(seatPosition) {
  // Converts backend enum values into plain-language seat-position guidance.
  const labels = {
    rear_seat_required_if_available: "Rear seat required when available",
    rear_seat_required_under_8: "Rear seat required for children under 8",
    rear_seat_required_under_13: "Rear seat required for children under 13",
    rear_seat_recommended: "Rear seat recommended",
    rear_seat_preferred: "Rear seat preferred",
    not_found: "Not found in repo",
  };

  return labels[seatPosition] || seatPosition;
}

export default function TravelSafetyCard({ safetyGuidance }) {
  // Render nothing when safety guidance is absent to avoid empty UI chrome.
  if (!safetyGuidance) {
    return null;
  }

  const {
    status,
    jurisdictionCode,
    jurisdictionName,
    message,
    sourceUrl,
    effectiveDate,
    lastUpdated,
    results = [],
  } = safetyGuidance;

  const overallStyles = statusStyles(status);

  return (
    <div className="space-y-4 rounded-2xl border border-earth/20 bg-white shadow-soft p-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-muted">
            🛡 Travel safety
          </p>
          <h3 className="font-heading text-xl font-bold text-earth mt-1">
            Car seat &amp; booster guidance
          </h3>
          <p className="text-sm text-muted mt-1">
            {jurisdictionName || "Not found in repo"}
            {jurisdictionCode ? ` (${jurisdictionCode})` : ""}
          </p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider ${overallStyles.badge}`}
        >
          {status || "Unavailable"}
        </span>
      </div>

      {/* Message */}
      {message && (
        <div className="rounded-xl border border-earth/15 bg-earth/5 px-4 py-3 text-sm text-slate-text">
          {message}
        </div>
      )}

      {/* Per-child results */}
      {results.length > 0 && (
        <div className="space-y-3">
          {results.map((result) => {
            const styles = statusStyles(result.status);
            return (
              <article
                key={result.childId}
                className={`rounded-xl border p-4 ${styles.card}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <h4 className="text-sm font-bold uppercase tracking-wider text-earth">
                    🌱 {result.childId}
                  </h4>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${styles.badge}`}
                  >
                    {result.status}
                  </span>
                </div>

                <p className="mt-2 text-base font-semibold text-slate-text">
                  {result.requiredRestraintLabel || "Not found in repo"}
                </p>

                <p className="mt-1 text-sm text-muted">
                  {prettySeatPosition(result.seatPosition || "not_found")}
                </p>

                {typeof result.ageYears === "number" && (
                  <p className="mt-1 text-xs text-muted">
                    Age: {result.ageYears}y
                    {Number.isFinite(result.weightLb)
                      ? ` · ${result.weightLb} lb`
                      : ""}
                    {Number.isFinite(result.heightIn)
                      ? ` · ${result.heightIn} in`
                      : ""}
                  </p>
                )}

                <p className="mt-2 text-sm text-muted">{result.rationale}</p>
              </article>
            );
          })}
        </div>
      )}

      {/* Source metadata */}
      <div className="rounded-xl border border-earth/15 bg-earth/5 px-4 py-3 text-xs text-muted space-y-1">
        <p>Effective date: {effectiveDate || "Not found in repo"}</p>
        <p>Last updated: {lastUpdated || "Not found in repo"}</p>
        {sourceUrl ? (
          <a
            href={sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="text-sky-dark underline hover:text-sprout-dark transition-colors"
          >
            Official source →
          </a>
        ) : (
          <p>Official source: Not found in repo</p>
        )}
        <p className="font-medium text-earth/80 mt-1">
          ⚠️ Informational only. Verify legal requirements before travel.
        </p>
      </div>
    </div>
  );
}
