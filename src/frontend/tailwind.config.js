/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Inter"', 'sans-serif'],
        display: ['"Space Grotesk"', 'sans-serif'],
        body: ['"Inter"', 'sans-serif'],
      },
      colors: {
        // Primary — Fresh Meadow greens (new primary scale)
        meadow: {
          50: '#f0fdf4',
          100: '#dcfce7',
          200: '#bbf7d0',
          300: '#86efac',
          400: '#4ade80',
          500: '#22c55e',
          600: '#16a34a',
          700: '#15803d',
          800: '#166534',
          900: '#14532d',
        },
        // Legacy greens — kept for backward compatibility
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
      },
      boxShadow: {
        soft: "0 4px 20px -2px rgba(46, 125, 50, 0.08)",
        card: "0 2px 12px -2px rgba(46, 125, 50, 0.06)",
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
