import { motion, AnimatePresence } from "framer-motion";

export default function ResetModal({ isOpen, onConfirm, onCancel }) {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="reset-modal-title"
          onClick={onCancel}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ type: "spring", duration: 0.3 }}
            className="bg-white dark:bg-dark-card rounded-2xl shadow-xl p-8 max-w-sm w-full mx-4 border border-sprout-light dark:border-dark-border"
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              id="reset-modal-title"
              className="font-heading text-xl font-bold text-sprout-dark dark:text-dark-sprout mb-2"
            >
              Start over?
            </h2>
            <p className="text-sm text-muted dark:text-dark-muted mb-6">
              This will clear your current trip plan, packing list, and all
              saved data. This can&rsquo;t be undone.
            </p>
            <div className="flex gap-3">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={onConfirm}
                className="flex-1 rounded-xl bg-red-500 text-white py-2.5 font-semibold text-sm hover:bg-red-600 transition-colors"
              >
                Start Fresh
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={onCancel}
                className="flex-1 rounded-xl border border-sprout-light dark:border-dark-border text-sprout-dark dark:text-dark-sprout py-2.5 font-semibold text-sm hover:bg-sprout-light dark:hover:bg-dark-border transition-colors"
              >
                Keep My Trip
              </motion.button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
