import Anthropic from "@anthropic-ai/sdk";

const FETCH_TIMEOUT_MS = 12000;
const MAX_TEXT_CHARS = 16000;
const MODEL_ID = "claude-haiku-4-5-20251001";

const ALLOWED_RESTRAINTS = new Set([
  "rear_facing",
  "forward_facing_harness",
  "booster",
  "seat_belt",
  "not_found",
]);

function stripHtml(html) {
  if (typeof html !== "string") return "";

  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sanitizeNumeric(value) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeRule(rule, index) {
  const requiredRestraint =
    typeof rule?.requiredRestraint === "string" &&
    ALLOWED_RESTRAINTS.has(rule.requiredRestraint)
      ? rule.requiredRestraint
      : "not_found";

  return {
    priority: Number.isFinite(rule?.priority) ? rule.priority : index + 1,
    requiredRestraint,
    seatPosition:
      typeof rule?.seatPosition === "string"
        ? rule.seatPosition
        : "rear_seat_preferred",
    minAgeMonths: sanitizeNumeric(rule?.minAgeMonths),
    maxAgeMonths: sanitizeNumeric(rule?.maxAgeMonths),
    minWeightLb: sanitizeNumeric(rule?.minWeightLb),
    maxWeightLb: sanitizeNumeric(rule?.maxWeightLb),
    minHeightIn: sanitizeNumeric(rule?.minHeightIn),
    maxHeightIn: sanitizeNumeric(rule?.maxHeightIn),
  };
}

function parseJsonFromResponse(responseText) {
  if (typeof responseText !== "string") return null;

  const candidates = [responseText.trim()];
  const block = responseText.match(/```json\s*([\s\S]*?)\s*```/i);
  if (block?.[1]) {
    candidates.push(block[1].trim());
  }

  const start = responseText.indexOf("{");
  const end = responseText.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    candidates.push(responseText.slice(start, end + 1));
  }

  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      return JSON.parse(candidate);
    } catch {
      // Keep trying remaining parse candidates.
    }
  }

  return null;
}

async function fetchSourceText(sourceUrl, fetchFn = fetch) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetchFn(sourceUrl, {
      method: "GET",
      headers: {
        "User-Agent": "SproutRoute/1.0",
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Source fetch failed: ${response.status}`);
    }

    const html = await response.text();
    const text = stripHtml(html);
    return text.slice(0, MAX_TEXT_CHARS);
  } finally {
    clearTimeout(timeout);
  }
}

function buildPrompt({ jurisdictionCode, jurisdictionName, sourceUrl, sourceText }) {
  return `You are extracting child passenger safety law signals from an official source page.

Jurisdiction: ${jurisdictionName} (${jurisdictionCode})
Source URL: ${sourceUrl}

Source text:
${sourceText}

Extract and return ONLY JSON with this exact shape:
{
  "verificationStatus": "Needs review",
  "effectiveDate": "YYYY-MM-DD or Not found in repo",
  "summary": "short summary",
  "rules": [
    {
      "priority": 1,
      "requiredRestraint": "rear_facing|forward_facing_harness|booster|seat_belt|not_found",
      "seatPosition": "rear_seat_required_if_available|rear_seat_required_under_8|rear_seat_required_under_13|rear_seat_recommended|rear_seat_preferred|not_found",
      "minAgeMonths": 0,
      "maxAgeMonths": 23,
      "minWeightLb": null,
      "maxWeightLb": 40,
      "minHeightIn": null,
      "maxHeightIn": 40
    }
  ],
  "citationSnippet": "short quote from the source text used for extraction"
}

Rules:
- If values are missing from source text, use null.
- Do not invent an effective date; use "Not found in repo" if absent.
- If no usable legal thresholds are present, return an empty rules array.
- Output strict JSON only and do not include markdown fences.`;
}

function getTextContent(message) {
  if (!message?.content || !Array.isArray(message.content)) {
    return "";
  }

  return message.content
    .filter((item) => item.type === "text")
    .map((item) => item.text || "")
    .join("\n")
    .trim();
}

export async function researchCarSeatRulesFromOfficialSource(
  { jurisdictionCode, jurisdictionName, sourceUrl },
  deps = {},
) {
  const {
    fetchFn = fetch,
    anthropicFactory = (apiKey) => new Anthropic({ apiKey }),
  } = deps;

  if (!sourceUrl) return null;

  if (
    !process.env.ANTHROPIC_API_KEY ||
    process.env.ANTHROPIC_API_KEY === "your_api_key_here"
  ) {
    return null;
  }

  const sourceText = await fetchSourceText(sourceUrl, fetchFn);
  if (!sourceText) return null;

  const anthropic = anthropicFactory(process.env.ANTHROPIC_API_KEY);
  const prompt = buildPrompt({
    jurisdictionCode,
    jurisdictionName,
    sourceUrl,
    sourceText,
  });

  const callModel = async (promptText) => {
    const message = await anthropic.messages.create({
      model: MODEL_ID,
      temperature: 0,
      max_tokens: 1400,
      messages: [{ role: "user", content: promptText }],
    });

    return {
      text: getTextContent(message),
      stopReason: message.stop_reason || null,
    };
  };

  const firstAttempt = await callModel(prompt);
  let parsed = parseJsonFromResponse(firstAttempt.text);

  if (!parsed || !Array.isArray(parsed.rules)) {
    const retryPrompt = `${prompt}\n\nRetry: return compact strict JSON only (no markdown, no commentary).`;
    const secondAttempt = await callModel(retryPrompt);
    parsed = parseJsonFromResponse(secondAttempt.text);

    if (!parsed || !Array.isArray(parsed.rules)) {
      if (process.env.NODE_ENV !== "production") {
        console.warn(
          "Safety law research JSON parse failed after retry. Stop reason:",
          secondAttempt.stopReason || firstAttempt.stopReason || "unknown",
        );
      }
      return null;
    }
  }

  const rules = parsed.rules
    .map((rule, index) => normalizeRule(rule, index))
    .filter((rule) => rule.requiredRestraint !== "not_found");

  return {
    jurisdictionCode,
    jurisdictionName,
    sourceUrl,
    effectiveDate:
      typeof parsed.effectiveDate === "string" && parsed.effectiveDate.trim()
        ? parsed.effectiveDate.trim()
        : "Not found in repo",
    lastUpdated: new Date().toISOString().slice(0, 10),
    verificationStatus: "Needs review",
    notes:
      typeof parsed.summary === "string" && parsed.summary.trim()
        ? parsed.summary.trim()
        : "AI-assisted extraction from official source. Verify before travel.",
    citationSnippet:
      typeof parsed.citationSnippet === "string" &&
      parsed.citationSnippet.trim()
        ? parsed.citationSnippet.trim()
        : "Not found in repo",
    rules,
  };
}
