const JSON_FENCE_RE = /```(?:json)?\s*([\s\S]*?)```/i;

export function normalizePastedProfileJson(rawText) {
  const withoutBom = String(rawText || "").replace(/^\uFEFF/, "").trim();
  const fencedMatch = withoutBom.match(JSON_FENCE_RE);
  let candidate = (fencedMatch?.[1] || withoutBom).trim();

  if (!candidate.startsWith("{") && candidate.includes("{")) {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start >= 0 && end > start) {
      candidate = candidate.slice(start, end + 1);
    }
  }

  return candidate
    .replace(/[\u201C\u201D\u201E\u201F]/g, "\"")
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'");
}

export function parsePastedProfileJson(rawText) {
  return JSON.parse(normalizePastedProfileJson(rawText));
}
