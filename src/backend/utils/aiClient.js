/**
 * aiClient.js — Unified AI model client abstraction
 *
 * Supports three providers:
 *   - "anthropic"  — Claude Sonnet 4.6 via @anthropic-ai/sdk
 *   - "gemini"     — Gemini via @google/generative-ai
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
import { metrics } from "../services/metrics.js";

// ── Constants ─────────────────────────────────────────────────────────────────

const ANTHROPIC_MODEL_ID = process.env.ANTHROPIC_MODEL_ID || "claude-haiku-4-5-20251001";
const GEMINI_MODEL_ID = process.env.GOOGLE_GEMINI_MODEL || process.env.GEMINI_MODEL_ID || "gemini-2.5-flash";
const OPENAI_MODEL_ID = process.env.OPENAI_MODEL_ID || "gpt-5.4-nano";
const DEEPSEEK_MODEL_ID = process.env.DEEPSEEK_MODEL_ID || "deepseek-chat";
const DEFAULT_MAX_TOKENS = 4096;
const DEFAULT_TEMPERATURE = 0;
const DEFAULT_AI_TIMEOUT_MS = 20_000;

function positiveTimeout(value, fallback = DEFAULT_AI_TIMEOUT_MS) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function createAttemptDeadline(parentSignal, timeoutMs) {
  const controller = new AbortController();
  const deadlineError = new Error("AI provider deadline exceeded");
  const timer = setTimeout(() => controller.abort(deadlineError), timeoutMs);
  const abortFromParent = () => controller.abort(parentSignal.reason || new Error("AI request cancelled"));

  if (parentSignal) {
    if (parentSignal.aborted) abortFromParent();
    else parentSignal.addEventListener("abort", abortFromParent, { once: true });
  }

  return {
    signal: controller.signal,
    async run(work) {
      if (controller.signal.aborted) throw controller.signal.reason;
      const aborted = new Promise((_, reject) => {
        controller.signal.addEventListener("abort", () => reject(controller.signal.reason), { once: true });
      });
      return Promise.race([work(), aborted]);
    },
    cleanup() {
      clearTimeout(timer);
      parentSignal?.removeEventListener("abort", abortFromParent);
    },
  };
}

// Default provider is read at call time so env changes (and tests) work correctly
function getDefaultProvider() {
  return (process.env.AI_PROVIDER || "anthropic").toLowerCase().trim();
}

function normalizeCallerKey(caller = "") {
  return String(caller)
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function resolveModelId(provider, caller = "") {
  const callerKey = normalizeCallerKey(caller);

  switch (provider) {
    case "gemini": {
      if (callerKey) {
        const callerSpecific = process.env[`GOOGLE_GEMINI_MODEL_${callerKey}`];
        if (callerSpecific) return callerSpecific;
      }
      return GEMINI_MODEL_ID;
    }
    case "openai": {
      if (callerKey) {
        const callerSpecific = process.env[`OPENAI_MODEL_ID_${callerKey}`];
        if (callerSpecific) return callerSpecific;
      }
      return OPENAI_MODEL_ID;
    }
    case "deepseek": {
      if (callerKey) {
        const callerSpecific = process.env[`DEEPSEEK_MODEL_ID_${callerKey}`];
        if (callerSpecific) return callerSpecific;
      }
      return DEEPSEEK_MODEL_ID;
    }
    default: {
      if (callerKey) {
        const callerSpecific = process.env[`ANTHROPIC_MODEL_ID_${callerKey}`];
        if (callerSpecific) return callerSpecific;
      }
      return ANTHROPIC_MODEL_ID;
    }
  }
}

// ── Provider implementations ──────────────────────────────────────────────────

/**
 * Call Claude via Anthropic SDK.
 * Returns { responseText, stopReason }.
 */
async function callAnthropic(client, { system, user, maxTokens, temperature, cacheSystemPrompt, modelId, signal, timeoutMs }) {
  const systemParam = cacheSystemPrompt
    ? [{ type: "text", text: system, cache_control: { type: "ephemeral" } }]
    : system;

  const message = await client.messages.create({
    model: modelId,
    system: systemParam,
    temperature,
    max_tokens: maxTokens,
    messages: [{ role: "user", content: user }],
  }, { signal, timeout: timeoutMs });

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
async function callGemini(model, { system, user, maxTokens, temperature, signal, timeoutMs }) {
  const result = await model.generateContent({
    contents: [{ role: "user", parts: [{ text: user }] }],
    systemInstruction: { parts: [{ text: system }] },
    generationConfig: {
      temperature,
      maxOutputTokens: maxTokens,
      responseMimeType: "application/json",
    },
  }, { signal, timeout: timeoutMs });

  const response = result.response;
  const responseText = response.text();
  const stopReason = response.candidates?.[0]?.finishReason || null;

  return { responseText, stopReason };
}

/**
 * Call OpenAI (GPT-5.4 nano/mini) via OpenAI SDK.
 * Uses native JSON mode + max_completion_tokens (not max_tokens).
 * Returns { responseText, stopReason }.
 */
async function callOpenAI(client, { system, user, maxTokens, temperature, modelId, signal, timeoutMs }) {
  const completion = await client.chat.completions.create({
    model: modelId,
    temperature,
    max_completion_tokens: maxTokens,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: system },
      { role: "user",   content: user   },
    ],
  }, { signal, timeout: timeoutMs });

  const choice = completion.choices?.[0];
  const responseText = choice?.message?.content ?? "";
  const stopReason = choice?.finish_reason ?? null;

  return { responseText, stopReason };
}

