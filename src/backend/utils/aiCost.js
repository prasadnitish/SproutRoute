/**
 * Token prices ($ per 1M tokens) and failure classification for AI calls.
 *
 * Prices are estimates for visibility, not billing. A model with no price here gets a
 * null cost instead of a guess; set AI_PRICE_OVERRIDES='{"model":{"in":0.2,"out":1.25}}'
 * to price it without a deploy.
 *   gemini-3.8-flash, gemini-3.6-flash: checked against the 2026-10-23 Google billing export.
 *   gemini-2.5-flash, claude-sonnet-4-6: carried over from the earlier dashboard constants.
 *   claude-haiku-4-5: Anthropic's published rate. gpt-6-luna: OpenRouter catalog, 2026-09-25.
 */
const PRICES = {
  "gemini-3.8-flash": { in: 0.75, out: 3.75 },
  "gemini-3.6-flash": { in: 0.75, out: 3.75 },
  "gemini-2.5-flash": { in: 0.3, out: 2.5 },
  "claude-haiku-4-5": { in: 1, out: 5 },
  "claude-sonnet-4-6": { in: 3, out: 15 },
  "gpt-6-luna": { in: 0.1, out: 0.5 },
};

export function normalizeModelId(model) {
  return String(model || "")
    .toLowerCase()
    .replace(/^.*\//, "")
    .replace(/-\d{8}$/, "");
}

function overrides(env) {
  try {
    const parsed = JSON.parse(env.AI_PRICE_OVERRIDES || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function priceFor(model, env) {
  const id = normalizeModelId(model);
  return overrides(env)[id] || PRICES[id] || null;
}

/** Estimated dollars for one call, or null when the model is unpriced or the provider sent no token counts. */
export function estimateCostUsd(model, { inputTokens, outputTokens } = {}, env = process.env) {
  const price = priceFor(model, env);
  if (!price || !Number.isFinite(inputTokens) || !Number.isFinite(outputTokens)) return null;
  const cost = (inputTokens * price.in + outputTokens * price.out) / 1e6;
  return Math.round(cost * 1e6) / 1e6;
}

const CREDITS = /credits? (?:are |is )?(?:depleted|exhausted)|prepayment|insufficient[_ ]quota|credit balance is too low|exceeded your current quota|billing/i;
const AUTH = /incorrect api key|invalid api key|invalid x-api-key|api key not valid|authentication[_ ]error/i;

/** "credits" for an empty balance, "auth" for a rejected key, null for anything else. */
export function classifyProviderFailure(error) {
  if (!error) return null;
  const message = String(error.message || error);
  const embedded = message.match(/(?:^|\[)(40[0-3]|429)\b/);
  const status = Number(error.status ?? error.statusCode ?? embedded?.[1]);
  if (status === 402 || CREDITS.test(message) || /insufficient_quota/.test(String(error.code || ""))) return "credits";
  if (status === 401 || AUTH.test(message)) return "auth";
  return null;
}
