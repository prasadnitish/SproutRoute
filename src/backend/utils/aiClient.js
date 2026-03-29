/**
 * aiClient.js — Unified AI model client abstraction
 *
 * Supports three providers:
 *   - "anthropic"  — Claude Sonnet 4.6 via @anthropic-ai/sdk
 *   - "gemini"     — Gemini 3 Flash via @google/generative-ai
 *   - "deepseek"   — DeepSeek V3 via openai npm package (OpenAI-compatible API)
 *
 * Per-task model selection:
 *   Each caller can specify a `provider` in the prompt to override the global default.
 *   This enables using Gemini for hot-path tasks (tripPlan, packingList, parseInput)
 *   while keeping Anthropic as fallback.
 *
 * Normalises all providers to a single interface:
 *   callModel({ system, user, maxTokens, temperature }) → { responseText, stopReason }
 *
 * Usage:
 *   import { callModel } from "../utils/aiClient.js";
 *   const { responseText } = await callModel({ system: "...", user: "..." });
 *
 *   // Per-task provider override:
 *   const { responseText } = await callModel({ system, user, provider: "gemini", caller: "tripPlan" });
 *
 * Dependency injection via `deps` parameter (for testing without real API keys):
 *   await callModel({ system, user }, { anthropicClient: mockClient })
 *   await callModel({ system, user }, { geminiModel: mockModel })
 *   await callModel({ system, user }, { deepseekClient: mockClient })
 */

import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { log } from "./logger.js";

// ── Constants ─────────────────────────────────────────────────────────────────

const ANTHROPIC_MODEL_ID = "claude-sonnet-4-6";
const GEMINI_MODEL_ID    = "gemini-3-flash-preview";
const DEEPSEEK_MODEL_ID  = "deepseek-chat";
const DEFAULT_MAX_TOKENS = 4096;
const DEFAULT_TEMPERATURE = 0;

// Default provider is read at call time so env changes (and tests) work correctly
function getDefaultProvider() {
  return (process.env.AI_PROVIDER || "anthropic").toLowerCase().trim();
}

// ── Provider implementations ──────────────────────────────────────────────────

/**
 * Call Claude via Anthropic SDK.
 * Returns { responseText, stopReason }.
 */
async function callAnthropic(client, { system, user, maxTokens, temperature, cacheSystemPrompt }) {
  const systemParam = cacheSystemPrompt
    ? [{ type: "text", text: system, cache_control: { type: "ephemeral" } }]
    : system;

  const message = await client.messages.create({
    model: ANTHROPIC_MODEL_ID,
    system: systemParam,
    temperature,
    max_tokens: maxTokens,
    messages: [{ role: "user", content: user }],
  });

  const responseText = (message.content || [])
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("");

  if (cacheSystemPrompt) {
    const usage = message.usage || {};
    if (usage.cache_read_input_tokens || usage.cache_creation_input_tokens) {
      log.info("AI cache stats", {
        created: usage.cache_creation_input_tokens ?? 0,
        read: usage.cache_read_input_tokens ?? 0,
        uncached: usage.input_tokens ?? 0,
      });
    }
  }

  return { responseText, stopReason: message.stop_reason || null };
}

/**
 * Call Gemini via Google Generative AI SDK.
 * Returns { responseText, stopReason }.
 *
 * Uses responseMimeType: "application/json" for native JSON enforcement
 * when the system prompt requests JSON output.
 */
