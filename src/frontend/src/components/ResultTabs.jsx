import { motion } from "framer-motion";

const TABS = [
  { id: "itinerary", label: "Itinerary", icon: "🗓" },
  { id: "packing", label: "Packing", icon: "🎒" },
  { id: "safety", label: "Safety", icon: "🛡" },
];

export default function ResultTabs({ activeTab, onTabChange, packingCount, safetyAlerts }) {
  return (
    <div
      className="flex border-b border-sprout-light dark:border-dark-border mb-6 print:hidden relative"
      role="tablist"
      aria-label="Trip results"
    >
      {TABS.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={isActive}
            aria-controls={`tabpanel-${tab.id}`}
            onClick={() => onTabChange(tab.id)}
            className={`relative flex items-center gap-1.5 px-5 py-3 text-sm font-semibold transition-colors -mb-px ${
              isActive
                ? "text-sprout-dark dark:text-dark-sprout"
                : "text-muted dark:text-dark-muted hover:text-sprout-base dark:hover:text-dark-sprout"
            }`}
          >
            <span aria-hidden="true">{tab.icon}</span>
            {tab.label}
            {tab.id === "packing" && packingCount > 0 && (
              <span className="ml-1 text-[10px] font-bold bg-sprout-light dark:bg-dark-border text-sprout-dark dark:text-dark-sprout px-1.5 py-0.5 rounded-full">
                {packingCount}
              </span>
            )}
            {tab.id === "safety" && safetyAlerts > 0 && (
              <span className="ml-1 text-[10px] font-bold bg-sun/20 text-earth px-1.5 py-0.5 rounded-full">
                {safetyAlerts}
              </span>
            )}
            {isActive && (
              <motion.div
                layoutId="tab-underline"
                className="absolute bottom-0 left-0 right-0 h-0.5 bg-sprout-dark dark:bg-dark-sprout rounded-full"
                transition={{ type: "spring", stiffness: 500, damping: 35 }}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
