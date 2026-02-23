// Tab navigation for results screen — mirrors mobile tab bar.
// 3 tabs: Itinerary, Packing, Safety
// Active tab gets sprout-dark underline, inactive tabs stay muted.

export default function ResultTabs({ activeTab, onTabChange }) {
  const tabs = [
    { id: "itinerary", label: "Itinerary", icon: "🗓" },
    { id: "packing", label: "Packing", icon: "🎒" },
    { id: "safety", label: "Safety", icon: "🛡" },
  ];

  return (
    <div
      className="flex border-b border-sprout-light dark:border-dark-border mb-6 print:hidden"
      role="tablist"
      aria-label="Trip results"
    >
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={isActive}
            aria-controls={`tabpanel-${tab.id}`}
            onClick={() => onTabChange(tab.id)}
            className={`flex items-center gap-1.5 px-5 py-3 text-sm font-semibold transition-colors border-b-2 -mb-px ${
              isActive
                ? "border-sprout-dark text-sprout-dark dark:border-dark-sprout dark:text-dark-sprout"
                : "border-transparent text-muted dark:text-dark-muted hover:text-sprout-base dark:hover:text-dark-sprout hover:border-sprout-light dark:hover:border-dark-border"
            }`}
          >
            <span aria-hidden="true">{tab.icon}</span>
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
