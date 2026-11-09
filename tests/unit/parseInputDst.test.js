// Dates are calendar days. Adding days in local time shifts the result by one when the server's clocks change
// inside the trip (US daylight saving starts March 14, 2027), so a 4-day Lisbon trip came out as 3 days on a
// Pacific-time machine. Production runs in UTC, which hid it.
import test from "node:test";
import assert from "node:assert/strict";

const savedTz = process.env.TZ;
process.env.TZ = "America/Los_Angeles";
const { parseInput } = await import("../../src/backend/services/parseInput.js");

const reply = (obj) => async () => JSON.stringify(obj);

test("4 days from March 14, 2027 ends March 17 on a Pacific-time server", async () => {
  const parsed = await parseInput("4 days in Lisbon from march 14. 2 adults, kids aged 4 and 8", {
    clientDate: "2026-11-08",
    callAI: reply({ destination: "Lisbon, Portugal", startDate: "2027-03-14", endDate: "2027-03-15", adults: 2, childrenAges: [4, 8] }),
  });
  assert.equal(parsed.startDate, "2027-03-14");
  assert.equal(parsed.endDate, "2027-03-17");
});

test("per-stop stays across the clock change add up to the full trip", async () => {
  const parsed = await parseInput("4 days in Orlando and 3 days in Miami from march 12 2027", {
    clientDate: "2026-11-08",
    callAI: reply({
      destination: "Orlando, FL", startDate: "2027-03-12", endDate: "2027-03-14", adults: 2, childrenAges: [],
      tripShape: "multi_stop", stops: [{ name: "Orlando, FL", requestedNights: 4 }, { name: "Miami, FL", requestedNights: 3 }],
    }),
  });
  assert.equal(parsed.endDate, "2027-03-18");
});

test.after(() => { if (savedTz === undefined) delete process.env.TZ; else process.env.TZ = savedTz; });
