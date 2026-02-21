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

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <div>
          <h3 className="text-lg font-semibold text-paper">Packing List</h3>
          <p className="text-sm text-muted">
            {getCheckedCount()} of {getTotalItems()} items packed
          </p>
        </div>
        <button
          onClick={handlePrint}
          className="px-4 py-2 text-xs uppercase tracking-[0.2em] border border-white/20 rounded-full hover:border-primary-500 print:hidden"
        >
          Print
        </button>
      </div>

      <div className="mb-4">
        <div className="w-full bg-white/10 rounded-full h-2">
          <div
            className="bg-primary-500 h-2 rounded-full transition-all duration-300"
            style={{ width: `${getProgress()}%` }}
          ></div>
        </div>
        <p className="text-xs text-muted mt-1 text-right">
          {getProgress()}% complete
        </p>
      </div>

      <div className="space-y-4">
        {packingList.categories.map((category, catIndex) => {
          const categoryId = `${category.name}-${catIndex}`;
          const isCollapsed = collapsedCategories.has(category.name);
          const categoryChecked = category.items.filter((item, idx) =>
            checkedItems.has(`${categoryId}-${idx}`),
          ).length;

          return (
            <div
              key={catIndex}
              className="rounded-2xl border border-white/10 overflow-hidden bg-white/5"
            >
              <button
                onClick={() => toggleCategory(category.name)}
                className="w-full px-4 py-3 bg-white/5 hover:bg-white/10 flex justify-between items-center print:bg-white print:pointer-events-none"
              >
                <div className="flex items-center gap-3">
                  <span className="text-xl print:hidden text-muted">
                    {isCollapsed ? "▶" : "▼"}
                  </span>
                  <h4 className="font-semibold text-paper">{category.name}</h4>
                  <span className="text-sm text-muted">
                    ({categoryChecked}/{category.items.length})
                  </span>
                </div>
              </button>

              {!isCollapsed && (
                <div className="p-4 space-y-2">
                  {category.items.map((item, itemIndex) => {
                    const itemId = `${categoryId}-${itemIndex}`;
                    const isChecked = checkedItems.has(itemId);

                    return (
                      <label
                        key={itemIndex}
                        className={`flex items-start gap-3 p-3 rounded-xl hover:bg-white/10 cursor-pointer transition-all ${
                          isChecked ? "bg-emerald-500/10" : ""
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleItem(itemId)}
                          className="mt-1 h-5 w-5 text-primary-500 rounded focus:ring-2 focus:ring-primary-500"
                        />
                        <div className="flex-1">
                          <div className="flex items-baseline gap-2">
                            <span
                              className={`font-medium ${
                                isChecked
                                  ? "line-through text-muted"
                                  : "text-paper"
                              }`}
                            >
                              {item.name}
                            </span>
                            <span className="text-sm text-muted">
                              ({item.quantity})
                            </span>
                          </div>
                          {item.reason && (
                            <p className="text-sm text-muted mt-1">
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
