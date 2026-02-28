import { motion } from "framer-motion";

const STEPS = [
  { num: 1, label: "Destination" },
  { num: 2, label: "Dates" },
  { num: 3, label: "Travelers" },
  { num: 4, label: "Activities" },
];

export default function WizardProgress({ currentStep, totalSteps = 4 }) {
  return (
    <div className="flex items-center w-full mb-2">
      {STEPS.slice(0, totalSteps).map((step, i) => {
        const isDone = step.num < currentStep;
        const isActive = step.num === currentStep;
        const isFuture = step.num > currentStep;

        return (
          <div key={step.num} className="flex items-center flex-1 last:flex-none">
            {/* Circle */}
            <div className="flex flex-col items-center">
              <motion.div
                className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold border-2 transition-colors ${
                  isDone
                    ? "bg-sprout-dark border-sprout-dark text-white"
                    : isActive
                      ? "bg-white dark:bg-dark-card border-sprout-dark dark:border-dark-sprout text-sprout-dark dark:text-dark-sprout"
                      : "bg-gray-100 dark:bg-dark-bg border-gray-300 dark:border-dark-border text-muted dark:text-dark-muted"
                }`}
                animate={isActive ? { boxShadow: ["0 0 0 0px rgba(46,125,50,0.2)", "0 0 0 6px rgba(46,125,50,0)", "0 0 0 0px rgba(46,125,50,0.2)"] } : {}}
                transition={isActive ? { duration: 2, repeat: Infinity } : {}}
              >
                {isDone ? (
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M3.5 8.5L6.5 11.5L12.5 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : (
                  step.num
                )}
              </motion.div>
              <span
                className={`hidden sm:block text-[10px] mt-1.5 font-medium tracking-wide ${
                  isDone
                    ? "text-sprout-dark dark:text-dark-sprout"
                    : isActive
                      ? "text-sprout-dark dark:text-dark-sprout font-bold"
                      : "text-muted dark:text-dark-muted"
                }`}
              >
                {step.label}
              </span>
            </div>

            {/* Connecting line */}
            {i < totalSteps - 1 && (
              <div className="flex-1 h-0.5 mx-2 mt-[-18px] sm:mt-0 rounded-full overflow-hidden bg-gray-200 dark:bg-dark-border">
                <motion.div
                  className="h-full bg-sprout-dark dark:bg-dark-sprout rounded-full"
                  initial={{ width: "0%" }}
                  animate={{ width: isDone ? "100%" : "0%" }}
                  transition={{ duration: 0.4 }}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
