// Frontend API client:
// - Centralizes backend calls so UI components stay focused on state/rendering.
// - Normalizes timeout/network errors into user-friendly messages.
// - Keeps request/response contracts in one place.

// Base URL for the backend API.
// In production (Option A: Express serves frontend), use relative URLs so the
// frontend hits the same origin as the page — no CORS, no env var needed.
// In local dev, fall back to the Vite proxy target.
const API_BASE_URL = import.meta.env.VITE_API_URL || (import.meta.env.PROD ? "" : "http://localhost:3000");

/**
 * Fetch helper with timeout support so the UI doesn't hang forever.
 */
async function fetchWithTimeout(url, options = {}, timeout = 30000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(id);
    return response;
  } catch (error) {
    clearTimeout(id);
    if (error.name === "AbortError") {
      throw new Error(
        "Request timeout - the server is taking too long. Please try again.",
      );
    }
    if (error.message.includes("Failed to fetch")) {
      throw new Error(
        "Network error - please check your connection and try again.",
      );
    }
    throw error;
  }
}

// Generate the trip itinerary.
export const generateTripPlan = async (tripData) => {
  const response = await fetchWithTimeout(
    `${API_BASE_URL}/api/trip-plan`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(tripData),
    },
    30000, // 30 second timeout
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to generate trip plan");
  }

  return response.json();
};

// Generate the packing list (uses selected activities).
export const generatePackingList = async (tripData) => {
  const response = await fetchWithTimeout(
    `${API_BASE_URL}/api/generate`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(tripData),
    },
    30000, // 30 second timeout
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to generate packing list");
  }

  return response.json();
};

// Resolve natural-language destination queries into suggestions.
export const resolveDestination = async (query) => {
  const response = await fetchWithTimeout(
    `${API_BASE_URL}/api/resolve-destination`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query }),
    },
    20000,
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to resolve destination");
  }

  return response.json();
};

// Health check for the backend.
export const checkHealth = async () => {
  const response = await fetchWithTimeout(`${API_BASE_URL}/api/health`, {}, 5000);
  if (!response.ok) {
    throw new Error("API is not available");
  }
  return response.json();
};

// Evaluate car seat and booster guidance by jurisdiction.
export const getCarSeatGuidance = async (payload) => {
  const response = await fetchWithTimeout(
    `${API_BASE_URL}/api/safety/car-seat-check`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
    20000,
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to evaluate car seat guidance");
  }

  return response.json();
};
