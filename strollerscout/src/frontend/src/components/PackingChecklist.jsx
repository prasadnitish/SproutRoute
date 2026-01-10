import { useState, useEffect } from "react";

export default function PackingChecklist({ packingList, onUpdate }) {
  const [checkedItems, setCheckedItems] = useState(new Set());
  const [collapsedCategories, setCollapsedCategories] = useState(new Set());

  useEffect(() => {
    const saved = localStorage.getItem("strollerscout_checked");
    if (saved) {
      try {
        setCheckedItems(new Set(JSON.parse(saved)));
      } catch (err) {
        console.error("Failed to load checked items:", err);
      }
    }
  }, []);

  const toggleItem = (itemId) => {
    const newChecked = new Set(checkedItems);
    if (newChecked.has(itemId)) {
      newChecked.delete(itemId);
    } else {
      newChecked.add(itemId);
    }
    setCheckedItems(newChecked);
    localStorage.setItem(
      "strollerscout_checked",
      JSON.stringify([...newChecked]),
    );
    if (onUpdate) onUpdate(newChecked);
  };

  const toggleCategory = (categoryName) => {
    const newCollapsed = new Set(collapsedCategories);
    if (newCollapsed.has(categoryName)) {
      newCollapsed.delete(categoryName);
    } else {
      newCollapsed.add(categoryName);
    }
    setCollapsedCategories(newCollapsed);
  };

  const getTotalItems = () => {
    return packingList.categories.reduce(
      (sum, cat) => sum + cat.items.length,
      0,
    );
  };

  const getCheckedCount = () => {
    return checkedItems.size;
  };

  const getProgress = () => {
    const total = getTotalItems();
    return total > 0 ? Math.round((getCheckedCount() / total) * 100) : 0;
  };

  const handlePrint = () => {
    window.print();
  };

  if (!packingList || !packingList.categories) {
    return null;
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-800">Packing List</h3>
          <p className="text-sm text-gray-600">
            {getCheckedCount()} of {getTotalItems()} items packed
          </p>
        </div>
        <button
          onClick={handlePrint}
          className="px-4 py-2 text-sm bg-white border border-gray-300 rounded-lg hover:bg-gray-50 print:hidden"
        >
          Print List
        </button>
      </div>

      <div className="mb-4">
        <div className="w-full bg-gray-200 rounded-full h-3">
          <div
            className="bg-primary-600 h-3 rounded-full transition-all duration-300"
            style={{ width: `${getProgress()}%` }}
          ></div>
        </div>
        <p className="text-xs text-gray-600 mt-1 text-right">
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
              className="bg-white rounded-lg border border-gray-200 overflow-hidden"
            >
              <button
                onClick={() => toggleCategory(category.name)}
                className="w-full px-4 py-3 bg-gray-50 hover:bg-gray-100 flex justify-between items-center print:bg-white print:pointer-events-none"
              >
                <div className="flex items-center gap-3">
                  <span className="text-xl print:hidden">
                    {isCollapsed ? "▶" : "▼"}
                  </span>
                  <h4 className="font-semibold text-gray-800">
                    {category.name}
                  </h4>
                  <span className="text-sm text-gray-500">
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
                        className={`flex items-start gap-3 p-3 rounded-lg hover:bg-gray-50 cursor-pointer transition-all ${
                          isChecked ? "bg-green-50" : ""
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleItem(itemId)}
                          className="mt-1 h-5 w-5 text-primary-600 rounded focus:ring-2 focus:ring-primary-500"
                        />
                        <div className="flex-1">
                          <div className="flex items-baseline gap-2">
                            <span
                              className={`font-medium ${
                                isChecked
                                  ? "line-through text-gray-500"
                                  : "text-gray-800"
                              }`}
                            >
                              {item.name}
                            </span>
                            <span className="text-sm text-gray-500">
                              ({item.quantity})
                            </span>
                          </div>
                          {item.reason && (
                            <p className="text-sm text-gray-600 mt-1">
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

      <style jsx>{`
        @media print {
          .print\\:hidden {
            display: none !important;
          }
          .print\\:bg-white {
            background-color: white !important;
          }
          .print\\:pointer-events-none {
            pointer-events: none !important;
          }
        }
      `}</style>
    </div>
  );
}