/**
 * Call DeepSeek V3 via OpenAI-compatible API.
 * Returns { responseText, stopReason }.
 */
async function callDeepSeek(client, { system, user, maxTokens, temperature, signal, timeoutMs }) {
  const completion = await client.chat.completions.create({
    model: DEEPSEEK_MODEL_ID,
    temperature,
    max_tokens: maxTokens,
    messages: [
      { role: "system", content: system },
      { role: "user",   content: user   },
    ],
  }, { signal, timeout: timeoutMs });

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

function makeGeminiModel(modelId) {
  if (!_geminiInstance) {
    const apiKey = process.env.GOOGLE_GEMINI_API_KEY;
    if (!apiKey) throw new Error("GOOGLE_GEMINI_API_KEY is not set");
    _geminiInstance = new GoogleGenerativeAI(apiKey);
  }
  return _geminiInstance.getGenerativeModel({ model: modelId });
}

async function makeOpenAIClient() {
  const { default: OpenAI } = await import("openai");
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
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

function modelIdForProvider(provider, caller = "") {
  return resolveModelId(provider, caller);
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
  const modelId = prompt.model || modelIdForProvider(provider, caller);
  const t0 = Date.now();
  const timeoutMs = positiveTimeout(prompt.timeoutMs || process.env.AI_PROVIDER_TIMEOUT_MS);
  const deadlineAt = Date.now() + timeoutMs;

  // Determine fallback chain: gemini → anthropic → deepseek
  const fallbackProviders = [];
  if (provider === "openai" && process.env.ANTHROPIC_API_KEY) fallbackProviders.push("anthropic");
  if (provider === "gemini" && process.env.ANTHROPIC_API_KEY) fallbackProviders.push("anthropic");
  if (provider !== "deepseek" && process.env.DEEPSEEK_API_KEY) fallbackProviders.push("deepseek");

  async function callWithRemainingBudget(selectedProvider, params) {
    const remainingMs = deadlineAt - Date.now();
    if (remainingMs <= 0) throw new Error("AI provider deadline exceeded");
    const deadline = createAttemptDeadline(prompt.signal, remainingMs);
    try {
      return await deadline.run(() => callProvider(selectedProvider, {
        ...params,
        signal: deadline.signal,
        timeoutMs: remainingMs,
      }, deps));
    } finally {
      deadline.cleanup();
    }
  }

  try {
    const result = await callWithRemainingBudget(provider, {
      system, user, maxTokens, temperature, cacheSystemPrompt, modelId,
    });
    const ms = Date.now() - t0;
    log.info("ai:call", { caller, provider, model: modelId, ms, outChars: result.responseText?.length || 0 });
    metrics.recordAiCall({ caller, provider, model: modelId, ms, outChars: result.responseText?.length || 0, success: true });
    return result;
  } catch (error) {
    const ms = Date.now() - t0;
    log.warn(`AI call failed (${provider})`, { caller, error: error.message, ms });
    metrics.recordAiCall({ caller, provider, model: modelId, ms, outChars: 0, success: false });

    // Try fallbacks in order
    for (const fb of fallbackProviders) {
      try {
        const fbT0 = Date.now();
        const fallbackModelId = modelIdForProvider(fb, caller);
        const result = await callWithRemainingBudget(fb, {
          system, user, maxTokens, temperature, cacheSystemPrompt: false, modelId: fallbackModelId,
        });
        const fbMs = Date.now() - fbT0;
        log.info("ai:call", { caller, provider: `${fb}-fallback`, model: fallbackModelId, ms: fbMs, outChars: result.responseText?.length || 0 });
        metrics.recordAiCall({ caller, provider: `${fb}-fallback`, model: fallbackModelId, ms: fbMs, outChars: result.responseText?.length || 0, success: true });
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
      const model = deps.geminiModel ?? makeGeminiModel(params.modelId);
      return await callGemini(model, params);
    }
    case "openai": {
      const client = deps.openaiClient ?? (await makeOpenAIClient());
      return await callOpenAI(client, params);
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
  normalizeCallerKey,
  resolveModelId,
  resolveProvider,
  modelIdForProvider,
};
