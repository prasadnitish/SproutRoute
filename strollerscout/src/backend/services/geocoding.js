export async function geocodeLocation(locationString) {
  try {
    const encodedLocation = encodeURIComponent(locationString);
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodedLocation}&format=json&limit=1&countrycodes=us`,
      {
        headers: {
          "User-Agent": "StrollerScout/1.0",
        },
      },
    );

    if (!response.ok) {
      throw new Error("Geocoding service unavailable");
    }

    const data = await response.json();

    if (!data || data.length === 0) {
      throw new Error("Location not found. Please enter a US city.");
    }

    const result = data[0];

    return {
      lat: parseFloat(result.lat),
      lon: parseFloat(result.lon),
      displayName: result.display_name,
    };
  } catch (error) {
    console.error("Geocoding error:", error);
    throw new Error("Failed to geocode location: " + error.message);
  }
}
