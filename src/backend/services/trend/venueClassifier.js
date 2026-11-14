/**
 * Claude calls for the trend job. Both take public post captions that are held in memory only.
 *   classifyVenues: is this a place a family could visit, and what is its proper name?
 *   extractVenues:  which attraction, if any, does each caption talk about?
 * A reply that cannot be parsed throws, so the job skips the city for the week instead of trusting a guess.
 */
import { callModel } from "../../utils/aiClient.js";

export const TREND_MODEL = process.env.TREND_CLASSIFIER_MODEL || "claude-haiku-5-5";

const CLASSIFY_SYSTEM = `You help a family travel app decide which places people are posting about are worth recommending.
For each place you get its name and a few captions from public posts. Reply with a JSON array and nothing else, one object per place:
{"key": the key you were given, "familyVisitable": boolean, "name": the proper name of the place, "reason": short}
familyVisitable is true only for a real public place or attraction a family with children could visit: parks, museums, zoos, aquariums, markets, landmarks, viewpoints, beaches, family-friendly venues.
Set it to false for businesses promoting themselves or a product, giveaways, real estate, adult-only venues (bars, nightclubs, casinos), private homes or events, personal accounts, and anything that is not a place.
Use the proper, commonly known name of the place, not a hashtag or a post caption.`;

const EXTRACT_SYSTEM = `You read short public social media captions from one city and name the attraction each one is about.
Reply with a JSON array and nothing else, one object per caption: {"id": the id you were given, "venue": the proper name of the attraction, or null}.
Use null when the caption names no specific public place a visitor could go to, or when it is an ad, giveaway or real estate post.`;

function parseArray(text) {
  const trimmed = String(text || "").trim();
  try {
    const value = JSON.parse(trimmed);
    if (Array.isArray(value)) return value;
  } catch { /* fall through to bracket search */ }
  const start = trimmed.indexOf("[");
  const end = trimmed.lastIndexOf("]");
  if (start === -1 || end <= start) throw new Error("reply had no JSON array");
  const value = JSON.parse(trimmed.slice(start, end + 1));
  if (!Array.isArray(value)) throw new Error("reply was not an array");
  return value;
}

const clip = (text, n = 160) => String(text || "").replace(/\s+/g, " ").slice(0, n);

export function createVenueClassifier({ callModelFn = callModel, model = TREND_MODEL } = {}) {
  async function ask(system, payload, caller) {
    const response = await callModelFn({ system, user: JSON.stringify(payload), provider: "anthropic", model, effort: "low", maxTokens: 4000, caller });
    return parseArray(response.responseText);
  }

  return {
    /** @returns {Promise<Map<string, {familyVisitable: boolean, name: string}>>} a venue the reply omits is not family visitable */
    async classifyVenues({ city, venues }) {
      const result = new Map(venues.map((venue) => [venue.key, { familyVisitable: false, name: venue.name }]));
      if (!venues.length) return result;
      const reply = await ask(CLASSIFY_SYSTEM, {
        city,
        places: venues.map((v) => ({ key: v.key, name: v.name, captions: v.captions.slice(0, 3).map((c) => clip(c)) })),
      }, "trendClassify");
      for (const item of reply) {
        if (!result.has(item?.key) || typeof item.familyVisitable !== "boolean") continue;
        const name = typeof item.name === "string" && item.name.trim() ? item.name.trim() : result.get(item.key).name;
        result.set(item.key, { familyVisitable: item.familyVisitable, name });
      }
      return result;
    },

    /** @returns {Promise<Array<{id: string, venue: string | null}>>} */
    async extractVenues({ city, captions }) {
      if (!captions.length) return [];
      const reply = await ask(EXTRACT_SYSTEM, { city, captions: captions.map((c) => ({ id: c.id, text: clip(c.text, 240) })) }, "trendExtract");
      const known = new Set(captions.map((c) => c.id));
      return reply
        .filter((item) => known.has(item?.id))
        .map((item) => ({ id: item.id, venue: typeof item.venue === "string" && item.venue.trim() ? item.venue.trim() : null }));
    },
  };
}
