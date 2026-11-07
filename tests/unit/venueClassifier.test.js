import test from "node:test";
import assert from "node:assert/strict";
import { createVenueClassifier } from "../../src/backend/services/trend/venueClassifier.js";

const reply = (text) => async () => ({ responseText: text });
const venues = [{ key: "loc:1", name: "seattle aquarium", captions: ["Fun!"] }, { key: "loc:2", name: "Rooftop Lounge", captions: ["Cocktails"] }];

test("each venue gets a family verdict and a proper name", async () => {
  const c = createVenueClassifier({ callModelFn: reply('[{"key":"loc:1","familyVisitable":true,"name":"Seattle Aquarium"},{"key":"loc:2","familyVisitable":false,"name":"Rooftop Lounge"}]') });
  const out = await c.classifyVenues({ city: "Seattle", venues });
  assert.deepEqual(out.get("loc:1"), { familyVisitable: true, name: "Seattle Aquarium" });
  assert.equal(out.get("loc:2").familyVisitable, false);
});

test("a venue the reply leaves out, or answers with a non-boolean, is not family visitable", async () => {
  const c = createVenueClassifier({ callModelFn: reply('[{"key":"loc:1","familyVisitable":"yes"}]') });
  const out = await c.classifyVenues({ city: "Seattle", venues });
  assert.equal(out.get("loc:1").familyVisitable, false);
  assert.equal(out.get("loc:2").familyVisitable, false);
});

test("JSON wrapped in prose is still read, and unreadable output throws", async () => {
  const wrapped = createVenueClassifier({ callModelFn: reply('Here you go:\n[{"key":"loc:1","familyVisitable":true,"name":"Seattle Aquarium"}]') });
  assert.equal((await wrapped.classifyVenues({ city: "Seattle", venues })).get("loc:1").familyVisitable, true);
  const junk = createVenueClassifier({ callModelFn: reply("I cannot help with that") });
  await assert.rejects(() => junk.classifyVenues({ city: "Seattle", venues }), /no JSON array/);
});

test("captions are sent trimmed, at most three per venue, to Haiku with low effort", async () => {
  let sent;
  const c = createVenueClassifier({ callModelFn: async (req) => { sent = req; return { responseText: "[]" }; } });
  await c.classifyVenues({ city: "Seattle", venues: [{ key: "k", name: "N", captions: ["a".repeat(500), "b", "c", "d"] }] });
  const payload = JSON.parse(sent.user);
  assert.equal(payload.places[0].captions.length, 3);
  assert.ok(payload.places[0].captions[0].length <= 160);
  assert.equal(sent.effort, "low");
  assert.match(sent.model, /haiku/);
});

test("caption extraction names the venue each caption is about and ignores ids it was not given", async () => {
  const c = createVenueClassifier({ callModelFn: reply('[{"id":"u1","venue":"Kerry Park"},{"id":"u2","venue":null},{"id":"zzz","venue":"Invented"}]') });
  const out = await c.extractVenues({ city: "Seattle", captions: [{ id: "u1", text: "view" }, { id: "u2", text: "lunch" }] });
  assert.deepEqual(out, [{ id: "u1", venue: "Kerry Park" }, { id: "u2", venue: null }]);
});
