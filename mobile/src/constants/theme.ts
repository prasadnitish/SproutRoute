/**
 * SproutRoute design tokens — ported from web tailwind.config.js
 * Used throughout all React Native screens and components.
 */

export const Colors = {
  // Primary greens (sprout brand)
  sproutLight: "#E8F5E9",
  sproutBase: "#81C784",
  sproutDark: "#2E7D32",

  // Blues (sky accents)
  skyLight: "#E1F5FE",
  skyBase: "#4FC3F7",
  skyDark: "#0277BD",

  // Earthy accents
  earth: "#795548",
  sun: "#FFCA28",
  sunLight: "#FFF9C4",

  // Logo / brand specific
  compassGold: "#C8A84B",
  hills: "#43A047",

  // Neutrals
  paper: "#FDFDFD",
  white: "#FFFFFF",
  slateText: "#334155",
  muted: "#64748B",
  border: "rgba(46,125,50,0.15)",

  // Status colors
  error: "#DC2626",
  errorLight: "#FEE2E2",
  red: "#EF4444",
  redLight: "#FEF2F2",
  redBorder: "#FECACA",

  // UI
  text: "#1A2E1A",
  surface: "#FFFFFF",

  // Backgrounds
  background: "#F8FBF8",
  cardBackground: "#FFFFFF",
};

export const FontFamily = {
  heading: "Nunito_700Bold",
  headingBold: "Nunito_700Bold",
  headingSemiBold: "Nunito_600SemiBold",
  body: "Inter_400Regular",
  bodyMedium: "Inter_500Medium",
  bodySemiBold: "Inter_600SemiBold",
  bodyBold: "Inter_700Bold",
};

export const FontSize = {
  xs: 11,
  sm: 13,
  base: 15,
  lg: 17,
  xl: 20,
  "2xl": 24,
  "3xl": 30,
};

export const Spacing = {
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
};

export const BorderRadius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  "2xl": 24,
  full: 999,
};

export const Shadow = {
  soft: {
    shadowColor: Colors.sproutDark,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 20,
    elevation: 4,
  },
  card: {
    shadowColor: Colors.sproutDark,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 2,
  },
};

// Alias for convenient imports
export const Shadows = {
  sm: Shadow.card,
  md: Shadow.soft,
};
