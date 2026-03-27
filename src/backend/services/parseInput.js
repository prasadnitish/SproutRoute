// src/backend/services/parseInput.js
import { callModel } from "../utils/aiClient.js";

const PARSE_PROMPT = (userText, region) => `You are a trip planner assistant. Parse this trip request into structured JSON.

User input: "${userText}"
${region ? `User is located near: ${region}` : ""}
Current date: ${new Date().toISOString().split("T")[0]}

Return ONLY valid JSON with these fields:
{
  "destination": "City, State/Country" or null if ambiguous/missing,
  "suggestedDestinations": [] or if destination is null, array of 3 suggestions: [{"name":"City, State","emoji":"🌴","description":"One line","season_note":"Weather note"}],
  "startDate": "YYYY-MM-DD" or null (guess from context like "spring break" → mid-April),
  "endDate": "YYYY-MM-DD" or null,
  "adults": number (default 2),
  "childrenAges": [numbers] or [],
  "vibe": one of "beach","adventure","theme_parks","international","cruise","camping","city","relaxing","general"
}

If the user mentions "spring break" and no dates, use April 12-19 of the current year.
If no kids mentioned, childrenAges should be [].
If destination is vague ("beach trip", "somewhere warm"), set destination to null and provide 3 suggestedDestinations based on the user's location and season.`;

export async function parseInput(text, deps = {}) {
  const callAI = deps.callAI || (async (prompt) => {
    const result = await callModel(prompt);
    return result;
  });
  const detectedRegion = deps.detectedRegion || null;

  const prompt = PARSE_PROMPT(text, detectedRegion);
  const raw = await callAI(prompt);

  let parsed;
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    parsed = JSON.parse(jsonMatch ? jsonMatch[0] : raw);
  } catch {
    return {
      destination: null,
      suggestedDestinations: [],
      startDate: null,
      endDate: null,
      adults: 2,
      childrenAges: [],
      vibe: "general",
      detectedRegion,
    };
  }

  return {
    destination: parsed.destination || null,
    suggestedDestinations: parsed.suggestedDestinations || [],
    startDate: parsed.startDate || null,
    endDate: parsed.endDate || null,
    adults: parsed.adults || 2,
    childrenAges: Array.isArray(parsed.childrenAges) ? parsed.childrenAges : [],
    vibe: parsed.vibe || "general",
    detectedRegion,
  };
}
