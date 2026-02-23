// Safety tab presenter — restructured to match mobile layout:
// 1. Weather Safety — auto-generated alerts from weather data
// 2. Travel Advisory — State Dept levels 1-4 (non-US)
// 3. Neighborhood Safety — Amadeus/GeoSure scores
// 4. Travel Tips — from tripPlan.tips array
// 5. Car Seat Laws — from safetyGuidance (hidden if no children)

function statusStyles(status) {
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
  if (status === "General guidelines") {
    return {
      badge: "bg-sky-light text-sky-dark border border-sky-light",
      card: "border-sky-light bg-sky-light/30",
    };
  }
  return {
    badge: "bg-sun/20 text-earth border border-sun/50",
    card: "border-sun/30 bg-sun/10",
  };
}

function prettySeatPosition(seatPosition) {
  const labels = {
    rear_seat_required_if_available: "Rear seat required when available",
    rear_seat_required_under_8: "Rear seat required for children under 8",
    rear_seat_required_under_13: "Rear seat required for children under 13",
    rear_seat_recommended: "Rear seat recommended",
    rear_seat_preferred: "Rear seat preferred",
    not_specified: "Check local requirements",
    not_found: "Check local requirements",
  };
  return labels[seatPosition] || "Check local requirements";
}

function advisoryLevelBadge(level) {
  const levels = {
    1: { label: "Level 1: Normal", color: "bg-sprout-light text-sprout-dark border-sprout-base/40" },
    2: { label: "Level 2: Increased Caution", color: "bg-sun/20 text-earth border-sun/50" },
    3: { label: "Level 3: Reconsider Travel", color: "bg-orange-100 text-orange-800 border-orange-300" },
    4: { label: "Level 4: Do Not Travel", color: "bg-red-100 text-red-800 border-red-300" },
  };
  return levels[level] || levels[2];
}

