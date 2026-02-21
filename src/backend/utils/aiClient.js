/**
 * aiClient.js — Unified AI model client abstraction
 *
 * Supports two providers via AI_PROVIDER environment variable:
 *   - (default) "anthropic" — Claude Haiku via @anthropic-ai/sdk
 *   - "deepseek"            — DeepSeek V3 via openai npm package (OpenAI-compatible API)
 *
 * Normalises both providers to a single interface:
 *   callModel({ system, user, maxTokens, temperature }) → { responseText, stopReason }
 *
 * Usage:
 *   import { callModel } from "../utils/aiClient.js";
 *   const { responseText } = await callModel({ system: "...", user: "..." });
 *
 * Dependency injection via `deps` parameter (for testing without real API keys):
 *   await callModel({ system, user }, { anthropicClient: mockClient })
 *   await callModel({ system, user }, { deepseekClient: mockClient })
 */

import Anthropic from "@anthropic-ai/sdk";

// ── Constants ─────────────────────────────────────────────────────────────────

const ANTHROPIC_MODEL_ID = "claude-haiku-4-5-20251001";
const DEEPSEEK_MODEL_ID  = "deepseek-chat";
const DEFAULT_MAX_TOKENS = 4096;
const DEFAULT_TEMPERATURE = 0;

// ── Provider implementations ──────────────────────────────────────────────────

/**
 * Call Claude Haiku via Anthropic SDK.
 * Returns { responseText, stopReason }.
 */
async function callAnthropic(client, { system, user, maxTokens, temperature }) {
  const message = await client.messages.create({
    model: ANTHROPIC_MODEL_ID,
    system,
    temperature,
    max_tokens: maxTokens,
    messages: [{ role: "user", content: user }],
  });

  // Normalise: Anthropic returns content as an array of typed blocks
  const responseText = (message.content || [])
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("");

  return {
    responseText,
    stopReason: message.stop_reason || null,
  };
}

/**
 * Call DeepSeek V3 via OpenAI-compatible API.
 * Returns { responseText, stopReason }.
 */
async function callDeepSeek(client, { system, user, maxTokens, temperature }) {
  const completion = await client.chat.completions.create({
    model: DEEPSEEK_MODEL_ID,
    temperature,
    max_tokens: maxTokens,
    messages: [
      { role: "system", content: system },
      { role: "user",   content: user   },
    ],
  });

  const choice = completion.choices?.[0];
  const responseText = choice?.message?.content ?? "";
  const stopReason = choice?.finish_reason ?? null;

  return { responseText, stopReason };
}

// ── Client factory helpers ────────────────────────────────────────────────────

function makeAnthropicClient() {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

async function makeDeepSeekClient() {
  // OpenAI package is optional — only required when AI_PROVIDER=deepseek
  const { default: OpenAI } = await import("openai");
  return new OpenAI({
    apiKey: process.env.DEEPSEEK_API_KEY,
    baseURL: "https://api.deepseek.com",
  });
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Call the configured AI model and return a normalised response.
 *
 * @param {object} prompt
 * @param {string} prompt.system        - System instruction (kept separate from user data)
 * @param {string} prompt.user          - User message
 * @param {number} [prompt.maxTokens]   - Max tokens (default: 4096)
 * @param {number} [prompt.temperature] - Sampling temperature (default: 0)
 *
 * @param {object} [deps]               - Dependency injection (for tests)
 * @param {object} [deps.anthropicClient] - Pre-built Anthropic client
 * @param {object} [deps.deepseekClient]  - Pre-built DeepSeek/OpenAI client
 *
 * @returns {Promise<{ responseText: string, stopReason: string|null }>}
 */
export async function callModel(prompt, deps = {}) {
  const {
    system,
    user,
    maxTokens = DEFAULT_MAX_TOKENS,
    temperature = DEFAULT_TEMPERATURE,
  } = prompt;

  const provider = (process.env.AI_PROVIDER || "anthropic").toLowerCase().trim();

  try {
    if (provider === "deepseek") {
      const client = deps.deepseekClient ?? (await makeDeepSeekClient());
      return await callDeepSeek(client, { system, user, maxTokens, temperature });
    }

    // Default: Anthropic (Claude Haiku)
    const client = deps.anthropicClient ?? makeAnthropicClient();
    return await callAnthropic(client, { system, user, maxTokens, temperature });
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.error(`[aiClient] ${provider} error:`, error.message);
    }
    // Re-throw so callers (packingListAI, tripPlanAI) can handle with their retry logic
    throw error;
  }
}
