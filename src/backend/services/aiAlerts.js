/**
 * Spend and provider-failure alerts.
 *
 * Two things went unnoticed on 2026-10-23 to 27: a $19 one-day Gemini spend that emptied the prepaid
 * balance, then a depleted balance (402) and a rejected OpenAI key (401). This keeps a running daily
 * total and flags provider failures that need a human, once each, so a webhook is not flooded.
 *
 * Env: AI_DAILY_SPEND_ALERT_USD (default 5), AI_ALERT_WEBHOOK_URL (optional, any URL that accepts a
 * JSON POST with "text" and "content", which covers Slack and Discord). Alerts are always logged.
 */
import { log } from "../utils/logger.js";

const FAILURE_COOLDOWN_MS = 6 * 3600 * 1000;
const MAX_RECENT = 20;
const dayKey = (ms) => new Date(ms).toISOString().slice(0, 10);

export function createAiAlerts({
  webhookUrl = process.env.AI_ALERT_WEBHOOK_URL || "",
  dailyLimitUsd = Number(process.env.AI_DAILY_SPEND_ALERT_USD) || 5,
  fetchFn = globalThis.fetch,
  now = Date.now,
  logger = log,
} = {}) {
  let day = dayKey(now());
  let spendUsd = 0;
  let unpriced = 0;
  let spendAlerted = false;
  const lastFailureAlert = new Map();
  const recent = [];

  function rollDay() {
    const today = dayKey(now());
    if (today !== day) {
      day = today;
      spendUsd = 0;
      unpriced = 0;
      spendAlerted = false;
    }
  }

  async function send(alert) {
    const entry = { ...alert, at: new Date(now()).toISOString() };
    recent.push(entry);
    if (recent.length > MAX_RECENT) recent.shift();
    logger.error("ai:alert", entry);
    if (!webhookUrl || !fetchFn) return;
    try {
      await fetchFn(webhookUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: `SproutRoute: ${alert.text}`, content: `SproutRoute: ${alert.text}`, kind: alert.kind }),
      });
    } catch (error) {
      logger.warn("ai:alert-webhook-failed", { error: error.message });
    }
  }

  return {
    async recordSpend(costUsd) {
      rollDay();
      if (!Number.isFinite(costUsd)) {
        unpriced += 1;
        return;
      }
      spendUsd = Math.round((spendUsd + costUsd) * 1e6) / 1e6;
      if (!spendAlerted && spendUsd >= dailyLimitUsd) {
        spendAlerted = true;
        await send({
          kind: "daily_spend",
          text: `estimated AI spend today is $${spendUsd.toFixed(2)}, over the $${dailyLimitUsd.toFixed(2)} daily limit.`,
        });
      }
    },

    // The raw provider message is never forwarded: it can contain part of an API key.
    async recordFailure({ provider, kind }) {
      const key = `${provider}:${kind}`;
      const last = lastFailureAlert.get(key);
      if (last !== undefined && now() - last < FAILURE_COOLDOWN_MS) return;
      lastFailureAlert.set(key, now());
      const reason = kind === "credits" ? "has no credits left" : "rejected our API key";
      await send({ kind: `provider_${kind}`, provider, text: `the ${provider} account ${reason}. Requests are falling back to other providers.` });
    },

    snapshot() {
      rollDay();
      return {
        day,
        spendTodayUsd: spendUsd,
        dailyLimitUsd,
        unpricedCallsToday: unpriced,
        webhookConfigured: Boolean(webhookUrl),
        recentAlerts: [...recent],
      };
    },
  };
}

export const aiAlerts = createAiAlerts();
