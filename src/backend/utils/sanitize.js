/**
 * Sanitizes and validates user input before it reaches external APIs.
 * This keeps prompts clean and reduces basic injection risks.
 */

export function sanitizeString(str, maxLength = 200) {
  // Normalizes free-text fields to reduce XSS/prompt-injection risk and keep payloads bounded.
  if (typeof str !== "string") return "";

  return str
    .replace(/[<>]/g, "") // Remove HTML chars
    .replace(/IGNORE PREVIOUS|IGNORE ALL|SYSTEM:|ASSISTANT:/gi, "") // Remove prompt injection attempts
    .slice(0, maxLength)
    .trim();
}

export function sanitizeArray(arr, maxLength = 20) {
  // Applies string sanitization to list inputs such as selected activities.
  if (!Array.isArray(arr)) return [];

  return arr
    .slice(0, maxLength)
    .map((item) => sanitizeString(String(item), 100))
    .filter((item) => item.length > 0);
}

function parseOptionalNumber(value, min, max) {
  // Parses optional numeric profile fields; returns null when absent/unparseable.
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(min, Math.min(max, parsed));
}

export function sanitizeChildren(children, maxLength = 10) {
  // Clamps child profile data to safe ranges; strictly validates age to prevent prompt injection.
  if (!Array.isArray(children)) return [];

  return children.slice(0, maxLength)
    .map((child) => {
      // Validate age is numeric integer (not injection attempt like "5), ignore")
      const ageNum = Number.parseInt(String(child.age), 10);
      if (!Number.isFinite(ageNum)) {
        // Skip children with non-numeric ages to prevent injection
        return null;
      }

      const safeChild = {
        age: Math.max(0, Math.min(18, ageNum)),
      };

      const safeWeightLb = parseOptionalNumber(child.weightLb, 2, 300);
      const safeHeightIn = parseOptionalNumber(child.heightIn, 10, 90);

      if (safeWeightLb !== null) {
        safeChild.weightLb = safeWeightLb;
      }

      if (safeHeightIn !== null) {
        safeChild.heightIn = safeHeightIn;
      }

      return safeChild;
    })
    .filter(child => child !== null);
}

const VALID_PET_TYPES = new Set(["dog", "cat", "bird", "other"]);

export function sanitizePets(pets, maxLength = 5) {
  if (!Array.isArray(pets)) return [];

  return pets.slice(0, maxLength)
    .map((pet) => {
      const type = VALID_PET_TYPES.has(pet?.type) ? pet.type : "dog";
      const safe = { type };

      if (typeof pet.breed === "string" && pet.breed.trim()) {
        safe.breed = sanitizeString(pet.breed, 50);
      }
      if (typeof pet.name === "string" && pet.name.trim()) {
        safe.name = sanitizeString(pet.name, 30);
      }

      const ageMonths = Number.parseInt(String(pet?.ageMonths), 10);
      if (Number.isFinite(ageMonths) && ageMonths >= 0 && ageMonths <= 360) {
        safe.ageMonths = ageMonths;
      }

      const weightLb = Number.parseFloat(String(pet?.weightLb));
      if (Number.isFinite(weightLb) && weightLb > 0 && weightLb <= 300) {
        safe.weightLb = weightLb;
      }

      return safe;
    });
}

export function sanitizeTripData(data) {
  // Canonical payload sanitizer for trip-related endpoints.
  const safeData = data || {};

  const sanitized = {
    destination: sanitizeString(safeData.destination, 100),
    startDate: sanitizeString(String(safeData.startDate ?? ""), 30),
    endDate: sanitizeString(String(safeData.endDate ?? ""), 30),
    activities: sanitizeArray(safeData.activities),
    children: [],
  };

  // Accept children as objects [{age:3}] or flat childrenAges [3, 7]
  if (Array.isArray(safeData.children) && safeData.children.length > 0) {
    sanitized.children = sanitizeChildren(safeData.children);
  } else if (Array.isArray(safeData.childrenAges) && safeData.childrenAges.length > 0) {
    sanitized.children = sanitizeChildren(
      safeData.childrenAges.map(age => ({ age }))
    );
  }

  sanitized.pets = sanitizePets(safeData.pets);

  return sanitized;
}

// Validate required fields and basic constraints (e.g., date ranges).
export function validateTripData(data, options = {}) {
  // Enforces minimal product constraints before expensive external API calls.
  const { requireActivities = true } = options;
  const errors = [];

  if (!data.destination || data.destination.length === 0) {
    errors.push("Destination is required");
  }

  if (!data.startDate || !data.endDate) {
    errors.push("Start and end dates are required");
  }

  const start = new Date(data.startDate);
  const end = new Date(data.endDate);

  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    errors.push("Invalid date format");
  }

  if (start >= end) {
    errors.push("End date must be after start date");
  }

  // Validate dates are not in the past
  const now = new Date();
  now.setHours(0, 0, 0, 0); // Compare dates only, not time
  if (!isNaN(start.getTime()) && start < now) {
    errors.push("Start date cannot be in the past");
  }

  // Prevent abusive requests for trips far in future (> 2 years)
  const maxFutureDate = new Date();
  maxFutureDate.setFullYear(maxFutureDate.getFullYear() + 2);
  if (!isNaN(end.getTime()) && end > maxFutureDate) {
    errors.push("End date cannot be more than 2 years in the future");
  }

  const duration = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
  if (duration > 14) {
    errors.push("Trip duration cannot exceed 14 days");
  }

  if (
    requireActivities &&
    (!Array.isArray(data.activities) || data.activities.length === 0)
  ) {
    errors.push("At least one activity is required");
  }

  return errors;
}
