import Anthropic from "@anthropic-ai/sdk";

export async function generateTripPlan(tripData, weatherForecast) {
  const { destination, startDate, endDate, activities, children } = tripData;

  const prompt = buildTripPlanPrompt(
    destination,
    startDate,
    endDate,
    activities,
    children,
    weatherForecast,
  );

  try {
    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    const message = await anthropic.messages.create({
      model: "claude-3-haiku-20240307",
      max_tokens: 3072,
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
    });

    const responseText = message.content[0].text;

    // Try to extract JSON from the response
    let tripPlan;
    try {
      // First try direct parsing
      tripPlan = JSON.parse(responseText);
    } catch (parseError) {
      // If that fails, try to extract JSON from markdown code blocks
      const jsonMatch =
        responseText.match(/```json\s*([\s\S]*?)\s*```/) ||
        responseText.match(/```\s*([\s\S]*?)\s*```/);

      if (jsonMatch) {
        tripPlan = JSON.parse(jsonMatch[1]);
      } else {
        // Try to find JSON object in the text
        const jsonStart = responseText.indexOf("{");
        const jsonEnd = responseText.lastIndexOf("}");
        if (jsonStart !== -1 && jsonEnd !== -1) {
          const jsonStr = responseText.substring(jsonStart, jsonEnd + 1);
          tripPlan = JSON.parse(jsonStr);
        } else {
          console.error("Failed to parse AI response:", parseError);
          console.error("Response preview:", responseText.substring(0, 500));
          throw new Error("AI returned invalid format. Please try again.");
        }
      }
    }

    return tripPlan;
  } catch (error) {
    console.error("Claude API error (trip plan):", error);
    if (error.message.includes("invalid format")) {
      throw error;
    }
    throw new Error("Failed to generate trip plan: " + error.message);
  }
}

function buildTripPlanPrompt(
  destination,
  startDate,
  endDate,
  activities,
  children,
  weatherForecast,
) {
  const childrenInfo =
    children.length > 0
      ? children.map((c) => `age ${c.age}`).join(", ")
      : "no children";

  return `You are a helpful travel planning assistant specializing in family trips. Generate a detailed trip itinerary.

**Trip Details:**
- Destination: ${destination}
- Dates: ${startDate} to ${endDate}
- Interested Activities: ${activities.join(", ")}
- Children: ${children.length} child(ren) - ${childrenInfo}

**Weather Forecast:**
${weatherForecast.summary}

${weatherForecast.forecast
  .slice(0, 7)
  .map(
    (f) =>
      `${f.name}: ${f.high}°F, ${f.condition}, ${f.precipitation}% rain chance`,
  )
  .join("\n")}

Generate a trip plan in JSON format with the following structure:

{
  "overview": "Brief 2-3 sentence overview of the trip",
  "suggestedActivities": [
    {
      "id": "unique-id",
      "name": "Activity Name",
      "category": "one of: beach, hiking, city, museums, parks, dining, shopping, sports, water, wildlife, theme_park, camping",
      "description": "Brief description of the activity (1-2 sentences)",
      "duration": "Estimated duration (e.g., '2-3 hours', 'half day', 'full day')",
      "kidFriendly": true/false,
      "weatherDependent": true/false,
      "bestDays": ["Day names from forecast when this activity is recommended"],
      "reason": "Why this activity is recommended (weather, season, family-friendly, etc.)"
    }
  ],
  "dailyItinerary": [
    {
      "day": "Day 1 (date)",
      "activities": ["activity-id-1", "activity-id-2"],
      "meals": "Meal suggestions",
      "notes": "Any special notes (weather warnings, booking recommendations, etc.)"
    }
  ],
  "tips": [
    "Helpful tips for the trip (booking advice, timing, local insights)"
  ]
}

**Requirements:**
1. Suggest 8-12 activities total based on their interests
2. Include a mix of indoor and outdoor activities based on weather
3. Consider children's ages when recommending activities
4. Prioritize activities that match their stated interests
5. Include weather-appropriate suggestions (rainy day alternatives, sun protection needs)
6. Be specific to the destination (not generic advice)
7. Create a balanced daily itinerary that's not too packed

Return ONLY the JSON, no additional text.`;
}
