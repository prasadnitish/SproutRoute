const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

/**
 * Fetch with timeout support
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

export const resolveDestination = async (query) => {
  const response = await fetchWithTimeout(
    `${API_BASE_URL}/api/resolve-destination`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
    },
    15000,
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to resolve destination");
  }

  return response.json();
};

export const submitFeedback = async ({ category, message, email }) => {
  const response = await fetchWithTimeout(
    `${API_BASE_URL}/api/feedback`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category, message, email }),
    },
    10000,
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to submit feedback");
  }

  return response.json();
};

export const checkHealth = async () => {
  const response = await fetch(`${API_BASE_URL}/api/health`);
  if (!response.ok) {
    throw new Error("API is not available");
  }
  return response.json();
};
