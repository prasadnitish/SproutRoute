#!/usr/bin/env node
// Synthetic-only OpenRouter screen. Requires a dedicated API key with a <= $20 key limit.
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { CASES, median, runCase } from "./benchmark-luna.mjs";

const API = "https://openrouter.ai/api/v1";
const TIMEOUT_MS = 90_000;
const MAX_RUN_USD = 20;
const MODELS = new Set([
  "openai/gpt-6-luna", "google/gemini-3.8-flash", "deepseek/deepseek-v4.1-flash",
  "z-ai/glm-5.3-flash", "qwen/qwen3.8-flash", "xiaomi/mimo-v2.6-flash",
  "qwen/qwen3.8-max-0902", "anthropic/claude-sonnet-5", "openai/gpt-6-sol",
  "inception/mercury-2.5", "anthropic/claude-opus-5.5",
]);
const FIRST_PARTY_ENDPOINT = {
  "openai/gpt-6-luna": "openai",
  "google/gemini-3.8-flash": "google-ai-studio",
  "deepseek/deepseek-v4.1-flash": "deepinfra/fp8",
  "z-ai/glm-5.3-flash": "z-ai/fp8",
  "qwen/qwen3.8-flash": "alibaba",
  "xiaomi/mimo-v2.6-flash": "xiaomi/fp8",
  "qwen/qwen3.8-max-0902": "alibaba",
  "anthropic/claude-sonnet-5": "anthropic",
  "anthropic/claude-opus-5.5": "anthropic",
  "openai/gpt-6-sol": "openai",
  "inception/mercury-2.5": "inception",
};

export function selectEndpoint(model, endpoints, override = null) {
  const tag = override || FIRST_PARTY_ENDPOINT[model];
  const endpoint = endpoints.find((item) => item.tag === tag && item.status === 0 &&
    item.supported_parameters?.includes("response_format") && item.supported_parameters?.includes("max_tokens"));
  if (!endpoint) throw new Error(`No active JSON-capable endpoint for ${model} at ${tag}`);
  return endpoint;
}

export function buildOpenRouterRequest(model, { system = "", user, maxTokens }, maxPrice = null, provider = null, reasoningEffort = null) {
  if (!MODELS.has(model) || !Number.isInteger(maxTokens) || maxTokens < 1 || !user) throw new Error("Invalid request");
  return {
    model,
    messages: [{ role: "system", content: system || "Return only JSON." }, { role: "user", content: user }],
    max_tokens: maxTokens,
    response_format: { type: "json_object" },
    ...(reasoningEffort || model === "openai/gpt-6-luna" ? { reasoning_effort: reasoningEffort || "low" } : {}),
    provider: {
      require_parameters: true,
      allow_fallbacks: false,
      sort: "price",
      ...(maxPrice ? { max_price: maxPrice } : {}),
      ...(provider ? { only: [provider] } : {}),
    },
  };
}

export function maximumRequestCost({ system = "", user, maxTokens }, pricing) {
  const inputRate = Number(pricing?.prompt);
  const outputRate = Number(pricing?.completion);
  if (!Number.isFinite(inputRate) || !Number.isFinite(outputRate) || inputRate < 0 || outputRate < 0 ||
      !Number.isInteger(maxTokens) || maxTokens < 1 || typeof user !== "string") throw new Error("Invalid catalog price or prompt");
  // UTF-8 bytes bound text token count; add room for chat-message framing.
  return (Buffer.byteLength(system) + Buffer.byteLength(user) + 1024) * inputRate + maxTokens * outputRate;
}

export function canStartRequest(spent, reserved, cap) {
  return Number.isFinite(spent) && Number.isFinite(reserved) && Number.isFinite(cap) &&
    spent >= 0 && reserved >= 0 && cap > 0 && spent + reserved <= cap;
}

export function keyRunCap(keyInfo, accountRemainingUsd) {
  const limit = keyInfo?.limit;
  const remaining = keyInfo?.limit_remaining;
  if (typeof limit !== "number" || typeof remaining !== "number" ||
      !Number.isFinite(limit) || !Number.isFinite(remaining) ||
      limit <= 0 || limit > MAX_RUN_USD || remaining <= 0 ||
      !Number.isFinite(accountRemainingUsd) || accountRemainingUsd <= 5) {
    throw new Error("Use a dedicated OpenRouter key limited to $20 or less, with more than $5 account credit remaining");
  }
  return Math.min(MAX_RUN_USD, remaining, accountRemainingUsd - 5);
}

