// AI-powered travel safety tips for any destination worldwide.
// Generates family-focused safety guidance including emergency numbers,
// health advisories, and local customs.

import { callModel } from "../utils/aiClient.js";

const SAFETY_PROMPT = (destination, childrenAges, countryCode, tripContext = {}) => `You are a travel safety advisor.

Destination: ${destination}
Country code: ${countryCode || "unknown"}
Travelers: ${childrenAges?.length ? `Children ages ${childrenAges.join(", ")}` : "Adults-only trip"}
Travel dates: ${tripContext.startDate || "not specified"} to ${tripContext.endDate || "not specified"}
Tailor seasonal tips to these dates and the destination hemisphere. Do not give summer tips for a winter trip. Do not add child-specific tips to adults-only trips.

Return ONLY valid JSON with these fields:
{
  "advisoryLevel": "low" | "medium" | "high",
  "emergencyNumber": "local emergency number (e.g. 911, 112, 999)",
  "healthTips": ["tip1", "tip2", "tip3"],
  "familyTips": ["tip1", "tip2"],
  "localCustoms": ["custom1", "custom2"],
  "waterSafety": "Safe to drink tap water" | "Drink bottled water only" | "Varies by area",
  "vaccinations": "None required" | "description of recommended vaccines",
  "carSeatLaw": "Brief car seat law summary for this location, especially for the children's ages"
}

Focus on PRACTICAL, FAMILY-SPECIFIC safety tips. Be concise (1 sentence each).
For US domestic destinations, focus on local hazards (wildlife, weather, altitude) rather than generic tips.
For international, include visa/entry tips and health precautions.`;

export async function getTravelSafety(destination, childrenAges, countryCode, deps = {}) {
  const callAI = deps.callAI || (async (prompt) => {
    const { responseText } = await callModel({
      system: "You are a travel safety advisor. Return ONLY valid JSON.",
      user: prompt,
      maxTokens: 1024,
      caller: "travelSafety",
    });
    return responseText;
  });

  try {
    const raw = await callAI(SAFETY_PROMPT(destination, childrenAges, countryCode, deps.tripContext));
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : raw);

    return {
      advisoryLevel: ["low", "medium", "high"].includes(parsed.advisoryLevel) ? parsed.advisoryLevel : null,
      emergencyNumber: typeof parsed.emergencyNumber === "string" ? parsed.emergencyNumber : null,
      healthTips: parsed.healthTips || [],
      familyTips: parsed.familyTips || [],
      localCustoms: parsed.localCustoms || [],
      waterSafety: parsed.waterSafety || null,
      vaccinations: parsed.vaccinations || null,
      carSeatLaw: parsed.carSeatLaw || null,
      source: "ai-generated",
    };
  } catch {
    return {
      advisoryLevel: null,
      emergencyNumber: countryCode === "US" ? "911" : null,
      healthTips: [],
      familyTips: [],
      localCustoms: [],
      waterSafety: null,
      vaccinations: null,
      carSeatLaw: null,
      source: "fallback",
    };
  }
}
