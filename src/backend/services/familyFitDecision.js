/**
 * Family-fit judgment from a decision model instead of a text model.
 *
 * The same 15 typed questions go to either TypeSafe Jev (POST /v1/systemone) or OpenAI's Decisions API
 * (POST /v1/decisions, gpt-6-luna) in one request. Neither writes text: each returns probabilities, a chosen
 * option or a score, which code turns into the fit object attractionFit.js has always stored.
 * The two flags that remove places from plans (adults-only, fine dining) escalate to the Haiku call
 * when the model is unsure, so a borderline venue never gets a guessed flag.
 */
import { evalCapture } from "./evalCapture.js";

export const ENGINES = {
  jev: {
    url: "https://api.typesafe.ai/v1/systemone",
    model: process.env.JEV_MODEL || "jev-latest",
    keyEnv: "TYPESAFE_API_KEY",
    usdPerMillionInput: 0.042, // docs.typesafe.ai/models, Nov 8 2026; output is free
  },
  openai: {
    url: "https://api.openai.com/v1/decisions",
    model: process.env.OPENAI_DECISIONS_MODEL || "gpt-6-luna",
    keyEnv: "OPENAI_API_KEY",
    usdPerMillionInput: 0.1, // developers.openai.com/api/docs/pricing, Nov 8 2026; output is free
  },
};

/** Probabilities between these bounds on a filtering flag send the place to the Haiku call. */
export const ESCALATE_BELOW = 0.2;
export const ESCALATE_ABOVE = 0.8;

const AGE_BANDS = [
  ["infant", "an infant (under 1)"],
  ["toddler", "a toddler (1 to 3)"],
  ["preschool", "a preschooler (3 to 5)"],
  ["elementary", "a grade-school child (6 to 10)"],
  ["tween", "a tween (10 to 12)"],
  ["teen", "a teenager (13 to 17)"],
];

const CATEGORIES = {
  museum: "A museum, gallery or science centre",
  zoo_aquarium: "A zoo, aquarium, wildlife park or farm",
  park_playground: "A park, garden or playground",
  beach_water: "A beach, pool, lake or water park",
  nature_trail: "A nature reserve, trail, national park or viewpoint in nature",
  theme_park: "A theme park or amusement park",
  landmark: "A landmark, monument, historic site or viewpoint in a city",
  market_shopping: "A market, shopping street or mall",
  show_entertainment: "A show, theatre, cinema, arcade or indoor entertainment venue",
  restaurant: "A restaurant, cafe or bar",
  tour_activity: "A tour, class or guided activity",
  other: "None of the above",
};

const DURATIONS = {
  under_1h: ["Under an hour", 45],
  "1_2h": ["One to two hours", 90],
  "2_4h": ["Two to four hours", 180],
  half_day: ["About half a day", 300],
  full_day: ["A full day", 480],
};

const APPEAL_LEVELS = (who) => [
  `Nothing here for ${who}; they would be bored or it is unsuitable.`,
  `A little for ${who}, as a short stop on the way to something else.`,
  `Pleasant for ${who}, a solid hour or two.`,
  `A highlight of the day for ${who}.`,
  `One of the best things to do in the city for ${who}.`,
];

/** One list of questions; each engine's request is built from it, so both are asked exactly the same thing. */
export const FIT_QUESTIONS = [
  {
    name: "adults_only",
    type: "noul",
    instructions: "Is this place for adults only by its nature, such as a bar, nightclub, pub crawl, casino, strip club, cannabis shop or a venue that does not admit minors?",
    criteria: { true: "Adults only, or unsuitable for children by its nature", false: "Children can go, even if it is mainly for adults" },
  },
  {
    name: "fine_dining",
    type: "noul",
    instructions: "Is this a formal fine-dining restaurant, such as a tasting-menu or white-tablecloth restaurant where young children would be out of place?",
    criteria: { true: "Formal fine dining", false: "Not a restaurant, or a casual or family restaurant" },
  },
  ...AGE_BANDS.map(([band, who]) => ({
    name: `age_${band}`,
    type: "noul",
    instructions: `Would ${who} enjoy this place and be able to take part on a family visit?`,
    criteria: { true: "Yes, a good fit for that age", false: "No, too young, too old or unsuitable" },
  })),
  {
    name: "stroller_friendly",
    type: "noul",
    instructions: "Can a family push a stroller around most of this place without carrying it?",
  },
  {
    name: "booking_needed",
    type: "noul",
    instructions: "Do families usually need to book tickets or a table in advance to be sure of getting in?",
  },
  { name: "kid_appeal", type: "score", instructions: "How much would children enjoy this place?", criteria: APPEAL_LEVELS("children") },
  { name: "parent_appeal", type: "score", instructions: "How much would the parents enjoy this place?", criteria: APPEAL_LEVELS("parents") },
  {
    name: "indoor_outdoor",
    type: "choice",
    instructions: "Is a visit here mostly indoors, mostly outdoors, or both?",
    criteria: { indoor: "Mostly indoors", outdoor: "Mostly outdoors", both: "A real mix of both" },
  },
  { name: "category", type: "choice", instructions: "What kind of place is this?", criteria: CATEGORIES },
  {
    name: "duration",
    type: "choice",
    instructions: "How long does a typical family visit last?",
    criteria: Object.fromEntries(Object.entries(DURATIONS).map(([k, [label]]) => [k, label])),
  },
];

function placeState(place) {
  return {
    name: place.name,
    city: place.city,
    ...(place.primaryType && { mainType: place.primaryType }),
    ...(place.types?.length && { googleTypes: place.types }),
    ...(Number.isFinite(place.priceLevel) && { priceLevel0to4: place.priceLevel }),
  };
}

