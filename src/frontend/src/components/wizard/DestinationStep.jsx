import { motion } from "framer-motion";

export default function DestinationStep({
  destinationQuery,
  onQueryChange,
  onResolve,
  suggestions,
  onSelectSuggestion,
  onUseOriginal,
  onBack,
  isLoading,
  showSuggestions,
}) {
  if (showSuggestions && suggestions.length > 0) {
    return (
      <>
        <div>
          <h2 className="font-heading text-3xl md:text-4xl font-bold text-sprout-dark dark:text-dark-sprout">
            Pick a destination
          </h2>
          <p className="text-muted dark:text-dark-muted mt-2">
            These places match your request — choose one to continue.
          </p>
        </div>
        <div className="space-y-3">
          {suggestions.map((place, i) => (
            <motion.button
              key={`${place.displayName || place.name}-${i}`}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08 }}
              whileHover={{ scale: 1.01, boxShadow: "0 4px 20px -2px rgba(46, 125, 50, 0.12)" }}
              whileTap={{ scale: 0.99 }}
              onClick={() => onSelectSuggestion(place)}
              className="w-full rounded-xl border border-sprout-light dark:border-dark-border bg-white dark:bg-dark-bg px-5 py-4 text-left transition hover:border-sprout-base dark:hover:border-dark-sprout group"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="text-base font-semibold text-slate-text dark:text-dark-text group-hover:text-sprout-dark dark:group-hover:text-dark-sprout">
                    {place.displayName || place.name}
                  </div>
                  {place.why && (
                    <p className="text-xs text-muted dark:text-dark-muted mt-1 line-clamp-2">
                      {place.why}
                    </p>
                  )}
                  {place.vibeDescription && (
                    <p className="text-xs text-sprout-dark/70 dark:text-dark-sprout/70 mt-1 italic">
                      {place.vibeDescription}
                    </p>
                  )}
                  {place.distanceMiles && (
                    <div className="text-xs text-muted dark:text-dark-muted mt-1">
                      About {place.distanceMiles} miles away
                    </div>
                  )}
                </div>
                {place.tripType && (
                  <span className="shrink-0 rounded-full bg-sprout-light dark:bg-dark-border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-sprout-dark dark:text-dark-sprout">
                    {place.tripType}
                  </span>
                )}
              </div>
            </motion.button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <button
            onClick={onUseOriginal}
            className="text-sm font-semibold text-sprout-dark dark:text-dark-sprout hover:text-sprout-base transition-colors"
          >
            Use my original input instead
          </button>
          <button
            onClick={onBack}
            className="text-sm text-muted hover:text-slate-text dark:hover:text-dark-text transition-colors"
          >
            ← Back
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      <div>
        <h2 className="font-heading text-3xl md:text-4xl font-bold text-sprout-dark dark:text-dark-sprout">
          Where are you headed?
        </h2>
        <p className="text-muted dark:text-dark-muted mt-2">
          Try "Seattle, WA", "Caribbean cruise from Miami", or "2 hour drive from Seattle."
        </p>
      </div>
      <div className="relative">
        <input
          type="text"
          value={destinationQuery}
          onChange={(e) => onQueryChange(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onResolve()}
          placeholder="Type your destination..."
          className="w-full rounded-2xl border border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-bg px-5 py-5 text-xl text-slate-text dark:text-dark-text placeholder:text-muted dark:placeholder:text-dark-muted focus:border-sprout-base focus:ring-2 focus:ring-sprout-light dark:focus:ring-dark-border focus:outline-none transition"
          autoFocus
        />
        {isLoading && (
          <div className="absolute right-4 top-1/2 -translate-y-1/2">
            <div className="w-5 h-5 border-2 border-sprout-dark/30 border-t-sprout-dark rounded-full animate-spin" />
          </div>
        )}
      </div>
      <p className="text-xs text-muted dark:text-dark-muted -mt-2">
        Works worldwide · No account required
      </p>
      <div>
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={onResolve}
          disabled={isLoading}
          className="rounded-xl bg-sprout-dark text-white py-3 px-8 font-semibold text-sm hover:bg-sprout-base transition-colors disabled:opacity-60 shadow-soft"
        >
          {isLoading ? "Finding places..." : "Continue →"}
        </motion.button>
      </div>
    </>
  );
}
