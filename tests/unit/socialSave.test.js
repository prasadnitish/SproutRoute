import test from "node:test";
import assert from "node:assert/strict";
import {
  extractCandidates,
  prepareImport,
  safeSource,
} from "../../src/backend/services/socialSave.js";

test("an unsupported URL asks for evidence without fetching it", async () => {
  const result = await prepareImport(
    { source: "https://example.org/post" },
    { fetchFn: assert.fail, model: assert.fail },
  );
  assert.equal(result.status, "needs_evidence");
});
test("reject credentials and executable URLs", () => {
  for (const url of [
    "javascript:alert(1)",
    "https://person:password@example.com",
  ])
    assert.throws(() => safeSource(url));
});
test("two named places survive, fabricated evidence and unsupported family claims do not", async () => {
  const text = "Visit Oceanarium and Tile Museum. Oceanarium has a quiet room.";
  const rows = [
    {
      name: "Oceanarium",
      evidence: "Oceanarium has a quiet room.",
      family: "quiet room",
    },
    {
      name: "Tile Museum",
      evidence: "Visit Oceanarium and Tile Museum.",
      family: "stroller rental",
    },
    { name: "Imaginary Cafe", evidence: "Try Imaginary Cafe." },
  ];
  const result = await extractCandidates(text, async () => ({
    responseText: JSON.stringify({ candidates: rows }),
  }));
  assert.deepEqual(
    result.map((x) => x.name),
    ["Oceanarium", "Tile Museum"],
  );
  assert.equal(result[1].family, "");
});
test("a YouTube title uses a fixed embed host and passes only its text to the extractor", async () => {
  const source = "https://youtu.be/test";
  const result = await prepareImport(
    { source },
    {
      fetchFn: async (target, options) => {
        assert.equal(new URL(target).origin, "https://www.youtube.com");
        assert.equal(options.redirect, "error");
        return Response.json({ title: "Visit Lisbon Zoo" });
      },
      model: async ({ user }) => {
        assert.equal(user, "Visit Lisbon Zoo");
        return {
          responseText:
            '{"candidates":[{"name":"Lisbon Zoo","evidence":"Visit Lisbon Zoo"}]}',
        };
      },
    },
  );
  assert.equal(result.origin, "title");
  assert.equal(result.candidates[0].name, "Lisbon Zoo");
});
test("family tags preserve negation and cannot borrow another venue's tip", async () => {
  const text = "Maple Cafe is not stroller accessible. Hope Park has shade.";
  const rows = [
    {
      name: "Maple Cafe",
      evidence: "Maple Cafe is not stroller accessible.",
      family: "stroller accessible",
      tip: "has shade",
    },
  ];
  const [place] = await extractCandidates(text, async () => ({
    responseText: JSON.stringify({ candidates: rows }),
  }));
  assert.equal(place.family, "Maple Cafe is not stroller accessible.");
  assert.equal(place.tip, "");
});

test("accepts fenced object JSON from the fallback provider", async () => {
  const result = await extractCandidates("Lisbon Zoo", async () => ({
    responseText: [
      "```json",
      JSON.stringify({
        candidates: [{ name: "Lisbon Zoo", evidence: "Lisbon Zoo" }],
      }),
      "```",
    ].join("\n"),
  }));
  assert.equal(result[0].name, "Lisbon Zoo");
});