export function toJevRequest(place, { model = ENGINES.jev.model } = {}) {
  return {
    model,
    state: placeState(place),
    questions: Object.fromEntries(
      FIT_QUESTIONS.map((q) => [q.name, { type: q.type, instructions: q.instructions, ...(q.criteria && { criteria: q.criteria }) }]),
    ),
  };
}

export function toOpenAIRequest(place, { model = ENGINES.openai.model } = {}) {
  return {
    model,
    input: `Facts about one place from Google Maps:\n${JSON.stringify(placeState(place))}`,
    questions: FIT_QUESTIONS.map((q) => {
      if (q.type === "noul") return { type: "predicate", name: q.name, instructions: q.instructions };
      if (q.type === "choice") {
        return { type: "choice", name: q.name, instructions: q.instructions, choices: Object.entries(q.criteria).map(([value, description]) => ({ value, description })) };
      }
      return { type: "score", name: q.name, instructions: q.instructions, levels: q.criteria.map((description, i) => ({ label: String(i), description })) };
    }),
  };
}

function normalize(type, raw) {
  if (type === "noul" || type === "predicate") return { noul: raw.noul ?? raw.probability };
  if (type === "choice") return { choice: raw.choice, confidence: raw.confidence };
  return { score: raw.score, confidence: raw.confidence };
}

export function fromJevResponse(body) {
  const answers = Object.fromEntries(Object.entries(body.answers || {}).map(([name, a]) => [name, normalize(a.type, a)]));
  return { answers, inputTokens: body.usage?.input_tokens ?? null, model: body.model };
}

export function fromOpenAIResponse(body) {
  const refused = (body.answers || []).filter((a) => a.type === "refusal").map((a) => a.name);
  const answers = Object.fromEntries((body.answers || []).filter((a) => a.type !== "refusal").map((a) => [a.name, normalize(a.type, a)]));
  return { answers, inputTokens: body.usage?.input_tokens ?? null, model: body.model, refused };
}

const p = (answers, name) => Number(answers[name]?.noul ?? 0);
const appeal = (answers, name) => Math.min(10, Math.max(1, Math.round(1 + (Number(answers[name]?.score ?? 0) * 9) / 4)));

/** The fit object attractionFit.js stores. A decision model writes no text, so `reason` is empty. */
export function answersToFit(answers) {
  const adultsOnly = p(answers, "adults_only") >= 0.5;
  const duration = DURATIONS[answers.duration?.choice] || DURATIONS["1_2h"];
  return {
    kidAppeal: appeal(answers, "kid_appeal"),
    parentAppeal: appeal(answers, "parent_appeal"),
    ageBands: AGE_BANDS.map(([band]) => band).filter((band) => p(answers, `age_${band}`) >= 0.5),
    indoorOutdoor: ["indoor", "outdoor", "both"].includes(answers.indoor_outdoor?.choice) ? answers.indoor_outdoor.choice : "both",
    strollerFriendly: p(answers, "stroller_friendly") >= 0.5,
    typicalDurationMinutes: duration[1],
    category: CATEGORIES[answers.category?.choice] ? answers.category.choice : "other",
    fineDining: p(answers, "fine_dining") >= 0.5,
    adultsOnly,
    bookingLikelyNeeded: p(answers, "booking_needed") >= 0.5,
    reason: "",
  };
}

export function needsEscalation(answers) {
  return ["adults_only", "fine_dining"].some((name) => {
    const prob = answers[name]?.noul;
    return !Number.isFinite(prob) || (prob > ESCALATE_BELOW && prob < ESCALATE_ABOVE);
  });
}

/**
 * @returns {Promise<{ok: true, engine, model, answers, fit, escalate, ms, inputTokens, costUsd} | {ok: false, engine, error, ms}>}
 */
export async function decideFamilyFit(place, { engine = "jev", fetchFn = fetch, apiKey, timeoutMs = 8000 } = {}) {
  const config = ENGINES[engine];
  if (!config) return { ok: false, engine, error: `unknown engine ${engine}`, ms: 0 };
  const key = apiKey ?? process.env[config.keyEnv];
  if (!key) return { ok: false, engine, error: `${config.keyEnv} is not set`, ms: 0 };
  const body = engine === "jev" ? toJevRequest(place) : toOpenAIRequest(place);

  return evalCapture.observe(`decide.family-fit.${engine}`, { asType: "tool", input: { place: place.name, model: config.model } }, async () => {
    const started = performance.now();
    try {
      const res = await fetchFn(config.url, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) {
        const detail = (await res.text().catch(() => "")).slice(0, 200);
        return { ok: false, engine, error: `HTTP ${res.status} ${detail}`.trim(), ms: Math.round(performance.now() - started) };
      }
      const parsed = (engine === "jev" ? fromJevResponse : fromOpenAIResponse)(await res.json());
      const ms = Math.round(performance.now() - started);
      const missing = FIT_QUESTIONS.map((q) => q.name).filter((n) => !parsed.answers[n]);
      if (missing.length) return { ok: false, engine, error: `no answer for ${missing.join(", ")}`, ms };
      return {
        ok: true,
        engine,
        model: parsed.model || config.model,
        answers: parsed.answers,
        fit: answersToFit(parsed.answers),
        escalate: needsEscalation(parsed.answers),
        ms,
        inputTokens: parsed.inputTokens,
        costUsd: Number.isFinite(parsed.inputTokens) ? (parsed.inputTokens * config.usdPerMillionInput) / 1e6 : null,
      };
    } catch (error) {
      return { ok: false, engine, error: error.message, ms: Math.round(performance.now() - started) };
    }
  });
}
