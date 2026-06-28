import assert from "node:assert/strict";
import test from "node:test";

import { validateEnvironmentVariables } from "../../src/backend/server.js";

const TRACKED_ENV = [
  "AI_PROVIDER",
  "ANTHROPIC_API_KEY",
  "GOOGLE_GEMINI_API_KEY",
  "OPENAI_API_KEY",
  "DEEPSEEK_API_KEY",
];

const ORIGINAL_ENV = Object.fromEntries(
  TRACKED_ENV.map((name) => [name, process.env[name]]),
);

function clearTrackedEnv() {
  for (const name of TRACKED_ENV) {
    delete process.env[name];
  }
}

test.afterEach(() => {
  for (const name of TRACKED_ENV) {
    if (ORIGINAL_ENV[name] === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = ORIGINAL_ENV[name];
    }
  }
});

test("validateEnvironmentVariables defaults to Anthropic and requires an Anthropic key", () => {
  clearTrackedEnv();

  assert.throws(
    () => validateEnvironmentVariables({ exitOnFailure: false }),
    /ANTHROPIC_API_KEY/,
  );
});

test("validateEnvironmentVariables allows OpenAI without an Anthropic key when AI_PROVIDER=openai", () => {
  clearTrackedEnv();
  process.env.AI_PROVIDER = "openai";
  process.env.OPENAI_API_KEY = "test-openai-key";

  assert.deepEqual(
    validateEnvironmentVariables({ exitOnFailure: false }),
    { aiProvider: "openai", requiredEnvVar: "OPENAI_API_KEY" },
  );
});

test("validateEnvironmentVariables allows Gemini without an Anthropic key when AI_PROVIDER=gemini", () => {
  clearTrackedEnv();
  process.env.AI_PROVIDER = "gemini";
  process.env.GOOGLE_GEMINI_API_KEY = "test-gemini-key";

  assert.deepEqual(
    validateEnvironmentVariables({ exitOnFailure: false }),
    { aiProvider: "gemini", requiredEnvVar: "GOOGLE_GEMINI_API_KEY" },
  );
});

test("validateEnvironmentVariables rejects placeholder API keys", () => {
  clearTrackedEnv();
  process.env.AI_PROVIDER = "openai";
  process.env.OPENAI_API_KEY = "your_openai_api_key_here";

  assert.throws(
    () => validateEnvironmentVariables({ exitOnFailure: false }),
    /OPENAI_API_KEY/,
  );
});

test("validateEnvironmentVariables rejects unsupported AI providers", () => {
  clearTrackedEnv();
  process.env.AI_PROVIDER = "made-up-provider";

  assert.throws(
    () => validateEnvironmentVariables({ exitOnFailure: false }),
    /AI_PROVIDER/,
  );
});
