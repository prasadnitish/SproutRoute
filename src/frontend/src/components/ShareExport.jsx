import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

export default function ShareExport({ tripData, isVisible }) {
  const [showMenu, setShowMenu] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!isVisible) return null;

  const shareText = tripData
    ? `Check out my ${tripData.destination} trip plan on SproutRoute!`
    : "Check out my trip plan on SproutRoute!";

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: "SproutRoute Trip Plan",
          text: shareText,
          url: window.location.href,
        });
      } catch {
        // User cancelled or share failed — no action needed
      }
    } else {
      setShowMenu((prev) => !prev);
    }
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
      const input = document.createElement("input");
      input.value = window.location.href;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      document.body.removeChild(input);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handlePrint = () => {
    window.print();
    setShowMenu(false);
  };

  return (
    <div className="relative print:hidden">
      <motion.button
        whileHover={{ scale: 1.03 }}
        whileTap={{ scale: 0.97 }}
        onClick={handleShare}
        className="rounded-xl border border-sprout-light dark:border-dark-border px-4 py-2 text-sm font-semibold text-sprout-dark dark:text-dark-sprout transition hover:bg-sprout-light dark:hover:bg-dark-border"
      >
        📤 Share
      </motion.button>

      <AnimatePresence>
        {showMenu && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.95 }}
            className="absolute right-0 top-full mt-2 w-48 rounded-xl border border-sprout-light dark:border-dark-border bg-white dark:bg-dark-card shadow-xl z-10 overflow-hidden"
          >
            <button
              onClick={handleCopyLink}
              className="w-full px-4 py-3 text-sm text-left text-slate-text dark:text-dark-text hover:bg-sprout-light/40 dark:hover:bg-dark-border transition-colors flex items-center gap-2"
            >
              {copied ? "✅ Copied!" : "🔗 Copy link"}
            </button>
            <button
              onClick={handlePrint}
              className="w-full px-4 py-3 text-sm text-left text-slate-text dark:text-dark-text hover:bg-sprout-light/40 dark:hover:bg-dark-border transition-colors flex items-center gap-2 border-t border-sprout-light/60 dark:border-dark-border"
            >
              🖨 Print
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
