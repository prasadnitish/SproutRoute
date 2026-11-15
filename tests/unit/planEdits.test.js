import test from "node:test";
import assert from "node:assert/strict";
import {
  parseClock, formatClock, canMoveItem, moveItem, moveItemToDay, removeItem, addBlockAfter,
} from "../../src/frontend/src/utils/planEdits.js";

const item = (name, start, end, extra = {}) => ({ name, scheduledStart: start, scheduledEnd: end, ...extra });
const makeDays = () => [
  {
    date: "2026-12-18",
    scheduled: [
      item("Beach", "9:00 AM", "11:00 AM"),
      item("Lunch", "11:30 AM", "12:30 PM", { isMeal: true }),
      item("Museum", "1:00 PM", "2:00 PM"),
    ],
  },
  { date: "2026-12-19", scheduled: [item("Zoo", "10:00 AM", "1:00 PM")] },
  { date: "2026-12-20", scheduled: [] },
];
const names = (day) => day.scheduled.map((a) => a.name);
const times = (day) => day.scheduled.map((a) => `${a.scheduledStart}-${a.scheduledEnd}`);

test("clock strings round-trip in the scheduler's format", () => {
  assert.equal(parseClock("9:00 AM"), 540);
  assert.equal(parseClock("12:00 AM"), 0);
  assert.equal(parseClock("12:30 PM"), 750);
  assert.equal(parseClock("nonsense"), null);
  assert.equal(parseClock(null), null);
  assert.equal(formatClock(540), "9:00 AM");
  assert.equal(formatClock(750), "12:30 PM");
  assert.equal(formatClock(0), "12:00 AM");
});

test("moving a stop later swaps it with the next one and keeps durations and gaps", () => {
  const days = makeDays();
  const next = moveItem(days, 0, 0, 1);
  assert.deepEqual(names(next[0]), ["Lunch", "Beach", "Museum"]);
  assert.deepEqual(times(next[0]), ["9:00 AM-10:00 AM", "10:30 AM-12:30 PM", "1:00 PM-2:00 PM"]);
  assert.deepEqual(names(days[0]), ["Beach", "Lunch", "Museum"], "the input is not mutated");
});

test("moving earlier works the same way, and the ends of the day cannot be passed", () => {
  const days = makeDays();
  assert.deepEqual(names(moveItem(days, 0, 2, -1)[0]), ["Beach", "Museum", "Lunch"]);
  assert.equal(canMoveItem(days, 0, 0, -1), false);
  assert.equal(canMoveItem(days, 0, 2, 1), false);
  assert.equal(canMoveItem(days, 0, 1, 1), true);
  assert.equal(moveItem(days, 0, 0, -1), days);
});

test("moving to another day appends after that day's last stop and keeps the duration", () => {
  const next = moveItemToDay(makeDays(), 0, 2, 1);
  assert.deepEqual(names(next[0]), ["Beach", "Lunch"]);
  assert.deepEqual(names(next[1]), ["Zoo", "Museum"]);
  assert.deepEqual(times(next[1]), ["10:00 AM-1:00 PM", "1:15 PM-2:15 PM"]);
});

test("moving to an empty day keeps the stop's own times", () => {
  const next = moveItemToDay(makeDays(), 0, 0, 2);
  assert.deepEqual(times(next[2]), ["9:00 AM-11:00 AM"]);
});

test("moving to the same day or a missing day changes nothing", () => {
  const days = makeDays();
  assert.equal(moveItemToDay(days, 0, 0, 0), days);
  assert.equal(moveItemToDay(days, 0, 0, 9), days);
});

test("removing a stop leaves the other stops' times alone", () => {
  const next = removeItem(makeDays(), 0, 1);
  assert.deepEqual(names(next[0]), ["Beach", "Museum"]);
  assert.deepEqual(times(next[0]), ["9:00 AM-11:00 AM", "1:00 PM-2:00 PM"]);
});

test("a block added after a stop starts when it ends and pushes later stops back", () => {
  const next = addBlockAfter(makeDays(), 0, 0, { title: "  Nap  ", durationMinutes: 60 });
  assert.deepEqual(names(next[0]), ["Beach", "Nap", "Lunch", "Museum"]);
  assert.deepEqual(times(next[0]), [
    "9:00 AM-11:00 AM", "11:00 AM-12:00 PM", "12:30 PM-1:30 PM", "2:00 PM-3:00 PM",
  ]);
  assert.equal(next[0].scheduled[1].isCustom, true);
});

test("a block needs a title and a sensible length", () => {
  const days = makeDays();
  assert.equal(addBlockAfter(days, 0, 0, { title: "   ", durationMinutes: 60 }), days);
  assert.equal(addBlockAfter(days, 0, 0, { title: "Nap", durationMinutes: 0 }), days);
  assert.equal(addBlockAfter(days, 0, 0, { title: "Nap", durationMinutes: 5000 }), days);
});

test("an edit that would push a stop past midnight is refused", () => {
  const late = () => [
    { date: "2026-12-18", scheduled: [item("Dinner", "7:00 PM", "9:00 PM"), item("Walk", "10:30 PM", "11:15 PM")] },
    { date: "2026-12-19", scheduled: [item("Show", "9:00 PM", "11:50 PM")] },
  ];
  const days = late();
  assert.equal(addBlockAfter(days, 0, 0, { title: "Movie", durationMinutes: 120 }), days, "Walk would start at 12:30 AM");
  assert.notEqual(addBlockAfter(days, 0, 0, { title: "Coffee", durationMinutes: 30 }), days);
  assert.equal(moveItemToDay(days, 0, 0, 1), days, "Dinner would start after midnight on day 2");
  const swapped = moveItem(days, 0, 0, 1);
  assert.deepEqual(swapped[0].scheduled.map((a) => a.scheduledStart), ["7:00 PM", "9:15 PM"]);
});

test("a stop may still end after midnight, as generated plans sometimes do", () => {
  const days = [{ date: "2026-12-18", scheduled: [item("Dinner", "9:00 PM", "10:00 PM"), item("Party", "10:30 PM", "12:30 AM")] }];
  const next = addBlockAfter(days, 0, 0, { title: "Walk", durationMinutes: 30 });
  assert.deepEqual(next[0].scheduled.map((a) => `${a.scheduledStart}-${a.scheduledEnd}`),
    ["9:00 PM-10:00 PM", "10:00 PM-10:30 PM", "11:00 PM-1:00 AM"]);
});

test("stops without times are moved but not given invented times", () => {
  const days = [{ date: "2026-12-18", scheduled: [item("A", "9:00 AM", "10:00 AM"), item("B", null, null), item("C", "11:00 AM", "12:00 PM")] }];
  const next = moveItem(days, 0, 0, 1);
  assert.deepEqual(names(next[0]), ["B", "A", "C"]);
  assert.equal(next[0].scheduled[0].scheduledStart, null);
  assert.equal(next[0].scheduled[1].scheduledStart, "9:00 AM");
});
