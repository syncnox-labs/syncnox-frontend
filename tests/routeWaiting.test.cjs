const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const ts = require("typescript");
const source = fs.readFileSync(path.join(__dirname, "../app/route/_components/routeWaiting.utils.ts"), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const utils = {};
new Function("exports", compiled)(utils);
const { waitingMergeCandidates, waitingMergeButtonLayout } = utils;

test("long gaps use a small centered merge button instead of a full-gap overlay", () => {
  const layout = waitingMergeButtonLayout(100, 1500);
  assert.equal(layout.width, 24);
  assert.equal(layout.left + layout.width / 2, 800);
});

test("merge controls clear the home icon when a nearby pickup shifts it left", () => {
  // The home at 500 is displayed at 474 to leave room for the pickup at 510.
  const layout = waitingMergeButtonLayout(100, 500, 510);
  assert.ok(layout.left >= 122);
  assert.ok(layout.left + layout.width <= 452);
  // A nominal gap that looks wide enough can become too small after that shift.
  assert.equal(waitingMergeButtonLayout(430, 500, 510), null);
});

test("narrow and touching gaps do not place controls over endpoint icons at any zoom", () => {
  for (const pixelsPerMinute of [3, 4, 6, 8, 12]) {
    assert.equal(waitingMergeButtonLayout(100, 100 + pixelsPerMinute * 2), null);
    assert.equal(waitingMergeButtonLayout(100, 100, 100), null);
  }
  assert.equal(waitingMergeButtonLayout(NaN, 500), null);
});

function trip(start, end, driver = 1, vehicle = 1) {
  return { team_member_id: driver, vehicle_id: vehicle, stops: [
    { stop_type: "depot_start", arrival_time: `2026-10-24T${start}:00` },
    { stop_type: "depot_end", arrival_time: `2026-10-24T${end}:00` },
  ] };
}

test("merge options include only immediately adjacent trips for the same driver and vehicle", () => {
  const routes = [trip("06:00", "07:00"), trip("08:00", "09:00"), trip("10:00", "11:00"),
    trip("12:00", "13:00"), trip("08:00", "09:00", 2)];
  assert.deepEqual(waitingMergeCandidates(routes, 1), [0, 2]);
  assert.deepEqual(waitingMergeCandidates(routes, 0), [1]);
  assert.deepEqual(waitingMergeCandidates(routes, 4), []);
});

test("a vehicle mismatch, overlap, or pending route prevents a merge option", () => {
  assert.deepEqual(waitingMergeCandidates([trip("06:00", "07:00"), trip("08:00", "09:00", 1, 2)], 0), []);
  assert.deepEqual(waitingMergeCandidates([trip("06:00", "08:00"), trip("07:00", "09:00")], 0), []);
  assert.deepEqual(waitingMergeCandidates([trip("06:00", "07:00"), { ...trip("08:00", "09:00"), needs_optimization: true }], 0), []);
  assert.deepEqual(waitingMergeCandidates([], 0), []);
});

test("consecutive overnight routes retain their chronological order", () => {
  const next = trip("00:00", "01:00");
  next.stops.forEach(stop => { stop.arrival_time = stop.arrival_time.replace("2026-10-24", "2026-10-25"); });
  assert.deepEqual(waitingMergeCandidates([next, trip("22:00", "23:00")], 1), [0]);
});
