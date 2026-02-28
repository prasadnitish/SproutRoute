import { format } from "date-fns";

export default function Sidebar({
  resolvedDestination,
  startDate,
  endDate,
  numChildren,
  childAges,
  showStartOver,
  onStartOver,
}) {
  return (
    <aside className="hidden lg:block rounded-2xl border border-sprout-light dark:border-dark-border bg-white/80 dark:bg-dark-card/80 backdrop-blur-sm shadow-card dark:shadow-soft-dark p-6 h-fit min-w-0 overflow-hidden">
      <p className="text-xs font-bold uppercase tracking-wider text-sprout-dark dark:text-dark-sprout mb-4">
        🧭 Your trip
      </p>
      <div className="space-y-4 text-sm">
        <div>
          <p className="text-xs text-muted dark:text-dark-muted font-medium">Destination</p>
          <p className="text-base font-semibold text-slate-text dark:text-dark-text mt-0.5">
            {resolvedDestination || (
              <span className="text-muted italic">Not set yet</span>
            )}
          </p>
        </div>
        <div className="border-t border-sprout-light dark:border-dark-border pt-4">
          <p className="text-xs text-muted dark:text-dark-muted font-medium">Dates</p>
          <p className="text-base font-semibold text-slate-text dark:text-dark-text mt-0.5">
            {startDate && endDate ? (
              <>
                {format(new Date(startDate + "T12:00:00"), "MMM d")}
                <span className="text-muted mx-1">→</span>
                {format(new Date(endDate + "T12:00:00"), "MMM d, yyyy")}
              </>
            ) : (
              <span className="text-muted italic">Not set yet</span>
            )}
          </p>
        </div>
        <div className="border-t border-sprout-light dark:border-dark-border pt-4">
          <p className="text-xs text-muted dark:text-dark-muted font-medium">Travelers</p>
          <p className="text-base font-semibold text-slate-text dark:text-dark-text mt-0.5">
            {numChildren > 0
              ? `${numChildren} child${numChildren === 1 ? "" : "ren"}`
              : "Adults only"}
          </p>
        </div>
        {numChildren > 0 && childAges.slice(0, numChildren).length > 0 && (
          <div className="border-t border-sprout-light dark:border-dark-border pt-4">
            <p className="text-xs text-muted dark:text-dark-muted font-medium">Ages</p>
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {childAges.slice(0, numChildren).map((age, i) => (
                <span
                  key={i}
                  className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-sprout-light text-sprout-dark dark:bg-dark-border dark:text-dark-sprout"
                >
                  🌱 {age}y
                </span>
              ))}
            </div>
          </div>
        )}
        {showStartOver && (
          <div className="border-t border-sprout-light dark:border-dark-border pt-4">
            <button
              onClick={onStartOver}
              className="w-full rounded-xl border border-sprout-light dark:border-dark-border px-4 py-2.5 text-sm font-semibold text-sprout-dark dark:text-dark-sprout hover:bg-sprout-light dark:hover:bg-dark-border transition-colors"
            >
              ↩ Start over
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
