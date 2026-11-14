import test from "node:test";
import assert from "node:assert/strict";
import { childrenAgesAreStated, parseInput } from "../../src/backend/services/parseInput.js";

const stated = (text, ages) => childrenAgesAreStated(text, ages);

test("ages the parent wrote with a unit are stated", () => {
  assert.equal(stated("Family trip to San Diego. 2 adults, a 3 year old and a 7 year old.", [3, 7]), true);
  assert.equal(stated("Trip with our 8-year-old", [8]), true);
  assert.equal(stated("Trip with an eight year old and a ten-year-old", [8, 10]), true);
  assert.equal(stated("my 4yo", [4]), true);
});

test("ages after age, ages or aged, or listed right after kids, are stated", () => {
  assert.equal(stated("two kids aged 4 and 8", [4, 8]), true);
  assert.equal(stated("kids ages 6 and 9", [6, 9]), true);
  assert.equal(stated("2 adults and two kids, 4 and 8", [4, 8]), true);
  assert.equal(stated("kids (5, 7, 11)", [5, 7, 11]), true);
});

test("months count rounded down, so a baby is never treated as an older child without asking", () => {
  assert.equal(stated("Weekend away with a 5 month old", [0]), true);
  assert.equal(stated("Weekend away with a 5 month old", [1]), false);
});

test("kids with no ages means the age was assumed", () => {
  assert.equal(stated("Three days in Nashville. We're bringing the kids.", [5]), false);
  assert.equal(stated("Trip with two kids", [5]), false);
  assert.equal(stated("Trip with our toddler", [2]), false);
  assert.equal(stated("a baby and a teen", [1, 14]), false);
});

test("a number that is not an age does not count", () => {
  assert.equal(stated("Trip on December 5 with kids", [5]), false);
  assert.equal(stated("2 adults, kids, 5 days in Orlando", [5]), false);
  assert.equal(stated("Five days in Orlando with the kids", [5]), false);
});

test("one given age and one assumed age is assumed", () => {
  assert.equal(stated("a 3 year old and another kid", [3, 5]), false);
});

test("no children means nothing was assumed", () => {
  assert.equal(stated("A weekend for two adults", []), true);
  assert.equal(stated("A weekend for two adults", undefined), true);
});

const reply = (ages) => JSON.stringify({
  destination: "Nashville, Tennessee, USA", startDate: "2027-02-05", endDate: "2027-02-07", adults: 2, childrenAges: ages,
});

test("parseInput flags assumed ages in its result", async () => {
  const result = await parseInput("Three days in Nashville, February 5 to 7, 2027. We're bringing the kids.", { callAI: async () => reply([5]) });
  assert.deepEqual(result.childrenAges, [5]);
  assert.equal(result.childrenAgesAssumed, true);
});

test("parseInput does not flag ages the parent gave", async () => {
  const result = await parseInput("Nashville, February 5 to 7, 2027, with a 5 year old.", { callAI: async () => reply([5]) });
  assert.equal(result.childrenAgesAssumed, false);
});

test("parseInput does not flag a trip with no children", async () => {
  const result = await parseInput("Nashville, February 5 to 7, 2027, two adults.", { callAI: async () => reply([]) });
  assert.equal(result.childrenAgesAssumed, false);
});

test("a reply that cannot be read does not flag anything", async () => {
  const result = await parseInput("Nashville with the kids", { callAI: async () => "not json" });
  assert.equal(result.childrenAgesAssumed, false);
});