export function billedCost(usage) {
  if (typeof usage?.cost !== "number" || !Number.isFinite(usage.cost) || usage.cost < 0) {
    throw new Error("OpenRouter returned no valid billed cost; stopping");
  }
  return usage.cost;
}

function readKey() {
  if (process.env.OPENROUTER_API_KEY) return process.env.OPENROUTER_API_KEY;
  try {
    return execFileSync("security", ["find-generic-password", "-w", "-s", "sproutroute-openrouter-benchmark"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    throw new Error("OpenRouter key not visible. Export OPENROUTER_API_KEY in this process or save the Keychain entry.");
  }
}

function listArg(name) {
  return process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3)?.split(",").filter(Boolean);
}

async function jsonGet(url, key = null) {
  const response = await fetch(url, { signal: AbortSignal.timeout(15_000), headers: key ? { Authorization: `Bearer ${key}` } : {} });
  if (!response.ok) throw new Error(`OpenRouter preflight HTTP ${response.status}`);
  return response.json();
}

async function providerForGeneration(id, key) {
  if (!id) return null;
  try {
    const result = await jsonGet(`${API}/generation?id=${encodeURIComponent(id)}`, key);
    return result.data?.provider_name || null;
  } catch { return null; }
}

async function main() {
  const models = listArg("models");
  const tasks = listArg("tasks");
  const provider = process.argv.find((arg) => arg.startsWith("--provider="))?.slice(11) || null;
  const reasoningEffort = process.argv.find((arg) => arg.startsWith("--reasoning-effort="))?.slice(19) || null;
  const tripMaxTokensArg = process.argv.find((arg) => arg.startsWith("--trip-max-tokens="))?.slice(18);
  const tripMaxTokens = tripMaxTokensArg === undefined ? null : Number(tripMaxTokensArg);
  if (!models?.length || !tasks?.length || models.some((model) => !MODELS.has(model)) ||
      tasks.some((task) => !CASES[task]) || (provider && models.length !== 1) ||
      (reasoningEffort && !["low", "medium", "high"].includes(reasoningEffort)) ||
      (tripMaxTokens !== null && (!Number.isInteger(tripMaxTokens) || tripMaxTokens < 4200 || tripMaxTokens > 16_000))) {
    throw new Error("Specify --models=<catalog-slugs> and --tasks=<parse,trip,safety,repair,law,precompute>; --provider requires one model");
  }

  const key = readKey();
  const [keyInfo, catalog, credits, endpointLists] = await Promise.all([
    jsonGet(`${API}/key`, key), jsonGet(`${API}/models`), jsonGet(`${API}/credits`, key),
    Promise.all(models.map((model) => jsonGet(`${API}/models/${model}/endpoints`))),
  ]);
  const accountRemainingUsd = Number(credits.data?.total_credits) - Number(credits.data?.total_usage);
  const cap = keyRunCap(keyInfo.data, accountRemainingUsd);
  const catalogById = new Map(catalog.data.map((entry) => [entry.id, entry]));
  const endpointByModel = new Map(models.map((model, index) =>
    [model, selectEndpoint(model, endpointLists[index].data?.endpoints || [], provider)]));
  for (const model of models) {
    const entry = catalogById.get(model);
    if (!entry?.supported_parameters?.includes("response_format") || !entry?.supported_parameters?.includes("max_tokens")) {
      throw new Error(`Catalog lacks required JSON or output-cap support: ${model}`);
    }
  }

  let accountedUsd = 0;
  const rows = [];
  console.log(JSON.stringify({ benchmark: "SproutRoute OpenRouter synthetic screen", at: new Date().toISOString(),
    models, tasks, capUsd: cap, keyLimitUsd: keyInfo.data.limit, accountRemainingUsd,
    reasoningEffort, tripMaxTokens: tripMaxTokens || "production",
    endpoints: Object.fromEntries([...endpointByModel].map(([model, endpoint]) => [model, endpoint.tag])),
    pricingSource: `${API}/models/{author}/{slug}/endpoints` }));
  for (const task of tasks) {
    for (const testCase of CASES[task]) {
      for (const model of models) {
        const endpoint = endpointByModel.get(model);
        const effectiveEffort = endpoint.supported_parameters?.includes("reasoning_effort") ?
          reasoningEffort || (model === "openai/gpt-6-luna" ? "low" : null) : null;
        let caseBilledCost = null;
        const callModel = async (_model, prompt) => {
          const promptPerMillion = Number(endpoint.pricing.prompt) * 1_000_000;
          const completionPerMillion = Number(endpoint.pricing.completion) * 1_000_000;
          if (!Number.isFinite(promptPerMillion) || !Number.isFinite(completionPerMillion) ||
              promptPerMillion < 0 || completionPerMillion < 0) throw new Error("Invalid live model price");
          const maxPrice = { prompt: promptPerMillion * 1.1, completion: completionPerMillion * 1.1 };
          const reservation = maximumRequestCost(prompt, {
            prompt: maxPrice.prompt / 1_000_000, completion: maxPrice.completion / 1_000_000,
          });
          if (!canStartRequest(accountedUsd, reservation, cap)) throw new Error("Spend cap reached before request");
          accountedUsd += reservation; // Failed or unbilled attempts retain the conservative reservation.
          const started = performance.now();
          const response = await fetch(`${API}/chat/completions`, {
            method: "POST", signal: AbortSignal.timeout(TIMEOUT_MS),
            headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
            body: JSON.stringify(buildOpenRouterRequest(model, prompt, maxPrice, endpoint.tag, effectiveEffort)),
          });
          const body = await response.json();
          if (!response.ok) throw new Error(`OpenRouter HTTP ${response.status}: ${body.error?.code || "request_failed"}`);
          const cost = billedCost(body.usage);
          caseBilledCost = (caseBilledCost || 0) + cost;
          accountedUsd += cost - reservation;
          if (cost > reservation || accountedUsd > cap) throw new Error("OpenRouter charge exceeded preflight reservation; stopping");
          const ms = Math.round(performance.now() - started);
          return { text: body.choices?.[0]?.message?.content || "", ms,
            finishReason: body.choices?.[0]?.finish_reason || null,
            inputTokens: body.usage?.prompt_tokens || 0,
            outputTokens: body.usage?.completion_tokens || 0,
            reasoningTokens: body.usage?.completion_tokens_details?.reasoning_tokens || 0,
            billedCostUsd: cost, servedModel: body.model || null,
            provider: await providerForGeneration(body.id, key) || endpoint.provider_name,
            providerTag: endpoint.tag };
        };
        try {
          const row = await runCase(task, testCase, model, "low", callModel, { tripMaxTokens });
          row.billedCostUsd = caseBilledCost;
          row.reasoningEffort = effectiveEffort;
          if (task === "trip") row.maxTokens = tripMaxTokens || 4200;
          rows.push(row);
          console.log(JSON.stringify(row));
        } catch (error) {
          const message = String(error.message || error);
          const row = { task, case: testCase.id, model, pass: false, issues: ["request_failed"],
            billedCostUsd: caseBilledCost, reasoningEffort: effectiveEffort, error: message.slice(0, 120) };
          if (task === "trip") row.maxTokens = tripMaxTokens || 4200;
          rows.push(row);
          console.log(JSON.stringify(row));
          if (message.includes("Spend cap") || message.includes("billed cost") || message.includes("charge exceeded")) {
            console.log(JSON.stringify({ stopped: message, accountedUsd }));
            return;
          }
        }
      }
    }
  }
  const summary = models.flatMap((model) => tasks.map((task) => {
    const cases = rows.filter((row) => row.model === model && row.task === task);
    return { model, task, pass: cases.filter((row) => row.pass).length, total: cases.length,
      medianMs: median(cases.map((row) => row.ms).filter(Number.isFinite)),
      billedCostUsd: cases.reduce((sum, row) => sum + (row.billedCostUsd || 0), 0) };
  }));
  console.log(JSON.stringify({ summary, accountedUsd }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => { console.error(String(error.message || error)); process.exitCode = 1; });
}
