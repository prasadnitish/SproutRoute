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
import { callModel } from "../../src/backend/utils/aiClient.js";

const ORIGINAL_AI_PROVIDER = process.env.AI_PROVIDER;

test.afterEach(() => {
  if (ORIGINAL_AI_PROVIDER !== undefined) {
    process.env.AI_PROVIDER = ORIGINAL_AI_PROVIDER;
  } else {
    delete process.env.AI_PROVIDER;
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

  // Must use Claude Haiku (not Sonnet/Opus — cost-sensitive path)
  assert.ok(
    usedModel && usedModel.toLowerCase().includes("haiku"),
    `Model ID must include "haiku" — got: ${usedModel}`,
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
