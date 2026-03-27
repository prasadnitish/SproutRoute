// Shared utilities for all AI service modules.
// Centralising here keeps packingListAI and tripPlanAI in sync on retry logic,
// error classification, and response parsing without duplicating code.

// Worst-case AI API calls per HTTP request with MAX_RETRIES=1:
//   primary (up to 2) + compact retry (up to 2) + repair (1) = 5 max.
export const MAX_RETRIES = 2;
export const INITIAL_RETRY_DELAY_MS = 1000;

export function isRetryableError(error) {
  // Only retry on transient upstream conditions; never retry on bad input or auth errors.
  if (error.status === 429 || error.status === 503 || error.status === 529) return true;
  if (error.message?.includes("timeout")) return true;
  return false;
}

export async function requestWithRetry(callFn, maxRetries = MAX_RETRIES) {
  // Generic retry wrapper with exponential backoff; caller passes a zero-argument closure.
  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await callFn();
    } catch (error) {
      lastError = error;

      if (attempt < maxRetries && isRetryableError(error)) {
        const delayMs = Math.min(
          INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt),
          10000,
        );
        if (process.env.NODE_ENV !== "production") {
          console.warn(
            `Retrying AI request (attempt ${attempt + 1}/${maxRetries}) after ${delayMs}ms...`,
          );
        }
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      } else {
        throw error;
      }
    }
  }

  throw lastError;
}

export function getTextContent(message) {
  // Extract concatenated text from the AI response content block array.
  if (!message?.content || !Array.isArray(message.content)) return "";

  return message.content
    .filter((item) => item.type === "text")
    .map((item) => item.text || "")
    .join("\n")
    .trim();
}

export function extractJsonCandidates(responseText) {
  // Returns parse candidates in priority order: raw text, fenced block, brace-extracted.
  // Multiple candidates because LLM output may include markdown wrappers despite instructions.
  const candidates = [];

  if (typeof responseText === "string" && responseText.trim()) {
    candidates.push(responseText.trim());

    const blockMatch =
      responseText.match(/```json\s*([\s\S]*?)\s*```/i) ||
      responseText.match(/```\s*([\s\S]*?)\s*```/i);

    if (blockMatch?.[1]) {
      candidates.push(blockMatch[1].trim());
    }

    const jsonStart = responseText.indexOf("{");
    const jsonEnd = responseText.lastIndexOf("}");
    if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
      candidates.push(responseText.slice(jsonStart, jsonEnd + 1));
    }
  }

  return candidates;
}
