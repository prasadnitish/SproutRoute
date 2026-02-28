import { motion } from "framer-motion";

function LogoMark() {
  return (
    <svg
      width="36"
      height="36"
      viewBox="0 0 36 36"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M18 2L4 8v10c0 8.4 5.9 15.5 14 17 8.1-1.5 14-8.6 14-17V8L18 2z"
        fill="#2E7D32"
        stroke="#C8A84B"
        strokeWidth="1.5"
      />
      <path
        d="M6 14v4c0 .6.02 1.2.06 1.8h23.88c.04-.6.06-1.2.06-1.8v-4H6z"
        fill="#4FC3F7"
        opacity="0.5"
      />
      <ellipse cx="10" cy="22" rx="7" ry="4" fill="#43A047" opacity="0.7" />
      <ellipse cx="26" cy="22" rx="7" ry="4" fill="#43A047" opacity="0.7" />
      <path
        d="M18 30 C16 27 14 24 16 20 C18 16 20 18 18 14"
        stroke="#C8A84B"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
        opacity="0.9"
      />
      <g transform="translate(18,22)">
        <polygon points="0,-4 1,-1 0,0 -1,-1" fill="#C8A84B" />
        <polygon points="0,4 1,1 0,0 -1,1" fill="#795548" />
        <polygon points="-4,0 -1,-1 0,0 -1,1" fill="#C8A84B" />
        <polygon points="4,0 1,-1 0,0 1,1" fill="#795548" />
        <circle cx="0" cy="0" r="1" fill="#FDFDFD" />
      </g>
      <circle cx="10" cy="12" r="2.5" fill="#FFCA28" />
      <circle cx="10" cy="12" r="1.5" fill="#FFD54F" />
    </svg>
  );
}

export default function Header({ theme, onToggleTheme, showStartOver, onStartOver }) {
  return (
    <header className="sticky top-0 z-20 bg-white/80 dark:bg-dark-card/80 backdrop-blur-md border-b border-sprout-light/60 dark:border-dark-border/60">
      <div className="mx-auto max-w-6xl px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <LogoMark />
          <div>
            <span className="font-heading text-xl font-bold text-earth leading-none">
              SproutRoute
            </span>
            <p className="text-xs text-muted dark:text-dark-muted leading-none mt-0.5 hidden sm:block">
              Growing little explorers, one trip at a time.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={onToggleTheme}
            className="text-base px-2.5 py-1.5 rounded-xl text-muted dark:text-dark-muted hover:bg-sprout-light dark:hover:bg-dark-border transition-colors"
            aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            title={theme === "dark" ? "Light mode" : "Dark mode"}
          >
            {theme === "dark" ? "☀️" : "🌙"}
          </motion.button>
          {showStartOver && (
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={onStartOver}
              className="text-xs font-semibold uppercase tracking-wider text-muted dark:text-dark-muted hover:text-sprout-dark dark:hover:text-dark-sprout transition-colors px-3 py-1.5 rounded-xl hover:bg-sprout-light dark:hover:bg-dark-border"
            >
              ↩ Start Over
            </motion.button>
          )}
        </div>
      </div>
    </header>
  );
}
