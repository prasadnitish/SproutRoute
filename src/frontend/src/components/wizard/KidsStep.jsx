import { motion } from "framer-motion";

export default function KidsStep({
  numChildren,
  onNumChildrenChange,
  childAges,
  onChildAgesChange,
  childWeights,
  onChildWeightsChange,
  childHeights,
  onChildHeightsChange,
  onNext,
  onBack,
}) {
  const updateChildCount = (value) => {
    const n = Math.max(0, Math.min(10, parseInt(value) || 0));
    onNumChildrenChange(n);
    if (n > 0) {
      onChildAgesChange(Array(n).fill(0).map((_, i) => childAges[i] ?? 2));
      onChildWeightsChange(Array(n).fill("").map((_, i) => childWeights[i] ?? ""));
      onChildHeightsChange(Array(n).fill("").map((_, i) => childHeights[i] ?? ""));
    } else {
      onChildAgesChange([]);
      onChildWeightsChange([]);
      onChildHeightsChange([]);
    }
  };

  const updateAge = (index, value) => {
    const v = Math.max(0, Math.min(18, parseInt(value) || 0));
    const next = [...childAges];
    next[index] = v;
    onChildAgesChange(next);
  };

  const updateWeight = (index, value) => {
    const next = [...childWeights];
    next[index] = value;
    onChildWeightsChange(next);
  };

  const updateHeight = (index, value) => {
    const next = [...childHeights];
    next[index] = value;
    onChildHeightsChange(next);
  };

  return (
    <>
      <div>
        <h2 className="font-heading text-3xl md:text-4xl font-bold text-sprout-dark dark:text-dark-sprout">
          {numChildren > 0 ? "Who's coming along?" : "Traveling with kids?"}
        </h2>
        <p className="text-muted dark:text-dark-muted mt-2">
          {numChildren > 0
            ? "Add your little explorers so we can tailor the itinerary."
            : "No kids? No problem — we'll plan an adults-only trip."}
        </p>
      </div>

      {/* Stepper */}
      <div className="flex items-center gap-4">
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => updateChildCount(numChildren - 1)}
          disabled={numChildren <= 0}
          className="w-10 h-10 rounded-xl border border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-bg flex items-center justify-center text-lg font-bold text-slate-text dark:text-dark-text disabled:opacity-30 transition-colors hover:border-sprout-base"
        >
          -
        </motion.button>
        <div className="text-center">
          <span className="text-3xl font-bold text-sprout-dark dark:text-dark-sprout">{numChildren}</span>
          <p className="text-xs text-muted dark:text-dark-muted">
            {numChildren === 1 ? "child" : "children"}
          </p>
        </div>
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => updateChildCount(numChildren + 1)}
          disabled={numChildren >= 10}
          className="w-10 h-10 rounded-xl border border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-bg flex items-center justify-center text-lg font-bold text-slate-text dark:text-dark-text disabled:opacity-30 transition-colors hover:border-sprout-base"
        >
          +
        </motion.button>
      </div>

      {/* Per-child cards */}
      {numChildren > 0 && (
        <div className="grid gap-3 md:grid-cols-2">
          {Array(numChildren)
            .fill(0)
            .map((_, index) => (
              <motion.div
                key={`child-${index}`}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.06 }}
                className="rounded-2xl border border-sprout-light dark:border-dark-border bg-sprout-light/30 dark:bg-dark-bg p-4 space-y-3"
              >
                <p className="text-xs font-bold uppercase tracking-wider text-sprout-dark dark:text-dark-sprout">
                  🌱 Child {index + 1}
                </p>
                <label className="block text-sm font-medium text-slate-text dark:text-dark-text">
                  Age (years)
                  <input
                    type="number"
                    min="0"
                    max="18"
                    value={childAges[index] || 0}
                    onChange={(e) => updateAge(index, e.target.value)}
                    className="mt-1 w-full rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg px-3 py-2 text-slate-text dark:text-dark-text focus:border-sprout-base focus:ring-2 focus:ring-sprout-light dark:focus:ring-dark-border focus:outline-none transition"
                  />
                </label>
                <div className="grid gap-3 grid-cols-2">
                  <label className="block text-sm font-medium text-slate-text dark:text-dark-text">
                    Weight (lb)
                    <span className="block text-[10px] text-muted font-normal">
                      For car seat safety
                    </span>
                    <input
                      type="number"
                      min="2"
                      max="300"
                      step="0.1"
                      value={childWeights[index] || ""}
                      onChange={(e) => updateWeight(index, e.target.value)}
                      placeholder="Optional"
                      className="mt-1 w-full rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg px-3 py-2 text-sm text-slate-text dark:text-dark-text placeholder:text-muted dark:placeholder:text-dark-muted focus:border-sprout-base focus:ring-2 focus:ring-sprout-light dark:focus:ring-dark-border focus:outline-none transition"
                    />
                  </label>
                  <label className="block text-sm font-medium text-slate-text dark:text-dark-text">
                    Height (in)
                    <span className="block text-[10px] text-muted font-normal">
                      For car seat safety
                    </span>
                    <input
                      type="number"
                      min="10"
                      max="90"
                      step="0.1"
                      value={childHeights[index] || ""}
                      onChange={(e) => updateHeight(index, e.target.value)}
                      placeholder="Optional"
                      className="mt-1 w-full rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg px-3 py-2 text-sm text-slate-text dark:text-dark-text placeholder:text-muted dark:placeholder:text-dark-muted focus:border-sprout-base focus:ring-2 focus:ring-sprout-light dark:focus:ring-dark-border focus:outline-none transition"
                    />
                  </label>
                </div>
              </motion.div>
            ))}
        </div>
      )}

      <div className="flex items-center gap-4">
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={onNext}
          className="rounded-xl bg-sprout-dark text-white py-3 px-8 font-semibold text-sm hover:bg-sprout-base transition-colors shadow-soft"
        >
          Continue →
        </motion.button>
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
