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
  "claude-haiku-4-5": { in: 1, out: 5, read: 0.1, write: 1.25 },
  "claude-haiku-5-5": { in: 0.1, out: 0.5, read: 0.01, write: 0.125 }, // prompts up to 100K tokens
  "claude-sonnet-5-5": { in: 2, out: 10, read: 0.1, write: 2.5 },
  "claude-sonnet-4-6": { in: 3, out: 15, read: 0.3, write: 3.75 },
  "gpt-6-luna": { in: 0.1, out: 0.5 },
  "gpt-6.1-terra": { in: 1, out: 5, read: 0.05, write: 1.25 }, // developers.openai.com/api/docs/models, 2026-11-08
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

/** Counts are disjoint: inputTokens here is the uncached, non-write portion. */
export function estimateCostUsd(model, { inputTokens, outputTokens, cacheReadTokens = 0, cacheWriteTokens = 0 } = {}, env = process.env) {
  const id = normalizeModelId(model);
  const override = overrides(env)[id];
  const price = override || PRICES[id];
  if (!price || ![inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens].every(n => Number.isSafeInteger(n) && n >= 0)) return null;
  const inputTotal = inputTokens + cacheReadTokens + cacheWriteTokens;
  let inputFactor = 1, outputFactor = 1;
  if (!override && id === "gpt-6.1-terra" && inputTotal > 272000) {
    inputFactor = 2;
    outputFactor = 1.5;
  } else if (!override && id === "claude-haiku-5-5" && inputTotal > 100000) {
    inputFactor = outputFactor = 5;
  }
  const rateValid = n => Number.isFinite(n) && n >= 0;
  if (!rateValid(price.in) || !rateValid(price.out) ||
      (cacheReadTokens && !rateValid(price.read)) || (cacheWriteTokens && !rateValid(price.write))) return null;
  const inputCost = inputTokens * price.in + cacheReadTokens * (price.read ?? 0) + cacheWriteTokens * (price.write ?? 0);
  return Math.round(inputCost * inputFactor + outputTokens * price.out * outputFactor) / 1e6;
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
