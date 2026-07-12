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
import { Icon } from "./Icon.jsx";

const DO_FIRST_KEYWORDS = /(kid|child|baby|toddler|document|passport|id|medical|medic|prescription|rx)/i;

function isDoFirst(categoryName) {
  return DO_FIRST_KEYWORDS.test(categoryName || "");
}

function ShopPanel({ shopLinks }) {
  return (
    <div className="ml-7 mt-1 mb-2 p-3 bg-gray-50 rounded-xl border border-gray-200 print:hidden">
      <div className="flex gap-2 flex-wrap">
        {shopLinks.map(({ store, url, color }) => (
          <a
            key={store}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold text-white transition-opacity hover:opacity-80"
            style={{ backgroundColor: color }}
            onClick={(e) => e.stopPropagation()}
          >
            {store}
          </a>
        ))}
      </div>
      <p className="text-[11px] text-gray-400 mt-2">
        SproutRoute may earn a small commission — at no extra cost to you
      </p>
    </div>
  );
}

export default function PackingChecklist({ packingList, onUpdate }) {
  const [checkedItems, setCheckedItems] = useState(new Set());
  const [collapsedCategories, setCollapsedCategories] = useState(() => new Set());
  const [customItems, setCustomItems] = useState(() => loadCustomItems());
  const [addInputs, setAddInputs] = useState({});
  const [expandedShop, setExpandedShop] = useState(null);
  const [initializedCollapse, setInitializedCollapse] = useState(false);

  const validItemIds = useMemo(
    () => getPackingItemIds(packingList, customItems),
    [packingList, customItems],
  );

  // Sort categories: do-first first, then by remaining (unchecked) count desc, then original order
  const orderedCategories = useMemo(() => {
    if (!packingList?.categories) return [];
    const withCounts = packingList.categories.map((cat, originalIndex) => {
      const catCustoms = customItems[cat.name] || [];
      const all = [...cat.items, ...catCustoms];
      const remaining = all.filter(
        (it) => !checkedItems.has(makeItemId(cat.name, it.name, it.quantity)),
      ).length;
      return { cat, originalIndex, remaining, doFirst: isDoFirst(cat.name) };
    });
    return withCounts
      .slice()
      .sort((a, b) => {
        if (a.doFirst !== b.doFirst) return a.doFirst ? -1 : 1;
        if (a.remaining !== b.remaining) return b.remaining - a.remaining;
        return a.originalIndex - b.originalIndex;
      })
      .map((w) => w.cat);
  }, [packingList, customItems, checkedItems]);

  // Load saved checks
  useEffect(() => {
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

  // F8: auto-collapse a category when every item in it has been checked off
  useEffect(() => {
    if (!orderedCategories.length) return;
    setCollapsedCategories((prev) => {
      const next = new Set(prev);
      let changed = false;
      for (const cat of orderedCategories) {
        const all = [...cat.items, ...(customItems[cat.name] || [])];
        if (!all.length) continue;
        const allChecked = all.every((it) =>
          checkedItems.has(makeItemId(cat.name, it.name, it.quantity)),
        );
        if (allChecked && !next.has(cat.name)) {
          next.add(cat.name);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
    if (!initializedCollapse) setInitializedCollapse(true);
  }, [orderedCategories, checkedItems, customItems, initializedCollapse]);

  const toggleItem = (itemId) => {
    const newChecked = new Set(checkedItems);
    if (newChecked.has(itemId)) {
      newChecked.delete(itemId);
    } else {
      newChecked.add(itemId);
      setExpandedShop(null);
    }
    setCheckedItems(newChecked);
    localStorage.setItem("sproutroute_checked", JSON.stringify([...newChecked]));
    if (onUpdate) onUpdate(newChecked);
  };

  const toggleCategory = (categoryName) => {
    const newCollapsed = new Set(collapsedCategories);
    if (newCollapsed.has(categoryName)) newCollapsed.delete(categoryName);
    else newCollapsed.add(categoryName);
    setCollapsedCategories(newCollapsed);
  };

  const handleAddCustomItem = (categoryName) => {
    const raw = (addInputs[categoryName] || "").trim();
    if (!raw) return;
    const newItem = { name: raw, quantity: "1", reason: "Added by you", source: "custom" };
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
      [categoryName]: (customItems[categoryName] || []).filter((i) => i.name !== itemName),
    };
    setCustomItems(updated);
    saveCustomItems(updated);
  };

  const getTotalItems = () =>
    packingList.categories.reduce(
      (sum, cat) => sum + cat.items.length + (customItems[cat.name] || []).length,
      0,
    );

  const getCheckedCount = () =>
    [...checkedItems].filter((itemId) => validItemIds.has(itemId)).length;

  const getProgress = () => {
    const total = getTotalItems();
    return total > 0 ? Math.round((getCheckedCount() / total) * 100) : 0;
  };

  const handlePrint = () => window.print();

  if (!packingList || !packingList.categories) return null;

  const progress = getProgress();
  const checkedCount = getCheckedCount();
  const totalItems = getTotalItems();

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 md:p-6">
      {/* Header */}
      <div className="flex justify-between items-start mb-3">
        <div>
          <p className="text-[11px] font-mono font-semibold uppercase tracking-[0.15em] text-gray-500 inline-flex items-center gap-1.5">
            <Icon name="bag" size={12} /> Packing list
          </p>
          <h3 className="font-display text-[20px] font-bold text-gray-900 mt-1">What to pack</h3>
          <p className="text-[13px] text-gray-500 mt-0.5">
            {checkedCount} of {totalItems} items packed
          </p>
        </div>
        <button
          onClick={handlePrint}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-semibold border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition print:hidden"
        >
          Print
        </button>
      </div>

      {/* Sticky progress bar (F8) */}
      <div className="sticky top-[100px] z-10 bg-white/95 backdrop-blur-sm border-b border-gray-100 pb-3 mb-4 print:static print:bg-transparent">
        <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
          <div
            role="progressbar"
            aria-valuenow={progress}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Packing progress"
            className="h-2 transition-all duration-500"
            style={{
              width: `${progress}%`,
              background: progress === 100 ? "#16a34a" : "#22c55e",
            }}
          />
        </div>
        <div className="flex items-center justify-between mt-1.5">
          <span className="text-[12px] text-gray-500">
            {progress === 100 ? "All packed" : "Keep going"}
          </span>
          <span className="text-[12px] font-mono font-semibold text-gray-700">{progress}%</span>
        </div>
      </div>

      {/* Categories */}
      <div className="grid gap-3 md:grid-cols-2">
        {orderedCategories.map((category, catIndex) => {
          const isCollapsed = collapsedCategories.has(category.name);
          const catCustoms = customItems[category.name] || [];
          const allItems = [
            ...category.items.map((item) => ({ ...item, source: "ai" })),
            ...catCustoms,
          ];
          const categoryChecked = allItems.filter((item) =>
            checkedItems.has(makeItemId(category.name, item.name, item.quantity)),
          ).length;
          const categoryTotal = allItems.length;
          const categoryDone = categoryChecked === categoryTotal && categoryTotal > 0;
          const doFirst = isDoFirst(category.name);

          return (
            <div
              key={catIndex}
              className="rounded-2xl border border-gray-200 overflow-hidden"
            >
              <button
                onClick={() => toggleCategory(category.name)}
                aria-expanded={!isCollapsed}
                className={`w-full px-4 py-3 flex justify-between items-center transition-colors print:pointer-events-none ${
                  categoryDone
                    ? "bg-meadow-600 text-white"
                    : "bg-gray-50 hover:bg-gray-100"
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`text-[13px] print:hidden ${categoryDone ? "text-white" : "text-gray-500"}`}>
                    {isCollapsed ? "\u25B8" : "\u25BE"}
                  </span>
                  <h4
                    className={`font-semibold text-[14px] truncate ${
                      categoryDone ? "text-white" : "text-gray-900"
                    }`}
                  >
                    {category.name}
                  </h4>
                  {doFirst && !categoryDone && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-mono font-bold uppercase tracking-wider bg-amber-100 text-amber-800 rounded-full px-2 py-0.5 flex-shrink-0">
                      Do first
                    </span>
                  )}
                </div>
                <span
                  className={`text-[12px] font-mono font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${
                    categoryDone ? "bg-white/20 text-white" : "bg-white text-gray-700 border border-gray-200"
                  }`}
                >
                  {categoryChecked}/{categoryTotal}
                </span>
              </button>

              {!isCollapsed && (
                <div className="p-3 space-y-1.5 bg-white">
                  {allItems.map((item) => {
                    const itemId = makeItemId(category.name, item.name, item.quantity);
                    const isChecked = checkedItems.has(itemId);
                    const isCustom = item.source === "custom";

                    return (
                      <div key={itemId}>
                        <label
                          className={`flex items-start gap-3 p-2.5 rounded-xl cursor-pointer transition-all ${
                            isChecked ? "bg-meadow-50/70" : "hover:bg-gray-50"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleItem(itemId)}
                            className="mt-1 h-4 w-4 rounded accent-meadow-600"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-baseline gap-1.5 flex-wrap">
                              <span
                                className={`text-[14px] font-semibold ${
                                  isChecked ? "line-through text-gray-400" : "text-gray-900"
                                }`}
                              >
                                {item.name}
                              </span>
                              <span className="text-[12px] text-gray-400 shrink-0 font-mono">
                                {"\u00D7"}{item.quantity || 1}
                              </span>
                              {isCustom && (
                                <span className="text-[10px] font-mono font-bold uppercase tracking-wider bg-amber-100 text-amber-800 rounded-full px-1.5 py-0 flex-shrink-0">
                                  Custom
                                </span>
                              )}
                            </div>
                            {item.reason && (
                              <p className="text-[13px] text-gray-600 mt-0.5 leading-snug">
                                {item.reason}
                              </p>
                            )}
                          </div>
                          {!isChecked && item.shopLinks?.length > 0 && (
                            <button
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setExpandedShop(expandedShop === itemId ? null : itemId);
                              }}
                              className="inline-flex items-center gap-1 text-[12px] font-semibold text-white bg-gray-900 hover:bg-meadow-700 rounded-lg px-2.5 py-1 transition shrink-0 mt-0.5 print:hidden"
                              aria-label={`Shop for ${item.name}`}
                            >
                              Shop
                            </button>
                          )}
                          {isCustom && (
                            <button
                              onClick={(e) => {
                                e.preventDefault();
                                handleRemoveCustomItem(category.name, item.name);
                              }}
                              className="text-gray-400 hover:text-red-500 transition text-xs shrink-0 mt-1"
                              aria-label={`Remove ${item.name}`}
                            >
                              <Icon name="x" size={12} />
                            </button>
                          )}
                        </label>
                        {expandedShop === itemId && item.shopLinks?.length > 0 && (
                          <ShopPanel shopLinks={item.shopLinks} />
                        )}
                      </div>
                    );
                  })}

                  <div className="flex gap-2 pt-2 print:hidden">
                    <input
                      type="text"
                      value={addInputs[category.name] || ""}
                      onChange={(e) =>
                        setAddInputs((prev) => ({ ...prev, [category.name]: e.target.value }))
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleAddCustomItem(category.name);
                      }}
                      placeholder={`Add item to ${category.name}…`}
                      className="flex-1 text-[12px] rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-gray-900 placeholder:text-gray-400 focus:border-meadow-500 focus:ring-1 focus:ring-meadow-200 focus:outline-none transition"
                    />
                    <button
                      onClick={() => handleAddCustomItem(category.name)}
                      disabled={!(addInputs[category.name] || "").trim()}
                      className="text-[12px] rounded-lg border border-gray-200 px-2.5 py-1.5 text-gray-700 font-semibold hover:bg-gray-50 transition disabled:opacity-40"
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
