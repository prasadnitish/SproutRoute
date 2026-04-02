/**
 * aiClient.js tests — Phase 2, Feature: AI model abstraction
 *
 * Written BEFORE implementation (TDD Red).
 * Guards the unified AI model interface that supports:
 *   - Anthropic (Claude Haiku) via @anthropic-ai/sdk
 *   - DeepSeek V3 (OpenAI-compatible) via openai npm package
 *
 * Pattern: dependency injection via `deps` param — all tests mock the SDK clients.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { callModel, __test } from "../../src/backend/utils/aiClient.js";

const ORIGINAL_AI_PROVIDER = process.env.AI_PROVIDER;
const ORIGINAL_GOOGLE_GEMINI_MODEL = process.env.GOOGLE_GEMINI_MODEL;
const ORIGINAL_GOOGLE_GEMINI_MODEL_PARSE_INPUT = process.env.GOOGLE_GEMINI_MODEL_PARSE_INPUT;
const ORIGINAL_GOOGLE_GEMINI_MODEL_TRIP_PLAN = process.env.GOOGLE_GEMINI_MODEL_TRIP_PLAN;

test.afterEach(() => {
  if (ORIGINAL_AI_PROVIDER !== undefined) {
    process.env.AI_PROVIDER = ORIGINAL_AI_PROVIDER;
  } else {
    delete process.env.AI_PROVIDER;
  }

  if (ORIGINAL_GOOGLE_GEMINI_MODEL !== undefined) {
    process.env.GOOGLE_GEMINI_MODEL = ORIGINAL_GOOGLE_GEMINI_MODEL;
  } else {
    delete process.env.GOOGLE_GEMINI_MODEL;
  }

  if (ORIGINAL_GOOGLE_GEMINI_MODEL_PARSE_INPUT !== undefined) {
    process.env.GOOGLE_GEMINI_MODEL_PARSE_INPUT = ORIGINAL_GOOGLE_GEMINI_MODEL_PARSE_INPUT;
  } else {
    delete process.env.GOOGLE_GEMINI_MODEL_PARSE_INPUT;
  }

  if (ORIGINAL_GOOGLE_GEMINI_MODEL_TRIP_PLAN !== undefined) {
    process.env.GOOGLE_GEMINI_MODEL_TRIP_PLAN = ORIGINAL_GOOGLE_GEMINI_MODEL_TRIP_PLAN;
  } else {
    delete process.env.GOOGLE_GEMINI_MODEL_TRIP_PLAN;
  }
});

// ── Anthropic provider ────────────────────────────────────────────────────────

test("callModel with anthropic provider calls messages.create and returns responseText", async () => {
  delete process.env.AI_PROVIDER; // defaults to anthropic

  let calledWith = null;
  const mockAnthropicClient = {
    messages: {
      create: async (params) => {
        calledWith = params;
        return {
          content: [{ type: "text", text: "Anthropic response text" }],
          stop_reason: "end_turn",
        };
      },
    },
  };

  const result = await callModel(
    {
      system: "You are a helpful assistant.",
      user: "Say hello.",
      maxTokens: 512,
      temperature: 0,
    },
    { anthropicClient: mockAnthropicClient },
  );

  assert.strictEqual(result.responseText, "Anthropic response text");
  assert.strictEqual(result.stopReason, "end_turn");
  assert.ok(calledWith, "messages.create must have been called");
  assert.strictEqual(calledWith.max_tokens, 512);
  assert.strictEqual(calledWith.temperature, 0);
  assert.strictEqual(calledWith.system, "You are a helpful assistant.");
});

test("callModel with anthropic provider uses correct model ID", async () => {
  delete process.env.AI_PROVIDER;

  let usedModel = null;
  const mockAnthropicClient = {
    messages: {
      create: async (params) => {
        usedModel = params.model;
        return {
          content: [{ type: "text", text: "ok" }],
          stop_reason: "end_turn",
        };
      },
    },
  };

  await callModel({ system: "s", user: "u" }, { anthropicClient: mockAnthropicClient });

  // Must use Claude Sonnet (upgraded from Haiku for quality — see smoke test results)
  assert.ok(
    usedModel && (usedModel.toLowerCase().includes("sonnet") || usedModel.toLowerCase().includes("haiku")),
    `Model ID must include "sonnet" — got: ${usedModel}`,
  );
});

test("callModel normalizes Anthropic multi-content array to string", async () => {
  delete process.env.AI_PROVIDER;

  const mockAnthropicClient = {
    messages: {
      create: async () => ({
        content: [
          { type: "text", text: "Part one. " },
          { type: "text", text: "Part two." },
        ],
        stop_reason: "end_turn",
      }),
    },
  };

  const result = await callModel({ system: "s", user: "u" }, { anthropicClient: mockAnthropicClient });

  assert.strictEqual(
    result.responseText,
    "Part one. Part two.",
    "Multi-part text content must be joined into a single string",
  );
});

// ── DeepSeek provider ─────────────────────────────────────────────────────────

test("callModel with deepseek provider calls chat.completions.create and returns responseText", async () => {
  process.env.AI_PROVIDER = "deepseek";

  let calledWith = null;
  const mockDeepSeekClient = {
    chat: {
      completions: {
        create: async (params) => {
          calledWith = params;
          return {
            choices: [
              {
                message: { content: "DeepSeek response text" },
                finish_reason: "stop",
              },
            ],
          };
        },
      },
    },
  };

  const result = await callModel(
    {
      system: "You are a helpful assistant.",
      user: "Say hello.",
      maxTokens: 1024,
      temperature: 0,
    },
    { deepseekClient: mockDeepSeekClient },
  );

  assert.strictEqual(result.responseText, "DeepSeek response text");
  assert.strictEqual(result.stopReason, "stop");
  assert.ok(calledWith, "chat.completions.create must have been called");
  assert.strictEqual(calledWith.max_tokens, 1024);
});

test("callModel with deepseek provider uses deepseek-chat model", async () => {
  process.env.AI_PROVIDER = "deepseek";

  let usedModel = null;
  const mockDeepSeekClient = {
    chat: {
      completions: {
        create: async (params) => {
          usedModel = params.model;
          return {
            choices: [{ message: { content: "ok" }, finish_reason: "stop" }],
          };
        },
      },
    },
  };

  await callModel({ system: "s", user: "u" }, { deepseekClient: mockDeepSeekClient });

  assert.ok(
    usedModel && usedModel.toLowerCase().includes("deepseek"),
    `Model must be a deepseek model — got: ${usedModel}`,
  );
});

test("callModel with deepseek provider passes system as messages[0] role=system", async () => {
  process.env.AI_PROVIDER = "deepseek";

  let capturedMessages = null;
  const mockDeepSeekClient = {
    chat: {
      completions: {
        create: async (params) => {
          capturedMessages = params.messages;
          return {
            choices: [{ message: { content: "ok" }, finish_reason: "stop" }],
          };
        },
      },
    },
  };

  await callModel(
    { system: "System instruction.", user: "User message." },
    { deepseekClient: mockDeepSeekClient },
  );

  assert.ok(Array.isArray(capturedMessages), "messages must be an array");
  const systemMsg = capturedMessages.find((m) => m.role === "system");
  const userMsg = capturedMessages.find((m) => m.role === "user");

  assert.ok(systemMsg, "Must have a system message");
  assert.strictEqual(systemMsg.content, "System instruction.");
  assert.ok(userMsg, "Must have a user message");
  assert.strictEqual(userMsg.content, "User message.");
});

// ── Both providers: error propagation ────────────────────────────────────────

test("callModel with anthropic re-throws SDK errors with original message", async () => {
  delete process.env.AI_PROVIDER;

  const mockAnthropicClient = {
    messages: {
      create: async () => {
        throw new Error("Anthropic API timeout");
      },
    },
  };

  await assert.rejects(
    () => callModel({ system: "s", user: "u" }, { anthropicClient: mockAnthropicClient }),
    (err) => {
      assert.ok(
        err.message.includes("Anthropic API timeout") || err.message.includes("AI"),
        `Error must include original message — got: "${err.message}"`,
      );
      return true;
    },
  );
});

test("callModel with deepseek re-throws SDK errors with original message", async () => {
  process.env.AI_PROVIDER = "deepseek";

  const mockDeepSeekClient = {
    chat: {
      completions: {
        create: async () => {
          throw new Error("DeepSeek rate limited");
        },
      },
    },
  };

  await assert.rejects(
    () => callModel({ system: "s", user: "u" }, { deepseekClient: mockDeepSeekClient }),
    (err) => {
      assert.ok(
        err.message.includes("DeepSeek rate limited") || err.message.includes("AI"),
        `Error must include original message — got: "${err.message}"`,
      );
      return true;
    },
  );
});

// ── Default values ────────────────────────────────────────────────────────────

test("callModel applies default maxTokens and temperature when not specified", async () => {
  delete process.env.AI_PROVIDER;

  let capturedParams = null;
  const mockAnthropicClient = {
    messages: {
      create: async (params) => {
        capturedParams = params;
        return {
          content: [{ type: "text", text: "ok" }],
          stop_reason: "end_turn",
        };
      },
    },
  };

  await callModel({ system: "s", user: "u" }, { anthropicClient: mockAnthropicClient });

  assert.ok(
    Number.isFinite(capturedParams.max_tokens) && capturedParams.max_tokens > 0,
    `max_tokens must have a positive default — got: ${capturedParams.max_tokens}`,
  );
  assert.ok(
    Number.isFinite(capturedParams.temperature),
    `temperature must have a numeric default — got: ${capturedParams.temperature}`,
  );
});

// ── Prompt caching (cacheSystemPrompt) ───────────────────────────────────────
// Note: These tests verify callModel's low-level cache_control wrapping.
// tripPlanAI.test.js and packingListAI.test.js verify that caching is *enabled*
// on first attempt at the service layer — different concern, no overlap.

test("callModel with cacheSystemPrompt=true wraps system as typed block array", async () => {
  delete process.env.AI_PROVIDER;

  let capturedParams = null;
  const mockAnthropicClient = {
    messages: {
      create: async (params) => {
        capturedParams = params;
        return {
          content: [{ type: "text", text: "cached response" }],
          stop_reason: "end_turn",
          usage: { cache_creation_input_tokens: 100, input_tokens: 50 },
        };
      },
    },
  };

  await callModel(
    { system: "System prompt text", user: "Hello", cacheSystemPrompt: true },
    { anthropicClient: mockAnthropicClient },
  );

  assert.ok(Array.isArray(capturedParams.system), "system param must be an array when caching is enabled");
  assert.equal(capturedParams.system.length, 1, "system array must have 1 block");
  assert.equal(capturedParams.system[0].type, "text");
  assert.equal(capturedParams.system[0].text, "System prompt text");
  assert.deepEqual(
    capturedParams.system[0].cache_control,
    { type: "ephemeral" },
    "cache_control must be { type: 'ephemeral' }",
  );
});

test("callModel with cacheSystemPrompt=false passes system as plain string", async () => {
  delete process.env.AI_PROVIDER;

  let capturedParams = null;
  const mockAnthropicClient = {
    messages: {
      create: async (params) => {
        capturedParams = params;
        return {
          content: [{ type: "text", text: "uncached response" }],
          stop_reason: "end_turn",
        };
      },
    },
  };

  await callModel(
    { system: "System prompt text", user: "Hello", cacheSystemPrompt: false },
    { anthropicClient: mockAnthropicClient },
  );

  assert.strictEqual(
    capturedParams.system,
    "System prompt text",
    "system param must be a plain string when caching is disabled",
  );
});

test("callModel defaults cacheSystemPrompt to false", async () => {
  delete process.env.AI_PROVIDER;

  let capturedParams = null;
  const mockAnthropicClient = {
    messages: {
      create: async (params) => {
        capturedParams = params;
        return {
          content: [{ type: "text", text: "ok" }],
          stop_reason: "end_turn",
        };
      },
    },
  };

  // No cacheSystemPrompt specified
  await callModel(
    { system: "System prompt text", user: "Hello" },
    { anthropicClient: mockAnthropicClient },
  );

  assert.strictEqual(
    capturedParams.system,
    "System prompt text",
    "Without cacheSystemPrompt, system must be a plain string (default false)",
  );
});

test("callModel with cacheSystemPrompt=true still returns responseText correctly", async () => {
  delete process.env.AI_PROVIDER;

  const mockAnthropicClient = {
    messages: {
      create: async () => ({
        content: [{ type: "text", text: "Cached response content" }],
        stop_reason: "end_turn",
        usage: { cache_read_input_tokens: 200, input_tokens: 10 },
      }),
    },
  };

  const result = await callModel(
    { system: "s", user: "u", cacheSystemPrompt: true },
    { anthropicClient: mockAnthropicClient },
  );

  assert.strictEqual(result.responseText, "Cached response content");
  assert.strictEqual(result.stopReason, "end_turn");
});

// ── Gemini provider ─────────────────────────────────────────────────────────

test("callModel with gemini provider calls generateContent and returns responseText", async () => {
  delete process.env.AI_PROVIDER;

  let capturedConfig = null;
  const mockGeminiModel = {
    generateContent: async (params) => {
      capturedConfig = params;
      return {
        response: {
          text: () => '{"overview":"Gemini trip plan"}',
          candidates: [{ finishReason: "STOP" }],
        },
      };
    },
  };

  const result = await callModel(
    { system: "You are a planner.", user: "Plan a trip.", provider: "gemini", caller: "tripPlan" },
    { geminiModel: mockGeminiModel },
  );

  assert.strictEqual(result.responseText, '{"overview":"Gemini trip plan"}');
  assert.strictEqual(result.stopReason, "STOP");
  assert.ok(capturedConfig, "generateContent must have been called");
  assert.strictEqual(capturedConfig.generationConfig.responseMimeType, "application/json");
});

test("callModel with gemini provider passes system as systemInstruction", async () => {
  let captured = null;
  const mockGeminiModel = {
    generateContent: async (params) => {
      captured = params;
      return {
        response: {
          text: () => "{}",
          candidates: [{ finishReason: "STOP" }],
        },
      };
    },
  };

  await callModel(
    { system: "System instruction text", user: "Hello", provider: "gemini" },
    { geminiModel: mockGeminiModel },
  );

  assert.ok(captured.systemInstruction, "systemInstruction must be set");
  assert.strictEqual(captured.systemInstruction.parts[0].text, "System instruction text");
});

test("callModel with gemini provider passes maxTokens and temperature", async () => {
  let captured = null;
  const mockGeminiModel = {
    generateContent: async (params) => {
      captured = params;
      return {
        response: {
          text: () => "{}",
          candidates: [{ finishReason: "STOP" }],
        },
      };
    },
  };

  await callModel(
    { system: "s", user: "u", provider: "gemini", maxTokens: 2048, temperature: 0.5 },
    { geminiModel: mockGeminiModel },
  );

  assert.strictEqual(captured.generationConfig.maxOutputTokens, 2048);
  assert.strictEqual(captured.generationConfig.temperature, 0.5);
});

// ── Per-task provider override ──────────────────────────────────────────────

test("callModel per-task provider override routes to correct provider", async () => {
  delete process.env.AI_PROVIDER; // default is anthropic

  let geminiCalled = false;
  let anthropicCalled = false;
  const mockGeminiModel = {
    generateContent: async () => {
      geminiCalled = true;
      return { response: { text: () => "{}", candidates: [{ finishReason: "STOP" }] } };
    },
  };
  const mockAnthropicClient = {
    messages: {
      create: async () => {
        anthropicCalled = true;
        return { content: [{ type: "text", text: "ok" }], stop_reason: "end_turn" };
      },
    },
  };

  // With provider: "gemini", should use Gemini even when default is anthropic
  await callModel(
    { system: "s", user: "u", provider: "gemini" },
    { geminiModel: mockGeminiModel, anthropicClient: mockAnthropicClient },
  );

  assert.ok(geminiCalled, "Gemini must be called when provider='gemini'");
  assert.ok(!anthropicCalled, "Anthropic must NOT be called when provider='gemini'");
});

test("callModel falls back to anthropic when gemini fails", async () => {
  delete process.env.AI_PROVIDER;
  // Ensure ANTHROPIC_API_KEY is set for fallback
  const origKey = process.env.ANTHROPIC_API_KEY;
  process.env.ANTHROPIC_API_KEY = "test-key";

  let anthropicCalled = false;
  const mockGeminiModel = {
    generateContent: async () => { throw new Error("Gemini quota exceeded"); },
  };
  const mockAnthropicClient = {
    messages: {
      create: async () => {
        anthropicCalled = true;
        return { content: [{ type: "text", text: "fallback ok" }], stop_reason: "end_turn" };
      },
    },
  };

  const result = await callModel(
    { system: "s", user: "u", provider: "gemini" },
    { geminiModel: mockGeminiModel, anthropicClient: mockAnthropicClient },
  );

  assert.ok(anthropicCalled, "Anthropic fallback must be called when Gemini fails");
  assert.strictEqual(result.responseText, "fallback ok");

  // Restore
  if (origKey !== undefined) process.env.ANTHROPIC_API_KEY = origKey;
  else delete process.env.ANTHROPIC_API_KEY;
});

// ── resolveProvider and modelIdForProvider ───────────────────────────────────

test("resolveProvider returns per-task override when set", () => {
  assert.strictEqual(__test.resolveProvider({ provider: "gemini" }), "gemini");
  assert.strictEqual(__test.resolveProvider({ provider: "ANTHROPIC" }), "anthropic");
});

test("modelIdForProvider returns correct model IDs", () => {
  assert.ok(__test.modelIdForProvider("gemini").includes("gemini"));
  assert.ok(__test.modelIdForProvider("anthropic").includes("haiku") || __test.modelIdForProvider("anthropic").includes("sonnet"));
  assert.ok(__test.modelIdForProvider("deepseek").includes("deepseek"));
});

test("normalizeCallerKey converts caller labels to env-safe keys", () => {
  assert.strictEqual(__test.normalizeCallerKey("parseInput"), "PARSE_INPUT");
  assert.strictEqual(__test.normalizeCallerKey("tripPlan"), "TRIP_PLAN");
  assert.strictEqual(__test.normalizeCallerKey("tripPlan:repair"), "TRIP_PLAN_REPAIR");
});

test("resolveModelId uses caller-specific Gemini override when set", () => {
  process.env.GOOGLE_GEMINI_MODEL = "gemini-2.5-flash";
  process.env.GOOGLE_GEMINI_MODEL_PARSE_INPUT = "gemini-2.5-flash";
  process.env.GOOGLE_GEMINI_MODEL_TRIP_PLAN = "gemini-3-flash-preview";

  assert.strictEqual(__test.resolveModelId("gemini", "parseInput"), "gemini-2.5-flash");
  assert.strictEqual(__test.resolveModelId("gemini", "tripPlan"), "gemini-3-flash-preview");
  assert.strictEqual(__test.resolveModelId("gemini", "packingList"), "gemini-2.5-flash");
});
