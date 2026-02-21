// Packing checklist presenter:
// - Tracks check/uncheck state for packing progress.
// - Persists progress to localStorage across refreshes.
// - Prunes stale saved IDs whenever a regenerated list changes item identity.
import { useState, useEffect, useMemo } from "react";
import { filterCheckedItems, getPackingItemIds } from "../utils/checklist";

export default function PackingChecklist({ packingList, onUpdate }) {
  const [checkedItems, setCheckedItems] = useState(new Set());
  const [collapsedCategories, setCollapsedCategories] = useState(new Set());
  const validItemIds = useMemo(
    () => getPackingItemIds(packingList),
    [packingList],
  );

  useEffect(() => {
    // Reload saved checks and drop IDs that no longer exist in the current list version.
    const saved = localStorage.getItem("sproutroute_checked");
    if (saved) {
      try {
        const filtered = filterCheckedItems(JSON.parse(saved), validItemIds);
        setCheckedItems(new Set(filtered));
        localStorage.setItem("sproutroute_checked", JSON.stringify(filtered));
      } catch (err) {
        console.error("Failed to load checked items:", err);
      }
    }
  }, [validItemIds]);

  const toggleItem = (itemId) => {
    // Single source of truth for item toggles + persistence sync.
    const newChecked = new Set(checkedItems);
    if (newChecked.has(itemId)) {
      newChecked.delete(itemId);
    } else {
      newChecked.add(itemId);
    }
    setCheckedItems(newChecked);
    localStorage.setItem(
      "sproutroute_checked",
      JSON.stringify([...newChecked]),
    );
    if (onUpdate) onUpdate(newChecked);
  };

  const toggleCategory = (categoryName) => {
    // Category collapsing is local-only UI state; it is intentionally not persisted.
    const newCollapsed = new Set(collapsedCategories);
    if (newCollapsed.has(categoryName)) {
      newCollapsed.delete(categoryName);
    } else {
      newCollapsed.add(categoryName);
    }
    setCollapsedCategories(newCollapsed);
  };

  const getTotalItems = () => {
    // Used by both progress bar width and summary text.
    return packingList.categories.reduce(
      (sum, cat) => sum + cat.items.length,
      0,
    );
  };

  const getCheckedCount = () => {
    // Guard against stale IDs so percent complete reflects only current list items.
    return [...checkedItems].filter((itemId) => validItemIds.has(itemId))
      .length;
  };

  const getProgress = () => {
    const total = getTotalItems();
    return total > 0 ? Math.round((getCheckedCount() / total) * 100) : 0;
  };

  const handlePrint = () => {
    // Browser-native print flow keeps output simple and dependency-free.
    window.print();
  };

  if (!packingList || !packingList.categories) {
    return null;
  }

  const progress = getProgress();
  const checkedCount = getCheckedCount();
  const totalItems = getTotalItems();

  return (
    <div className="rounded-2xl border border-sprout-light bg-white shadow-soft p-6">
      {/* Header */}
      <div className="flex justify-between items-start mb-5">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-muted">
            🎒 Packing list
          </p>
          <h3 className="font-heading text-xl font-bold text-sprout-dark mt-1">
            What to pack
          </h3>
          <p className="text-sm text-muted mt-0.5">
            {checkedCount} of {totalItems} items packed
          </p>
        </div>
        <button
          onClick={handlePrint}
          className="px-4 py-2 text-xs font-semibold uppercase tracking-wider border border-sprout-light text-sprout-dark rounded-xl hover:bg-sprout-light transition-colors print:hidden"
        >
          🖨 Print
        </button>
      </div>

      {/* Progress bar */}
      <div className="mb-6">
        <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
          <div
            className="h-3 rounded-full transition-all duration-500"
            style={{
              width: `${progress}%`,
              background:
                progress === 100
                  ? "#2E7D32"
                  : "linear-gradient(90deg, #4FC3F7, #81C784)",
            }}
          />
        </div>
        <div className="flex items-center justify-between mt-1.5">
          <span className="text-xs text-muted">
            {progress === 100 ? "🎉 All packed!" : "Keep going!"}
          </span>
          <span className="text-xs font-semibold text-sprout-dark">
            {progress}%
          </span>
        </div>
      </div>

      {/* Categories — two-column grid on desktop */}
      <div className="grid gap-4 md:grid-cols-2">
        {packingList.categories.map((category, catIndex) => {
          const categoryId = `${category.name}-${catIndex}`;
          const isCollapsed = collapsedCategories.has(category.name);
          const categoryChecked = category.items.filter((item, idx) =>
            checkedItems.has(`${categoryId}-${idx}`),
          ).length;
          const categoryTotal = category.items.length;
          const categoryDone = categoryChecked === categoryTotal;

          return (
            <div
              key={catIndex}
              className="rounded-xl border border-sprout-light overflow-hidden"
            >
              {/* Category header */}
              <button
                onClick={() => toggleCategory(category.name)}
                className={`w-full px-4 py-3 flex justify-between items-center transition-colors print:pointer-events-none ${
                  categoryDone
                    ? "bg-sprout-dark text-white"
                    : "bg-sprout-light hover:bg-sprout-base/20"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm print:hidden">
                    {isCollapsed ? "▶" : "▼"}
                  </span>
                  <h4
                    className={`font-semibold text-sm ${categoryDone ? "text-white" : "text-sprout-dark"}`}
                  >
                    {category.name}
                  </h4>
                </div>
                <span
                  className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                    categoryDone
                      ? "bg-white/20 text-white"
                      : "bg-white text-sprout-dark"
                  }`}
                >
                  {categoryChecked}/{categoryTotal}
                </span>
              </button>

              {/* Items */}
              {!isCollapsed && (
                <div className="p-3 space-y-1.5 bg-white">
                  {category.items.map((item, itemIndex) => {
                    const itemId = `${categoryId}-${itemIndex}`;
                    const isChecked = checkedItems.has(itemId);

                    return (
                      <label
                        key={itemIndex}
                        className={`flex items-start gap-3 p-2.5 rounded-xl cursor-pointer transition-all ${
                          isChecked
                            ? "bg-sprout-light/60"
                            : "hover:bg-gray-50"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleItem(itemId)}
                          className="mt-0.5 h-4 w-4 rounded"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline gap-1.5">
                            <span
                              className={`text-sm font-medium ${
                                isChecked
                                  ? "line-through text-muted"
                                  : "text-slate-text"
                              }`}
                            >
                              {item.name}
                            </span>
                            <span className="text-xs text-muted shrink-0">
                              ×{item.quantity}
                            </span>
                          </div>
                          {item.reason && (
                            <p className="text-xs text-muted mt-0.5">
                              {item.reason}
                            </p>
                          )}
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