async function callGemini(model, { system, user, maxTokens, temperature }) {
  const result = await model.generateContent({
    contents: [{ role: "user", parts: [{ text: user }] }],
    systemInstruction: { parts: [{ text: system }] },
    generationConfig: {
      temperature,
      maxOutputTokens: maxTokens,
      responseMimeType: "application/json",
    },
  });

  const response = result.response;
  const responseText = response.text();
  const stopReason = response.candidates?.[0]?.finishReason || null;

  return { responseText, stopReason };
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

/** @type {GoogleGenerativeAI|null} */
let _geminiInstance = null;

function makeGeminiModel() {
  if (!_geminiInstance) {
    const apiKey = process.env.GOOGLE_GEMINI_API_KEY;
    if (!apiKey) throw new Error("GOOGLE_GEMINI_API_KEY is not set");
    _geminiInstance = new GoogleGenerativeAI(apiKey);
  }
  return _geminiInstance.getGenerativeModel({ model: GEMINI_MODEL_ID });
}

async function makeDeepSeekClient() {
  const { default: OpenAI } = await import("openai");
  return new OpenAI({
    apiKey: process.env.DEEPSEEK_API_KEY,
    baseURL: "https://api.deepseek.com",
  });
}

// ── Provider resolver ─────────────────────────────────────────────────────────

function resolveProvider(prompt) {
  // Per-task override takes priority, then global default
  if (prompt.provider) return prompt.provider.toLowerCase().trim();
  return getDefaultProvider();
}

function modelIdForProvider(provider) {
  switch (provider) {
    case "gemini":    return GEMINI_MODEL_ID;
    case "deepseek":  return DEEPSEEK_MODEL_ID;
    default:          return ANTHROPIC_MODEL_ID;
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Call the configured AI model and return a normalised response.
 *
 * @param {object} prompt
 * @param {string} prompt.system           - System instruction
 * @param {string} prompt.user             - User message
 * @param {number} [prompt.maxTokens]      - Max tokens (default: 4096)
 * @param {number} [prompt.temperature]    - Sampling temperature (default: 0)
 * @param {string} [prompt.provider]       - Per-task provider override ("gemini", "anthropic", "deepseek")
 * @param {string} [prompt.caller]         - Label for log grouping
 * @param {boolean} [prompt.cacheSystemPrompt] - Enable Anthropic prompt caching
 *
 * @param {object} [deps]                  - Dependency injection (for tests)
 * @param {object} [deps.anthropicClient]  - Pre-built Anthropic client
 * @param {object} [deps.geminiModel]      - Pre-built Gemini model
 * @param {object} [deps.deepseekClient]   - Pre-built DeepSeek/OpenAI client
 *
 * @returns {Promise<{ responseText: string, stopReason: string|null }>}
 */
export async function callModel(prompt, deps = {}) {
  const {
    system,
    user,
    maxTokens = DEFAULT_MAX_TOKENS,
    temperature = DEFAULT_TEMPERATURE,
    cacheSystemPrompt = false,
  } = prompt;

  const provider = resolveProvider(prompt);
  const caller = prompt.caller || "unknown";
  const modelId = modelIdForProvider(provider);
  const t0 = Date.now();

  // Determine fallback chain: gemini → anthropic → deepseek
  const fallbackProviders = [];
  if (provider === "gemini" && process.env.ANTHROPIC_API_KEY) fallbackProviders.push("anthropic");
  if (provider !== "deepseek" && process.env.DEEPSEEK_API_KEY) fallbackProviders.push("deepseek");

  try {
    const result = await callProvider(provider, { system, user, maxTokens, temperature, cacheSystemPrompt }, deps);
    const ms = Date.now() - t0;
    log.info("ai:call", { caller, provider, model: modelId, ms, outChars: result.responseText?.length || 0 });
    return result;
  } catch (error) {
    const ms = Date.now() - t0;
    log.warn(`AI call failed (${provider})`, { caller, error: error.message, ms });

    // Try fallbacks in order
    for (const fb of fallbackProviders) {
      try {
        const fbT0 = Date.now();
        const result = await callProvider(fb, { system, user, maxTokens, temperature, cacheSystemPrompt: false }, deps);
        const fbMs = Date.now() - fbT0;
        log.info("ai:call", { caller, provider: `${fb}-fallback`, model: modelIdForProvider(fb), ms: fbMs, outChars: result.responseText?.length || 0 });
        return result;
      } catch (fbError) {
        log.warn(`Fallback ${fb} also failed`, { caller, error: fbError.message });
      }
    }

    // All providers failed
    log.error("AI all providers failed", { caller, provider, fallbacks: fallbackProviders, error: error.message });
    throw error;
  }
}

/**
 * Route to the correct provider implementation.
 */
async function callProvider(provider, params, deps) {
  switch (provider) {
    case "gemini": {
      const model = deps.geminiModel ?? makeGeminiModel();
      return await callGemini(model, params);
    }
    case "deepseek": {
      const client = deps.deepseekClient ?? (await makeDeepSeekClient());
      return await callDeepSeek(client, params);
    }
    default: {
      const client = deps.anthropicClient ?? makeAnthropicClient();
      return await callAnthropic(client, params);
    }
  }
}

// ── Exports for testing ───────────────────────────────────────────────────────

export const __test = {
  ANTHROPIC_MODEL_ID,
  GEMINI_MODEL_ID,
  DEEPSEEK_MODEL_ID,
  resolveProvider,
  modelIdForProvider,
};