// ── Section 1: Weather Safety ────────────────────────────────────────────────
function WeatherSafetySection({ weather }) {
  if (!weather?.forecast || weather.forecast.length === 0) return null;

  const alerts = [];
  for (const day of weather.forecast) {
    if (day.high > 100) {
      alerts.push({ icon: "🔥", text: `Extreme heat on ${day.day || "a day"}: ${day.high}°F. Stay hydrated and seek shade.` });
    } else if (day.high > 90) {
      alerts.push({ icon: "☀️", text: `Hot weather on ${day.day || "a day"}: ${day.high}°F. Pack sunscreen and water.` });
    }
    if (day.low < 32) {
      alerts.push({ icon: "🥶", text: `Freezing temps on ${day.day || "a day"}: low of ${day.low}°F. Bundle up!` });
    } else if (day.low < 40) {
      alerts.push({ icon: "🧥", text: `Cold weather on ${day.day || "a day"}: low of ${day.low}°F. Pack warm layers.` });
    }
    if (day.precipitation > 80) {
      alerts.push({ icon: "🌧", text: `Heavy rain likely on ${day.day || "a day"}: ${day.precipitation}% chance. Pack rain gear.` });
    } else if (day.precipitation > 50) {
      alerts.push({ icon: "🌦", text: `Rain possible on ${day.day || "a day"}: ${day.precipitation}% chance.` });
    }
    const cond = (day.condition || "").toLowerCase();
    if (cond.includes("storm") || cond.includes("thunder")) {
      alerts.push({ icon: "⛈", text: `Storms expected on ${day.day || "a day"}. Have indoor backup plans.` });
    }
    if (cond.includes("snow")) {
      alerts.push({ icon: "❄️", text: `Snow expected on ${day.day || "a day"}. Check road conditions.` });
    }
  }

  // De-duplicate similar alerts (keep first 6 max)
  const seen = new Set();
  const unique = alerts.filter((a) => {
    const key = a.text.slice(0, 30);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 6);

  if (unique.length === 0) return null;

  return (
    <div className="rounded-xl border border-sky-light dark:border-dark-border bg-sky-light/20 dark:bg-dark-bg p-4 space-y-2">
      <p className="text-xs font-bold uppercase tracking-wider text-muted dark:text-dark-muted">
        🌤 Weather Safety
      </p>
      <ul className="space-y-1.5">
        {unique.map((alert, i) => (
          <li key={i} className="flex items-start gap-2 text-sm text-slate-text dark:text-dark-text">
            <span className="shrink-0">{alert.icon}</span>
            <span>{alert.text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Section 2: Travel Advisory ───────────────────────────────────────────────
function TravelAdvisorySection({ advisory }) {
  if (!advisory) return null;
  const badge = advisoryLevelBadge(advisory.level);

  return (
    <div className="rounded-xl border border-earth/15 bg-earth/5 dark:bg-dark-bg p-4 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-bold uppercase tracking-wider text-muted">
          🌍 Travel Advisory
        </p>
        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${badge.color}`}>
          {badge.label}
        </span>
      </div>
      {advisory.summary && (
        <p className="text-sm text-slate-text dark:text-dark-text">
          {advisory.summary.length > 200
            ? advisory.summary.slice(0, 200) + "..."
            : advisory.summary}
        </p>
      )}
      {advisory.riskCategories && advisory.riskCategories.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {advisory.riskCategories.map((cat) => (
            <span key={cat} className="rounded-full bg-earth/10 px-2 py-0.5 text-[10px] font-medium text-muted capitalize">
              {cat}
            </span>
          ))}
        </div>
      )}
      {advisory.sourceUrl && (
        <a
          href={advisory.sourceUrl}
          target="_blank"
          rel="noreferrer"
          className="text-xs text-sky-dark underline hover:text-sprout-dark transition-colors"
        >
          Full State Dept advisory →
        </a>
      )}
    </div>
  );
}

// ── Section 3: Neighborhood Safety ───────────────────────────────────────────
function NeighborhoodSafetySection({ safety }) {
  if (!safety) return null;
  const categories = [
    { key: "physicalHarm", label: "Physical Safety" },
    { key: "theft", label: "Theft" },
    { key: "healthMedical", label: "Health & Medical" },
    { key: "womensSafety", label: "Women's Safety" },
    { key: "lgbtqSafety", label: "LGBTQ+ Safety" },
    { key: "politicalFreedoms", label: "Political Freedom" },
  ];

  return (
    <div className="rounded-xl border border-earth/15 bg-earth/5 dark:bg-dark-bg p-4 space-y-2">
      <p className="text-xs font-bold uppercase tracking-wider text-muted">
        📊 Neighborhood Safety
      </p>
      <div className="grid grid-cols-2 gap-2">
        {categories.map(({ key, label }) => {
          const score = safety.categories?.[key];
          if (score === undefined || score === null) return null;
          const width = Math.max(5, Math.min(100, score));
          const color = score >= 60 ? "bg-sprout-base" : score >= 40 ? "bg-sun" : "bg-red-400";
          return (
            <div key={key} className="space-y-0.5">
              <div className="flex justify-between items-baseline">
                <span className="text-[11px] text-muted">{label}</span>
                <span className="text-[11px] font-medium text-earth">{score}</span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-earth/10">
                <div className={`h-full rounded-full ${color}`} style={{ width: `${width}%` }} />
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-[10px] text-muted">
        Scores 1-100 (higher = safer). Source: GeoSure
      </p>
    </div>
  );
}

// ── Section 4: Travel Tips ───────────────────────────────────────────────────
function TravelTipsSection({ tips }) {
  if (!tips || tips.length === 0) return null;

  return (
    <div className="rounded-xl border border-sun/40 bg-sun/10 dark:bg-sun/5 p-4">
      <h4 className="text-sm font-bold text-earth dark:text-dark-text mb-2">
        💡 Travel Tips
      </h4>
      <ul className="space-y-1.5">
        {tips.map((tip, index) => (
          <li key={index} className="flex items-start gap-2 text-sm text-slate-text dark:text-dark-text">
            <span className="text-sprout-base mt-0.5">●</span>
            <span>{tip}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Section 5: Car Seat Laws ─────────────────────────────────────────────────
function CarSeatSection({ safetyGuidance }) {
  if (!safetyGuidance) return null;

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
  const displayStatus = status || "General guidelines";
  const displayJurisdiction =
    jurisdictionName && jurisdictionName !== "Not found in repo"
      ? jurisdictionName
      : "Your destination";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-muted dark:text-dark-muted">
            🚗 Car Seat &amp; Booster Guidance
          </p>
          <p className="text-sm text-muted dark:text-dark-muted mt-0.5">
            {displayJurisdiction}
            {jurisdictionCode && jurisdictionCode !== displayJurisdiction
              ? ` (${jurisdictionCode})`
              : ""}
          </p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider ${overallStyles.badge}`}
        >
          {displayStatus}
        </span>
      </div>

      {message && (
        <div className="rounded-xl border border-earth/15 bg-earth/5 dark:bg-dark-bg px-4 py-3 text-sm text-slate-text dark:text-dark-text">
          {message}
        </div>
      )}

      {results.length > 0 && (
        <div className="space-y-3">
          {results.map((result) => {
            const styles = statusStyles(result.status);
            const childLabel =
              result.requiredRestraintLabel &&
              result.requiredRestraintLabel !== "Not found in repo"
                ? result.requiredRestraintLabel
                : "See AAP recommendations";
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
                    {result.status || "General guidelines"}
                  </span>
                </div>
                <p className="mt-2 text-base font-semibold text-slate-text dark:text-dark-text">
                  {childLabel}
                </p>
                <p className="mt-1 text-sm text-muted dark:text-dark-muted">
                  {prettySeatPosition(result.seatPosition)}
                </p>
                {typeof result.ageYears === "number" && (
                  <p className="mt-1 text-xs text-muted">
                    Age: {result.ageYears}y
                    {Number.isFinite(result.weightLb) ? ` · ${result.weightLb} lb` : ""}
                    {Number.isFinite(result.heightIn) ? ` · ${result.heightIn} in` : ""}
                  </p>
                )}
                <p className="mt-2 text-sm text-muted dark:text-dark-muted">{result.rationale}</p>
              </article>
            );
          })}
        </div>
      )}

      <div className="rounded-xl border border-earth/15 bg-earth/5 dark:bg-dark-bg px-4 py-3 text-xs text-muted dark:text-dark-muted space-y-1">
        {effectiveDate && effectiveDate !== "Not found in repo" && (
          <p>Effective date: {effectiveDate}</p>
        )}
        {lastUpdated && lastUpdated !== "Not found in repo" && (
          <p>Last updated: {lastUpdated}</p>
        )}
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
          <a
            href="https://www.seatcheck.org/"
            target="_blank"
            rel="noreferrer"
            className="text-sky-dark underline hover:text-sprout-dark transition-colors"
          >
            Find a certified seat check technician →
          </a>
        )}
        <p className="font-medium text-earth/80 mt-1">
          ⚠️ Informational only. Verify legal requirements before travel.
        </p>
      </div>
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────
export default function TravelSafetyCard({
  safetyGuidance,
  travelAdvisory,
  neighborhoodSafety,
  hasChildren = true,
  weather,
  tripPlan,
}) {
  const hasSomething =
    weather?.forecast?.length > 0 ||
    travelAdvisory ||
    neighborhoodSafety ||
    tripPlan?.tips?.length > 0 ||
    (hasChildren && safetyGuidance);

  if (!hasSomething) {
    return (
      <div className="space-y-4 rounded-2xl border border-earth/20 dark:border-dark-border bg-white dark:bg-dark-card shadow-soft dark:shadow-soft-dark p-6">
        <p className="text-xs font-bold uppercase tracking-wider text-muted">🛡 Travel safety</p>
        <p className="text-sm text-muted dark:text-dark-muted">
          No safety alerts for this destination. Have a great trip!
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-2xl border border-earth/20 dark:border-dark-border bg-white dark:bg-dark-card shadow-soft dark:shadow-soft-dark p-6">
      <div>
        <p className="text-xs font-bold uppercase tracking-wider text-muted dark:text-dark-muted">
          🛡 Travel safety
        </p>
        <h3 className="font-heading text-xl font-bold text-earth dark:text-dark-text mt-1">
          Safety &amp; Alerts
        </h3>
      </div>

      {/* 1. Weather Safety */}
      <WeatherSafetySection weather={weather} />

      {/* 2. Travel Advisory (non-US) */}
      <TravelAdvisorySection advisory={travelAdvisory} />

      {/* 3. Neighborhood Safety */}
      <NeighborhoodSafetySection safety={neighborhoodSafety} />

      {/* 4. Travel Tips */}
      <TravelTipsSection tips={tripPlan?.tips} />

      {/* 5. Car Seat Laws (hidden if no children) */}
      {hasChildren && <CarSeatSection safetyGuidance={safetyGuidance} />}
    </div>
  );
}
