// Posts scores to Langfuse so quality can be filtered and trended next to the traces.
// Reused by the eval runner for objective signals; a judge or human-scoring script can call postScores too.
// https://langfuse.com/docs/evaluation/evaluation-methods/scores-via-sdk

const MISSING = "LANGFUSE_PUBLIC_KEY, LANGFUSE_SECRET_KEY and LANGFUSE_BASE_URL are required";

export async function postScores(scores, { env = process.env, fetchFn = globalThis.fetch } = {}) {
  const baseUrl = String(env.LANGFUSE_BASE_URL || env.LANGFUSE_HOST || "").replace(/\/$/, "");
  if (!env.LANGFUSE_PUBLIC_KEY || !env.LANGFUSE_SECRET_KEY || !baseUrl) return { skipped: MISSING };
  try {
    const res = await fetchFn(`${baseUrl}/api/public/scores`, {
      method: "POST",
      headers: {
        authorization: `Basic ${Buffer.from(`${env.LANGFUSE_PUBLIC_KEY}:${env.LANGFUSE_SECRET_KEY}`).toString("base64")}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(scores),
    });
    if (!res.ok) return { error: `HTTP ${res.status}: ${String(await res.text?.()).slice(0, 200)}` };
    return { posted: scores.length };
  } catch (error) {
    return { error: error.message };
  }
}

// Did the call finish without an HTTP error or an SSE error event? Keyed by trace so a re-run overwrites it.
export function completionScore({ trace, failed, status, streamError }) {
  if (!trace) return null;
  const reasons = [];
  if (failed) {
    reasons.push(`HTTP ${status}`);
    if (streamError) reasons.push("stream error event");
  }
  return {
    traceId: trace,
    id: `${trace}-completed`,
    name: "completed",
    value: failed ? 0 : 1,
    dataType: "BOOLEAN",
    ...(failed && { comment: reasons.join(", ") }),
  };
}
