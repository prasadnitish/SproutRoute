/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  // 'class' strategy: dark mode toggled by adding/removing 'dark' class on <html>.
  // Supports user-controlled toggle + respects prefers-color-scheme as the default.
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "sans-serif"],
        heading: ["Nunito", "sans-serif"],
      },
      colors: {
        // Primary — Greens (Growth / Nature)
        sprout: {
          light: "#E8F5E9",
          base: "#81C784",
          dark: "#2E7D32",
        },
        // Secondary — Blues (Sky / Water / Path)
        sky: {
          light: "#E1F5FE",
          base: "#4FC3F7",
          dark: "#0277BD",
        },
        // Accents — Earth & Sun
        earth: "#795548",
        sun: "#FFCA28",
        // Neutrals
        paper: "#FDFDFD",
        "slate-text": "#334155",
        muted: "#64748B",
        // Dark mode surface palette
        "dark-bg": "#0f1a10",
        "dark-card": "#1a2e1b",
        "dark-border": "#2d4a2e",
        "dark-text": "#e8f5e9",
        "dark-muted": "#9ab89b",
        "dark-sprout": "#a5d6a7",
      },
      boxShadow: {
        soft: "0 4px 20px -2px rgba(46, 125, 50, 0.08)",
        card: "0 2px 12px -2px rgba(46, 125, 50, 0.06)",
        "soft-dark": "0 4px 20px -2px rgba(0, 0, 0, 0.4)",
      },
      borderRadius: {
        xl: "1rem",
        "2xl": "1.5rem",
        "3xl": "2rem",
      },
    },
  },
  plugins: [],
};
