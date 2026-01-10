/**
 * Sanitizes user input to prevent prompt injection and other attacks
 */

export function sanitizeString(str, maxLength = 200) {
  if (typeof str !== "string") return "";

  return str
    .replace(/[<>]/g, "") // Remove HTML chars
    .replace(/IGNORE PREVIOUS|IGNORE ALL|SYSTEM:|ASSISTANT:/gi, "") // Remove prompt injection attempts
    .slice(0, maxLength)
    .trim();
}

export function sanitizeArray(arr, maxLength = 20) {
  if (!Array.isArray(arr)) return [];

  return arr
    .slice(0, maxLength)
    .map((item) => sanitizeString(String(item), 100))
    .filter((item) => item.length > 0);
}

export function sanitizeTripData(data) {
  const sanitized = {
    destination: sanitizeString(data.destination, 100),
    startDate: data.startDate, // ISO dates are safe
    endDate: data.endDate,
    activities: sanitizeArray(data.activities),
    children: [],
  };

  if (Array.isArray(data.children)) {
    sanitized.children = data.children.slice(0, 10).map((child) => ({
      age: Math.max(0, Math.min(18, parseInt(child.age) || 0)),
    }));
  }

  return sanitized;
}

export function validateTripData(data) {
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

  const duration = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
  if (duration > 14) {
    errors.push("Trip duration cannot exceed 14 days");
  }

  if (!Array.isArray(data.activities) || data.activities.length === 0) {
    errors.push("At least one activity is required");
  }

  return errors;
}
