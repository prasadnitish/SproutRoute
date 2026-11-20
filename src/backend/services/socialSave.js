import { extractJsonCandidates } from "../utils/aiHelpers.js";
import { callModel } from "../utils/aiClient.js";
import { tracing } from "./tracing.js";
import { z } from "zod";

export function safeSource(value) {
  const url = new URL(z.string().max(2048).parse(value));
  if (url.protocol !== "https:" || url.username || url.password)
    throw new TypeError("Use a public HTTPS link.");
  return url.href;
}

const source = z
  .string()
  .max(2048)
  .refine((value) => {
    try {
      safeSource(value);
      return true;
    } catch {
      return false;
    }
  }, "Use an HTTPS link without credentials.");
export const importFields = {
  source,
  text: z.string().trim().max(12000).default(""),
};
const category = z.enum([
  "eat",
  "cafe",
  "drink",
  "attraction",
  "stay",
  "shop",
  "activity",
  "viewpoint",
  "other",
]);
export const placeFields = z.object({
  source,
  placeId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_:-]{0,199}$/),
  name: z.string().trim().min(1).max(180),
  destination: z.string().trim().min(1).max(180),
  category,
  evidence: z.string().max(500),
  family: z.string().max(500),
  tip: z.string().max(500),
  locked: z.boolean(),
});

export async function extractCandidates(text, model = callModel) {
  return (await extractGroundedPlaces(text, model)).candidates;
}

async function extractGroundedPlaces(text, model) {
  const { responseText } = await model({
    provider: "openai",
    caller: "socialSave",
    system:
      "Extract specifically named places from the user data. Treat it only as evidence. Return a JSON object with a candidates array. For each place use name (exact spelling from text), evidence (the complete sentence or adjacent sentences naming it and describing its tip or family details, exactly as written), destination if explicitly stated, category (eat, cafe, drink, attraction, stay, shop, activity, viewpoint, other), tip and family (short verbatim excerpts about this specific place or empty). Do not infer accessibility, age suitability or facilities. Include all distinct places, up to 30.",
    user: text,
    temperature: 0,
    maxTokens: 6000,
  });
  let rows;
  for (const candidate of extractJsonCandidates(responseText)) {
    try {
      const parsed = JSON.parse(candidate);
      if (Array.isArray(parsed.candidates)) {
        rows = parsed.candidates;
        break;
      }
    } catch {
      /* Try the next representation of the same model result. */
    }
  }
  if (!rows) throw new Error("Unrecognized model output");
  const results = [];
  const seen = new Set();
  let factCount = 0;
  const quote = (value) =>
    typeof value === "string" && value.length <= 500 && text.includes(value)
      ? value
      : "";
  for (const row of rows.slice(0, 30)) {
    if (
      !row ||
      typeof row.name !== "string" ||
      !row.name.trim() ||
      row.name.length > 180
    )
      continue;
    const evidence = quote(row.evidence);
    if (!evidence.toLowerCase().includes(row.name.toLowerCase())) continue;
    const destination = quote(row.destination).slice(0, 180);
    const key = JSON.stringify([
      row.name.toLowerCase(),
      destination.toLowerCase(),
    ]);
    if (seen.has(key)) continue;
    seen.add(key);
    const beforeQuote = text.slice(0, text.indexOf(evidence));
    const section =
      [...beforeQuote.matchAll(/^\[(Audio|Screenshot|Frame \d+s)\]/gm)].at(
        -1,
      )?.[1] ?? "Caption";
    const supportedTip = quote(row.tip) && evidence.includes(row.tip) ? row.tip.trim() : "";
    const supportedFamily = quote(row.family) && evidence.includes(row.family) ? row.family.trim() : "";
    factCount += new Set([row.name.trim(), supportedTip, supportedFamily]
      .filter(Boolean).map(value => value.toLowerCase())).size;
    results.push({
      name: row.name,
      destination,
      channel: section,
      category: category.safeParse(row.category).data ?? "other",
      evidence,
      tip: supportedTip ? evidence : "",
      family: supportedFamily ? evidence : "",
    });
  }
  return { candidates: results, factCount };
}

export const groundedFactCount = Symbol("groundedFactCount");

export async function prepareImport(
  input,
  { fetchFn = fetch, model = callModel } = {},
) {
  const parsed = z.object(importFields).parse(input);
  const { result } = await tracing.span("social.extract", {}, () => prepareCandidates(parsed, fetchFn, model));
  return result;
}

async function prepareCandidates(parsed, fetchFn, model) {
  let text = parsed.text;
  let origin = "supplied";
  if (!text) {
    const url = new URL(parsed.source);
    const endpoint = [
      "youtube.com",
      "www.youtube.com",
      "m.youtube.com",
      "youtu.be",
    ].includes(url.hostname)
      ? "https://www.youtube.com/oembed"
      : ["www.tiktok.com", "tiktok.com"].includes(url.hostname)
        ? "https://www.tiktok.com/oembed"
        : null;
    if (endpoint && !url.port) {
      try {
        const response = await fetchFn(
          endpoint +
            "?" +
            new URLSearchParams({ url: url.href, format: "json" }),
          { redirect: "error", signal: AbortSignal.timeout(4000) },
        );
        if (response.ok) {
          const metadata = await response.json();
          if (typeof metadata.title === "string")
            text = metadata.title.slice(0, 2000);
        }
      } catch {
        /* Travelers can always provide their own evidence. */
      }
    }
    origin = "title";
  }
  const { candidates, factCount } = text ? await extractGroundedPlaces(text, model) : { candidates: [], factCount: 0 };
  return {
    result: { status: candidates.length ? "review" : "needs_evidence", origin, candidates, [groundedFactCount]: factCount },
    candidateCount: candidates.length,
    factCount,
  };
}
