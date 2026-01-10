import Anthropic from "@anthropic-ai/sdk";

export async function generatePackingList(tripData, weatherForecast) {
  const { destination, startDate, endDate, activities, children } = tripData;

  const prompt = buildPrompt(
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
      max_tokens: 2048,
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
    });

    const responseText = message.content[0].text;

    // Try to extract JSON from the response
    let packingList;
    try {
      // First try direct parsing
      packingList = JSON.parse(responseText);
    } catch (parseError) {
      // If that fails, try to extract JSON from markdown code blocks
      const jsonMatch =
        responseText.match(/```json\s*([\s\S]*?)\s*```/) ||
        responseText.match(/```\s*([\s\S]*?)\s*```/);

      if (jsonMatch) {
        packingList = JSON.parse(jsonMatch[1]);
      } else {
        // Try to find JSON object in the text
        const jsonStart = responseText.indexOf("{");
        const jsonEnd = responseText.lastIndexOf("}");
        if (jsonStart !== -1 && jsonEnd !== -1) {
          const jsonStr = responseText.substring(jsonStart, jsonEnd + 1);
          packingList = JSON.parse(jsonStr);
        } else {
          console.error("Failed to parse AI response:", parseError);
          console.error("Response preview:", responseText.substring(0, 500));
          throw new Error("AI returned invalid format. Please try again.");
        }
      }
    }

    return packingList;
  } catch (error) {
    console.error("Claude API error:", error);
    if (error.message.includes("invalid format")) {
      throw error;
    }
    throw new Error("Failed to generate packing list: " + error.message);
  }
}

function buildPrompt(
  destination,
  startDate,
  endDate,
  activities,
  children,
  weatherForecast,
) {
  const childrenInfo = children.map((c) => `age ${c.age}`).join(", ");

  return `You are a helpful travel planning assistant for parents. Generate a comprehensive packing list for a family trip.

**Trip Details:**
- Destination: ${destination}
- Dates: ${startDate} to ${endDate}
- Activities: ${activities.join(", ")}
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

Generate a detailed packing list in JSON format with the following structure:

{
  "categories": [
    {
      "name": "Category Name (e.g., Clothing, Toiletries, Gear)",
      "items": [
        {
          "name": "Item name",
          "quantity": "number or range like '2-3'",
          "reason": "Brief explanation (weather-based, activity-based, or child age-based)"
        }
      ]
    }
  ]
}

**Requirements:**
1. Include categories: Clothing, Toiletries, Gear/Equipment, Documents, Medications, Entertainment, Snacks, Baby/Toddler Items (if applicable)
2. Base clothing recommendations on weather forecast (rain gear if >40% rain, layers if cool, sun protection if hot)
3. Include age-appropriate items for children (diapers for toddlers, activities for older kids)
4. Add activity-specific gear (beach toys, hiking boots, etc.)
5. Each item should have a practical quantity and a brief reason
6. Be specific and helpful but concise

Return ONLY the JSON, no additional text.`;
}
