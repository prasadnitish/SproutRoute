/**
 * Input sanitization and prompt injection protection.
 *
 * Strips adversarial patterns from user-supplied strings before they reach
 * AI prompts. Never throws — returns cleaned text silently and logs blocked
 * attempts in non-production environments.
 *
 * Security model:
 *   - Destination, activity names, and child ages are the only user inputs
 *     that reach AI prompts. All are sanitized here.
 *   - System prompt text is authored by us and never interpolated from user data.
 *   - User data is always placed in the *user* turn, never in the system turn.
 */

// Prompt injection patterns: phrases that attempt to override model instructions
const INJECTION_PATTERNS = [
  /ignore\s+(previous|prior|all)\s+instructions/gi,
  /disregard\s+(previous|prior|all|the)\s+instructions/gi,
  /you\s+are\s+now\s+/gi,
  /forget\s+everything\s+(above|before)/gi,
  /new\s+instructions?:/gi,
  /\[INST\]/gi,
  /<\|system\|>/gi,
  /<\|user\|>/gi,
  /<\|assistant\|>/gi,
  /<<SYS>>/gi,
  /\[\/INST\]/gi,
  /act\s+as\s+(if\s+you\s+are|a)\s+/gi,
  /pretend\s+(you\s+are|to\s+be)\s+/gi,
  /jailbreak/gi,
  /DAN\s+mode/gi,
  /override\s+(your\s+)?(safety|restrictions|guidelines)/gi,
];

// HTML/script patterns that could cause output injection
const HTML_PATTERNS = [
  /<script[\s\S]*?>[\s\S]*?<\/script>/gi,
  /<[a-zA-Z][^>]*>/g,
  /javascript:/gi,
  /on\w+\s*=/gi, // onclick=, onload=, etc.
];

// SQL injection patterns (defensive — these aren't hitting a DB but protect AI output)
const SQL_PATTERNS = [
  /;\s*(DROP|DELETE|INSERT|UPDATE|ALTER|CREATE|TRUNCATE)\s+/gi,
  /UNION\s+SELECT/gi,
  /--\s*$/gm, // SQL comment at end of line
];

// Max lengths per field type
const MAX_LENGTHS = {
  destination: 200,
  activity: 60,
  general: 500,
};

/**
 * Remove non-printable characters and normalize whitespace.
 * @param {string} text
 * @returns {string}
 */
function removeNonPrintable(text) {
  // Allow standard printable ASCII + common unicode (letters, numbers, punctuation, emoji)
  // Strip control chars except newline/tab
  return text
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "") // control chars except \t, \n
    .replace(/\s+/g, " ") // normalize multiple spaces/newlines to single space
    .trim();
}

/**
 * Detect and log if text contained injection attempts.
 * @param {string} original
 * @param {string} cleaned
 * @param {string} fieldName
 */
function logIfBlocked(original, cleaned, fieldName) {
  if (
    process.env.NODE_ENV !== "production" &&
    original.length !== cleaned.length
  ) {
    console.warn(
      `[inputSafety] Sanitized "${fieldName}": removed ${original.length - cleaned.length} chars`,
    );
  }
}

/**
 * Sanitize a destination string.
 * Allows: letters, numbers, spaces, commas, periods, hyphens, apostrophes, parentheses.
 * @param {string} input
 * @returns {string}
 */
