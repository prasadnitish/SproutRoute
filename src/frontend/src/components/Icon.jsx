const PATHS = {
  arrowLeft: "M19 12H5M12 19l-7-7 7-7",
  arrowRight: "M5 12h14M12 5l7 7-7 7",
  arrowUp: "M12 19V5M5 12l7-7 7 7",
  pencil: "M12 20h9M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4 12.5-12.5z",
  map: "M9 3v18M15 6v18M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3V6z",
  pin: "M12 21s-7-7.5-7-12a7 7 0 1114 0c0 4.5-7 12-7 12z|M12 10.5a2 2 0 100-4 2 2 0 000 4z",
  bag: "M6 7h12l-1 13H7L6 7z|M9 7V5a3 3 0 116 0v2",
  shield: "M12 3l9 4v5c0 5-4 9-9 10-5-1-9-5-9-10V7l9-4z",
  clock: "M12 8v4l3 2|M12 22a10 10 0 100-20 10 10 0 000 20z",
  sun: "M12 4V2M12 22v-2M4 12H2M22 12h-2M6 6L4 4M20 20l-2-2M6 18l-2 2M20 4l-2 2|M12 18a6 6 0 100-12 6 6 0 000 12z",
  cloud: "M6 18h12a4 4 0 000-8 6 6 0 10-12 2 4 4 0 000 6z",
  rain: "M6 14h12a4 4 0 000-8 6 6 0 10-12 2 4 4 0 000 6z|M8 18v2M12 18v3M16 18v2",
  snow: "M12 2v20M2 12h20M5 5l14 14M19 5L5 19",
  partly: "M6 16h10a4 4 0 100-8 5 5 0 00-9 1|M18 3v2M22 7h-2M20 4l-1 1",
  storm: "M6 14h12a4 4 0 000-8 6 6 0 10-12 2 4 4 0 000 6z|M12 14l-2 4h3l-2 4",
  fog: "M3 9h18M3 13h18M3 17h18M3 5h14",
  globe: "M12 22a10 10 0 100-20 10 10 0 000 20z|M2 12h20M12 2a15 15 0 010 20M12 2a15 15 0 000 20",
  calendar: "M4 6h16v14H4z|M4 10h16M8 3v4M16 3v4",
  kids: "M12 12a4 4 0 100-8 4 4 0 000 8z|M4 21v-1a8 8 0 0116 0v1",
  paw: "M9 12a2.5 2.5 0 10 0-5 2.5 2.5 0 000 5z|M15 12a2.5 2.5 0 100-5 2.5 2.5 0 000 5z|M5 17a2 2 0 100-4 2 2 0 000 4z|M19 17a2 2 0 100-4 2 2 0 000 4z|M12 22a5 5 0 01-5-5c0-2 2-3 5-3s5 1 5 3a5 5 0 01-5 5z",
  beach: "M4 20h16M8 20V7a5 5 0 0110 0|M8 7l12 3",
  mountain: "M3 20l6-10 4 6 2-3 6 7z",
  castle: "M4 20V8h4V4h2v4h4V4h2v4h4v12z|M9 20v-6h6v6",
  cruise: "M4 20h16M6 20V10l6-3 6 3v10|M12 7V3",
  camping: "M12 4L4 20h16z|M12 20V4",
  city: "M4 20V8h6v12zM10 20V4h4v16zM14 20V10h6v10z",
  plane: "M21 13l-8 7-1-5-5-1 7-8z|M3 11l10 2 6-6-2-2-6 6z",
  check: "M5 12l5 5 9-10",
  circle: "M12 22a10 10 0 100-20 10 10 0 000 20z",
  plus: "M12 5v14M5 12h14",
  x: "M6 6l12 12M18 6L6 18",
  warning: "M12 2l10 18H2z|M12 9v5M12 18v.5",
  sparkle: "M12 3v4M12 17v4M3 12h4M17 12h4M5 5l3 3M16 16l3 3M5 19l3-3M16 8l3-3",
  share: "M4 12v8h16v-8M16 6l-4-4-4 4M12 2v14",
  home: "M3 11l9-7 9 7v10h-6v-6h-6v6H3z",
  history: "M3 12a9 9 0 109-9|M3 6v6h6|M12 7v5l3 2",
  heart: "M12 21s-7-4.5-9-9a5 5 0 019-3 5 5 0 019 3c-2 4.5-9 9-9 9z",
  food: "M6 3v7a3 3 0 006 0V3|M9 3v18M18 3c-1 0-3 2-3 6s2 6 3 6v6",
  documents: "M6 2h9l5 5v15H6z|M15 2v5h5M9 13h6M9 17h6",
};

export function Icon({ name, size = 16, stroke = 1.5, className = "", ...rest }) {
  const raw = PATHS[name];
  if (!raw) return null;
  const segments = raw.split("|");
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`inline-block flex-shrink-0 ${className}`}
      aria-hidden="true"
      {...rest}
    >
      {segments.map((d, i) => (
        <path key={i} d={d} />
      ))}
    </svg>
  );
}

export function weatherIconName(condition) {
  if (!condition) return "partly";
  const c = condition.toLowerCase();
  if (c.includes("thunder") || c.includes("storm")) return "storm";
  if (c.includes("rain") || c.includes("shower")) return "rain";
  if (c.includes("snow")) return "snow";
  if (c.includes("fog") || c.includes("mist")) return "fog";
  if (c.includes("partly") || c.includes("partial")) return "partly";
  if (c.includes("cloud") || c.includes("overcast")) return "cloud";
  if (c.includes("sun") || c.includes("clear")) return "sun";
  return "partly";
}

export function categoryIconName(category) {
  if (!category) return "pin";
  const c = String(category).toLowerCase();
  if (c.includes("beach") || c.includes("water")) return "beach";
  if (c.includes("hik") || c.includes("mountain")) return "mountain";
  if (c.includes("museum") || c.includes("castle") || c.includes("historic")) return "castle";
  if (c.includes("theme") || c.includes("amusement")) return "sparkle";
  if (c.includes("camp")) return "camping";
  if (c.includes("cruise")) return "cruise";
  if (c.includes("shopping") || c.includes("shop")) return "bag";
  if (c.includes("park")) return "mountain";
  if (c.includes("food") || c.includes("dining") || c.includes("restaurant")) return "food";
  if (c.includes("city") || c.includes("urban")) return "city";
  return "pin";
}

export default Icon;
