// US State Department Travel Advisories client.
// Fetches from cadataapi.state.gov, caches the full list (TTL 24h), returns per-country advisory.
// Graceful: returns null if API is down — never blocks trip planning.

const STATE_DEPT_API_URL =
  "https://cadataapi.state.gov/api/TravelAdvisories";
const FETCH_TIMEOUT_MS = 10000;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// ISO 3166-1 alpha-2 → FIPS 10-4 mapping for State Dept API.
// The State Dept uses FIPS codes in its Category field, not ISO codes.
// Only includes codes that differ between the two standards.
const ISO_TO_FIPS = {
  AT: "AU", // Austria
  AU: "AS", // Australia
  BG: "BU", // Bulgaria
  CH: "SZ", // Switzerland (ISO CH = State Dept SR, but ISO CH conflicts with China's FIPS)
  CL: "CI", // Chile
  CN: "CH", // China
  CR: "CS", // Costa Rica
  DE: "GM", // Germany
  DK: "DA", // Denmark
  DO: "DR", // Dominican Republic
  EE: "EN", // Estonia
  ES: "SP", // Spain
  GB: "UK", // United Kingdom
  IE: "EI", // Ireland
  IS: "IC", // Iceland
  JP: "JA", // Japan
  KR: "KS", // South Korea
  LT: "LH", // Lithuania
  LV: "LG", // Latvia
  MA: "MO", // Morocco
  PA: "PM", // Panama
  PH: "RP", // Philippines
  PT: "PO", // Portugal
  RO: "RO", // Romania (same in both)
  SE: "SW", // Sweden
  SG: "SN", // Singapore
  SK: "LO", // Slovakia
  TR: "TU", // Turkey (Türkiye)
  VN: "VM", // Vietnam
  ZA: "SF", // South Africa
};

// Known risk keywords the State Dept uses in advisory summaries.
const RISK_KEYWORDS = [
  "terrorism",
  "crime",
  "kidnapping",
  "civil unrest",
  "natural disaster",
];

/** @type {{ data: Array | null, timestamp: number }} */
let advisoryCache = { data: null, timestamp: 0 };

/**
 * Clear the advisory cache. Only works in test environment.
 * Same pattern as geocoding.js __resetGeocodingCachesForTests().
 */
export function __resetAdvisoryCacheForTests() {
  advisoryCache = { data: null, timestamp: 0 };
}

/**
 * Strip HTML tags from a string.
 * @param {string} html - Raw HTML string from the API.
 * @returns {string} Plain text with tags removed.
 */
function stripHtmlTags(html) {
  if (typeof html !== "string") return "";
  return html.replace(/<[^>]*>/g, "").trim();
}

/**
 * Extract risk categories from advisory summary text.
 * Scans for known keywords like terrorism, crime, kidnapping, etc.
 * @param {string} summary - Plain-text (HTML-stripped) summary.
 * @returns {string[]} Array of matched risk keywords.
 */
function extractRiskCategories(summary) {
  if (typeof summary !== "string") return [];
  const lower = summary.toLowerCase();
  return RISK_KEYWORDS.filter((keyword) => lower.includes(keyword));
}

/**
 * Parse the advisory level (1-4) from a State Dept title string.
 * Title format: "Country - Level N: Description"
 * @param {string} title - Advisory title from the API.
 * @returns {number} Level 1-4, or 0 if parsing fails.
 */
export function parseAdvisoryLevel(title) {
  if (typeof title !== "string") return 0;
  const match = title.match(/Level\s+(\d)/i);
  if (!match) return 0;
  const level = parseInt(match[1], 10);
  return level >= 1 && level <= 4 ? level : 0;
}

/**
 * Fetch the full advisory list from the State Department API.
 * Returns cached data if the cache is still valid (within TTL).
 * @returns {Promise<Array|null>} The advisory list or null on failure.
 */
async function fetchAdvisoryList() {
  // Return cached data if within TTL.
  if (
    advisoryCache.data !== null &&
    Date.now() - advisoryCache.timestamp < CACHE_TTL_MS
  ) {
    return advisoryCache.data;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(STATE_DEPT_API_URL, {
      headers: {
        "User-Agent": "SproutRoute/1.0",
        Accept: "application/json",
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();

    if (!Array.isArray(data)) {
      return null;
    }

    // Cache the full list.
    advisoryCache = { data, timestamp: Date.now() };
    return data;
  } catch {
    // Network error, timeout, JSON parse error — all non-fatal.
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Get the travel advisory for a specific country code.
 *
 * @param {string} countryCode - ISO 3166-1 alpha-2 country code (e.g. "MX", "FR").
 * @returns {Promise<{
 *   level: number,
 *   title: string,
 *   summary: string,
 *   riskCategories: string[],
 *   lastUpdated: string,
 *   sourceUrl: string
 * } | null>} Advisory object or null if not applicable/available.
 */
export async function getTravelAdvisory(countryCode) {
  // No advisory needed for domestic US travel or missing input.
  if (!countryCode || countryCode.toUpperCase() === "US") {
    return null;
  }

  const normalizedCode = countryCode.toUpperCase();

  const advisories = await fetchAdvisoryList();
  if (!advisories) {
    return null;
  }

  // The State Dept API uses FIPS 10-4 codes, not ISO 3166-1.
  // Try the FIPS equivalent first, then fall back to the raw ISO code.
  const fipsCode = ISO_TO_FIPS[normalizedCode];
  const codesToTry = fipsCode
    ? [fipsCode, normalizedCode]
    : [normalizedCode];

  // Find the advisory matching any of our candidate codes.
  const entry = advisories.find(
    (advisory) =>
      Array.isArray(advisory.Category) &&
      advisory.Category.some(
        (code) =>
          typeof code === "string" &&
          codesToTry.includes(code.toUpperCase()),
      ),
  );

  if (!entry) {
    return null;
  }

  const plainSummary = stripHtmlTags(entry.Summary || "");

  return {
    level: parseAdvisoryLevel(entry.Title || ""),
    title: entry.Title || "",
    summary: plainSummary,
    riskCategories: extractRiskCategories(plainSummary),
    lastUpdated: entry.Updated || entry.Published || "",
    sourceUrl: entry.Link || "",
  };
}