export function sanitizeDestination(input) {
  if (typeof input !== "string") return "";

  let cleaned = input.slice(0, MAX_LENGTHS.destination);
  cleaned = removeNonPrintable(cleaned);

  // Strip injection patterns
  for (const pattern of INJECTION_PATTERNS) {
    cleaned = cleaned.replace(pattern, "");
  }
  for (const pattern of HTML_PATTERNS) {
    cleaned = cleaned.replace(pattern, "");
  }
  for (const pattern of SQL_PATTERNS) {
    cleaned = cleaned.replace(pattern, "");
  }

  // Only allow safe destination characters: letters, digits, spaces, common punctuation
  cleaned = cleaned.replace(/[^a-zA-Z0-9\s,.\-'()&/àáâãäåæçèéêëìíîïðñòóôõöøùúûüýþÿÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖØÙÚÛÜÝÞŸ]/g, "");

  cleaned = cleaned.trim();
  logIfBlocked(input, cleaned, "destination");
  return cleaned;
}

/**
 * Sanitize an activity name string.
 * @param {string} input
 * @returns {string}
 */
export function sanitizeActivity(input) {
  if (typeof input !== "string") return "";

  let cleaned = input.slice(0, MAX_LENGTHS.activity);
  cleaned = removeNonPrintable(cleaned);

  for (const pattern of INJECTION_PATTERNS) {
    cleaned = cleaned.replace(pattern, "");
  }
  for (const pattern of HTML_PATTERNS) {
    cleaned = cleaned.replace(pattern, "");
  }

  // Only allow alphanumeric + basic punctuation for activity names
  cleaned = cleaned.replace(/[^a-zA-Z0-9\s\-']/g, "");
  cleaned = cleaned.trim();

  logIfBlocked(input, cleaned, "activity");
  return cleaned;
}

/**
 * Sanitize an array of activity strings.
 * @param {string[]} activities
 * @returns {string[]}
 */
export function sanitizeActivities(activities) {
  if (!Array.isArray(activities)) return [];
  return activities
    .map((a) => sanitizeActivity(a))
    .filter((a) => a.length > 0)
    .slice(0, 20); // cap at 20 activities max
}

/**
 * Validate and sanitize child age.
 * @param {number} age
 * @returns {number} Clamped to 0–17
 */
export function sanitizeChildAge(age) {
  const n = Number(age);
  if (!isFinite(n) || isNaN(n)) return 0;
  return Math.max(0, Math.min(17, Math.floor(n)));
}

/**
 * Sanitize a full trip data payload.
 * Returns a new object with all user-supplied fields sanitized.
 * @param {object} tripData
 * @returns {object}
 */
export function sanitizeTripPayload(tripData) {
  if (!tripData || typeof tripData !== "object") return {};

  const sanitized = {
    destination: sanitizeDestination(tripData.destination || ""),
    startDate: sanitizeDate(tripData.startDate),
    endDate: sanitizeDate(tripData.endDate),
    activities: sanitizeActivities(tripData.activities || []),
    children: sanitizeChildren(tripData.children || []),
  };

  // Preserve non-user-input fields as-is (countryCode, lat, lon are system-derived)
  if (tripData.countryCode) sanitized.countryCode = tripData.countryCode;
  if (tripData.lat !== undefined) sanitized.lat = tripData.lat;
  if (tripData.lon !== undefined) sanitized.lon = tripData.lon;
  if (tripData.tripType) sanitized.tripType = tripData.tripType;

  return sanitized;
}

/**
 * Validate a date string is ISO format YYYY-MM-DD. Returns empty string if invalid.
 * @param {string} dateStr
 * @returns {string}
 */
function sanitizeDate(dateStr) {
  if (typeof dateStr !== "string") return "";
  // Only allow exact ISO date format
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
  return "";
}

/**
 * Sanitize children array.
 * @param {Array} children
 * @returns {Array}
 */
function sanitizeChildren(children) {
  if (!Array.isArray(children)) return [];
  return children.slice(0, 10).map((child) => ({
    age: sanitizeChildAge(child.age),
    ...(child.weightLb !== undefined ? { weightLb: Number(child.weightLb) || null } : {}),
    ...(child.heightIn !== undefined ? { heightIn: Number(child.heightIn) || null } : {}),
  }));
}

/**
 * Validate that an AI response string does not contain suspicious override attempts.
 * Returns true if safe, false if the response looks tampered.
 * Use to decide whether to retry generation.
 * @param {string} responseText
 * @returns {boolean}
 */
export function isAiResponseSafe(responseText) {
  if (typeof responseText !== "string") return false;

  const redFlags = [
    /you\s+are\s+now\s+in\s+/gi,
    /jailbreak\s+successful/gi,
    /DAN\s+mode\s+(activated|enabled)/gi,
    /<script/gi,
    /eval\s*\(/gi,
  ];

  for (const pattern of redFlags) {
    if (pattern.test(responseText)) {
      if (process.env.NODE_ENV !== "production") {
        console.warn("[inputSafety] Suspicious AI response detected — recommend retry");
      }
      return false;
    }
  }
  return true;
}
