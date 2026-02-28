import { motion, AnimatePresence } from "framer-motion";

const PHASES = [
  { key: "destination", icon: "🌍", label: "Resolving destination..." },
  { key: "weather", icon: "⛅", label: "Checking weather..." },
  { key: "itinerary", icon: "🗺️", label: "Building itinerary..." },
  { key: "packing", icon: "🎒", label: "Packing your bags..." },
  { key: "done", icon: "✨", label: "Finalizing your trip!" },
];

function getPhaseIndex(completedPhases) {
  if (!completedPhases || completedPhases.size === 0) return 0;
  for (let i = 0; i < PHASES.length; i++) {
    if (!completedPhases.has(PHASES[i].key)) return i;
  }
  return PHASES.length;
}

export default function LoadingOverlay({
  isVisible,
  completedPhases,
  error,
  onCancel,
  onRetry,
}) {
  const activeIndex = getPhaseIndex(completedPhases);

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-md"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: "spring", duration: 0.4 }}
            className="bg-white dark:bg-dark-card rounded-3xl shadow-xl p-8 md:p-10 max-w-md w-full mx-4 border border-sprout-light dark:border-dark-border"
          >
            <h3 className="font-heading text-xl font-bold text-sprout-dark dark:text-dark-sprout mb-6 text-center">
              Building your trip...
            </h3>

            {/* Phase timeline */}
            <div className="space-y-4 mb-8">
              {PHASES.map((phase, i) => {
                const isCompleted = completedPhases?.has(phase.key);
                const isActive = i === activeIndex && !error;
                const isFuture = i > activeIndex;

                return (
                  <motion.div
                    key={phase.key}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.1 }}
                    className="flex items-center gap-3"
                  >
                    {/* Status indicator */}
                    <div className="w-8 h-8 flex items-center justify-center shrink-0">
                      {isCompleted ? (
                        <motion.div
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          className="w-6 h-6 rounded-full bg-sprout-dark dark:bg-dark-sprout flex items-center justify-center"
                        >
                          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                            <path d="M2.5 6.5L5 9L9.5 3.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </motion.div>
                      ) : isActive ? (
                        <motion.div
                          className="w-6 h-6 rounded-full border-2 border-sprout-dark dark:border-dark-sprout"
                          animate={{
                            boxShadow: [
                              "0 0 0 0px rgba(46,125,50,0.3)",
                              "0 0 0 6px rgba(46,125,50,0)",
                              "0 0 0 0px rgba(46,125,50,0.3)",
                            ],
                          }}
                          transition={{ duration: 1.5, repeat: Infinity }}
                        >
                          <div className="w-full h-full rounded-full bg-sprout-dark/20 dark:bg-dark-sprout/20" />
                        </motion.div>
                      ) : (
                        <div className="w-6 h-6 rounded-full bg-gray-100 dark:bg-dark-border" />
                      )}
                    </div>

                    {/* Label */}
                    <div className="flex items-center gap-2">
                      <span className={isFuture ? "grayscale opacity-30" : ""}>
                        {phase.icon}
                      </span>
                      <span
                        className={`text-sm ${
                          isCompleted
                            ? "text-muted dark:text-dark-muted line-through"
                            : isActive
                              ? "text-sprout-dark dark:text-dark-sprout font-semibold"
                              : "text-muted/50 dark:text-dark-muted/50"
                        }`}
                      >
                        {isCompleted
                          ? phase.label.replace("...", " ✓")
                          : phase.label}
                      </span>
                    </div>
                  </motion.div>
                );
              })}
            </div>

            {/* Error state */}
            {error && (
              <div className="rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-4 py-3 mb-4">
                <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
              </div>
            )}

            {/* Action buttons */}
            <div className="flex gap-3">
              {error && onRetry && (
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={onRetry}
                  className="flex-1 rounded-xl bg-sprout-dark text-white py-2.5 font-semibold text-sm hover:bg-sprout-base transition-colors"
                >
                  Try Again
                </motion.button>
              )}
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={onCancel}
                className={`rounded-xl border border-gray-200 dark:border-dark-border text-muted dark:text-dark-muted py-2.5 px-6 font-semibold text-sm hover:bg-gray-50 dark:hover:bg-dark-border transition-colors ${error ? "" : "w-full"}`}
              >
                Cancel
              </motion.button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
