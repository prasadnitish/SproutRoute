import { motion } from "framer-motion";

const TABS = [
  { id: "itinerary", label: "Itinerary", icon: "🗓" },
  { id: "packing", label: "Packing", icon: "🎒" },
  { id: "safety", label: "Safety", icon: "🛡" },
];

export default function ResultTabs({ activeTab, onTabChange }) {
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
