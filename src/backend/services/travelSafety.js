// AI-powered travel safety tips for any destination worldwide.
// Generates family-focused safety guidance including emergency numbers,
// health advisories, and local customs.

import { callModel } from "../utils/aiClient.js";

const SAFETY_PROMPT = (destination, childrenAges, countryCode) => `You are a travel safety advisor for families with young children.

Destination: ${destination}
Country code: ${countryCode || "unknown"}
Children ages: ${childrenAges?.length ? childrenAges.join(", ") : "none specified"}

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
    });
    return responseText;
  });

  try {
    const raw = await callAI(SAFETY_PROMPT(destination, childrenAges, countryCode));
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : raw);

    return {
      advisoryLevel: parsed.advisoryLevel || "low",
      emergencyNumber: parsed.emergencyNumber || "911",
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
