import test from "node:test";
import assert from "node:assert/strict";
import { buildIcs, calendarEventCount, icsFilename } from "../../src/frontend/src/utils/calendarExport.js";

const days = [
  {
    date: "2026-12-18",
    scheduled: [
      { name: "Coronado Beach", scheduledStart: "9:00 AM", scheduledEnd: "1:00 PM", description: "Sand, surf; bring hats", enriched: { address: "Ocean Blvd, Coronado, CA" } },
      { name: "Closed place", scheduledStart: "2:00 PM", scheduledEnd: "3:00 PM", status: "closed" },
      { name: "No time yet", scheduledStart: null, scheduledEnd: null },
    ],
  },
  { date: null, scheduled: [{ name: "Undated", scheduledStart: "9:00 AM", scheduledEnd: "10:00 AM" }] },
  { date: "2026-12-19", scheduled: [{ name: "Late dinner", scheduledStart: "11:30 PM", scheduledEnd: "12:30 AM", isMeal: true, note: "Tacos" }] },
];
const now = new Date("2026-11-14T20:00:00Z");

test("one event per dated, timed, open stop", () => {
  assert.equal(calendarEventCount(days), 2);
  const ics = buildIcs({ days, destination: "San Diego", now });
  assert.equal(ics.match(/BEGIN:VEVENT/g).length, 2);
  assert.ok(!ics.includes("Closed place"));
  assert.ok(!ics.includes("Undated"));
});

test("events use local floating times at the destination, with text escaped", () => {
  const ics = buildIcs({ days, destination: "San Diego", now });
  assert.ok(ics.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n"));
  assert.ok(ics.endsWith("END:VCALENDAR\r\n"));
  assert.ok(ics.includes("DTSTART:20261218T090000\r\n"));
  assert.ok(ics.includes("DTEND:20261218T130000\r\n"));
  assert.ok(ics.includes("SUMMARY:Coronado Beach\r\n"));
  assert.ok(ics.includes("DESCRIPTION:Sand\\, surf\\; bring hats\r\n"));
  assert.ok(ics.includes("LOCATION:Ocean Blvd\\, Coronado\\, CA\r\n"));
  assert.ok(ics.includes("DTSTAMP:20261114T200000Z\r\n"));
});

test("a stop that ends after midnight ends on the next day", () => {
  const ics = buildIcs({ days, destination: "San Diego", now });
  assert.ok(ics.includes("DTSTART:20261219T233000\r\n"));
  assert.ok(ics.includes("DTEND:20261220T003000\r\n"));
});

test("every event has a unique id and no line is longer than 75 bytes", () => {
  const long = [{ date: "2026-12-18", scheduled: [{ name: "A".repeat(200), scheduledStart: "9:00 AM", scheduledEnd: "10:00 AM" }] }];
  const ics = buildIcs({ days: [...days, ...long], destination: "San Diego", now });
  const uids = ics.match(/UID:.+/g);
  assert.equal(new Set(uids).size, uids.length);
  for (const line of ics.split("\r\n")) assert.ok(Buffer.byteLength(line) <= 75, line);
});

test("two different plans on the same dates do not share event ids", () => {
  const plan = (name) => [{ date: "2026-12-18", scheduled: [{ name, scheduledStart: "9:00 AM", scheduledEnd: "10:00 AM" }] }];
  const uid = (ics) => ics.match(/UID:(.+)\r\n/)[1];
  const beach = uid(buildIcs({ days: plan("Beach"), destination: "San Diego", now }));
  assert.notEqual(beach, uid(buildIcs({ days: plan("Zoo"), destination: "San Diego", now })));
  assert.notEqual(beach, uid(buildIcs({ days: plan("Beach"), destination: "Maui", now })));
  assert.equal(beach, uid(buildIcs({ days: plan("Beach"), destination: "San Diego", now })), "the same plan exports the same ids");
  assert.match(beach, /^[A-Za-z0-9-]+@sproutroute\.app$/);
});

test("file name comes from the destination", () => {
  assert.equal(icsFilename("San Diego, California"), "sproutroute-san-diego-california.ics");
  assert.equal(icsFilename(""), "sproutroute-trip.ics");
});
