// Packing checklist presenter:
// - Tracks check/uncheck state for packing progress.
// - Persists progress to localStorage across refreshes.
// - Uses content-hash item IDs so check state survives list regeneration.
// - Lets users add custom items per category (stored in localStorage).
import { useState, useEffect, useMemo } from "react";
import {
  filterCheckedItems,
  getPackingItemIds,
  makeItemId,
  loadCustomItems,
  saveCustomItems,
} from "../utils/checklist";

export default function PackingChecklist({ packingList, onUpdate }) {
  const [checkedItems, setCheckedItems] = useState(new Set());
  const [collapsedCategories, setCollapsedCategories] = useState(new Set());
  // customItems: { [categoryName]: Array<{ name, quantity, reason, source: "custom" }> }
  const [customItems, setCustomItems] = useState(() => loadCustomItems());
  // Per-category "add item" input state
  const [addInputs, setAddInputs] = useState({});

  const validItemIds = useMemo(
    () => getPackingItemIds(packingList, customItems),
    [packingList, customItems],
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

  const handleAddCustomItem = (categoryName) => {
    const raw = (addInputs[categoryName] || "").trim();
    if (!raw) return;

    const newItem = {
      name: raw,
      quantity: "1",
      reason: "Added by you",
      source: "custom",
    };
    const updated = {
      ...customItems,
      [categoryName]: [...(customItems[categoryName] || []), newItem],
    };
    setCustomItems(updated);
    saveCustomItems(updated);
    setAddInputs((prev) => ({ ...prev, [categoryName]: "" }));
  };

  const handleRemoveCustomItem = (categoryName, itemName) => {
    const updated = {
      ...customItems,
      [categoryName]: (customItems[categoryName] || []).filter(
        (i) => i.name !== itemName,
      ),
    };
    setCustomItems(updated);
    saveCustomItems(updated);
  };

  // Count all items including custom items.
  const getTotalItems = () => {
    return packingList.categories.reduce((sum, cat) => {
      const customs = (customItems[cat.name] || []).length;
      return sum + cat.items.length + customs;
    }, 0);
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
    <div className="rounded-2xl border border-sprout-light dark:border-dark-border bg-white dark:bg-dark-card shadow-soft dark:shadow-soft-dark p-6">
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
        <div className="w-full bg-gray-100 dark:bg-dark-bg rounded-full h-3 overflow-hidden">
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
          const isCollapsed = collapsedCategories.has(category.name);
          const catCustoms = customItems[category.name] || [];
          const allItems = [
            ...category.items.map((item) => ({ ...item, source: "ai" })),
            ...catCustoms,
          ];
          const categoryChecked = allItems.filter((item) =>
            checkedItems.has(
              makeItemId(category.name, item.name, item.quantity),
            ),
          ).length;
          const categoryTotal = allItems.length;
          const categoryDone =
            categoryChecked === categoryTotal && categoryTotal > 0;

          return (
            <div
              key={catIndex}
              className="rounded-xl border border-sprout-light dark:border-dark-border overflow-hidden"
            >
              {/* Category header */}
              <button
                onClick={() => toggleCategory(category.name)}
                className={`w-full px-4 py-3 flex justify-between items-center transition-colors print:pointer-events-none ${
                  categoryDone
                    ? "bg-sprout-dark text-white"
                    : "bg-sprout-light dark:bg-dark-bg hover:bg-sprout-base/20 dark:hover:bg-dark-border"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm print:hidden">
                    {isCollapsed ? "▶" : "▼"}
                  </span>
                  <h4
                    className={`font-semibold text-sm ${
                      categoryDone ? "text-white" : "text-sprout-dark"
                    }`}
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
                <div className="p-3 space-y-1.5 bg-white dark:bg-dark-card">
                  {allItems.map((item) => {
                    const itemId = makeItemId(
                      category.name,
                      item.name,
                      item.quantity,
                    );
                    const isChecked = checkedItems.has(itemId);
                    const isCustom = item.source === "custom";

                    return (
                      <label
                        key={itemId}
                        className={`flex items-start gap-3 p-2.5 rounded-xl cursor-pointer transition-all ${
                          isChecked
                            ? "bg-sprout-light/60 dark:bg-dark-border"
                            : "hover:bg-gray-50 dark:hover:bg-dark-bg"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleItem(itemId)}
                          className="mt-0.5 h-4 w-4 rounded"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline gap-1.5 flex-wrap">
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
                            {isCustom && (
                              <span className="text-xs bg-sun/20 text-earth px-1.5 py-0 rounded-full font-semibold">
                                Custom
                              </span>
                            )}
                          </div>
                          {item.reason && (
                            <p className="text-xs text-muted mt-0.5">
                              {item.reason}
                            </p>
                          )}
                        </div>
                        {isCustom && (
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              handleRemoveCustomItem(category.name, item.name);
                            }}
                            className="text-muted hover:text-red-500 transition-colors text-xs shrink-0 mt-0.5"
                            aria-label={`Remove ${item.name}`}
                          >
                            ✕
                          </button>
                        )}
                      </label>
                    );
                  })}

                  {/* Add custom item input */}
                  <div className="flex gap-2 pt-2 print:hidden">
                    <input
                      type="text"
                      value={addInputs[category.name] || ""}
                      onChange={(e) =>
                        setAddInputs((prev) => ({
                          ...prev,
                          [category.name]: e.target.value,
                        }))
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter")
                          handleAddCustomItem(category.name);
                      }}
                      placeholder={`Add item to ${category.name}…`}
                      className="flex-1 text-xs rounded-lg border border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-bg px-3 py-1.5 text-slate-text dark:text-dark-text placeholder:text-muted dark:placeholder:text-dark-muted focus:border-sprout-base focus:ring-1 focus:ring-sprout-light dark:focus:ring-dark-border focus:outline-none transition"
                    />
                    <button
                      onClick={() => handleAddCustomItem(category.name)}
                      disabled={!(addInputs[category.name] || "").trim()}
                      className="text-xs rounded-lg border border-sprout-light dark:border-dark-border px-2.5 py-1.5 text-sprout-dark dark:text-dark-sprout font-semibold hover:bg-sprout-light dark:hover:bg-dark-border transition-colors disabled:opacity-40"
                    >
                      + Add
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
