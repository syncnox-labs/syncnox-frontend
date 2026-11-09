const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const ts = require("typescript");
const source = fs.readFileSync(path.join(__dirname, "../app/route/_components/routeWaiting.utils.ts"), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const utils = {};
new Function("exports", compiled)(utils);
const { sameWaitingRoute, waitingMergeCandidates, waitingMergeButtonLayout, waitingPlanIssue } = utils;

test("cross-plan trips show the actual merge limitation instead of a stale-trip error", () => {
  const routes = [{ ...trip("17:12", "17:55"), team_member_name: "Sablond" },
    { ...trip("14:57", "16:34"), team_member_name: "Sablond", source_optimization_id: 259, source_route_name: "Nov 5 AM" }];
  assert.match(waitingPlanIssue(routes, 261, { routeIndex: 1, mergeRouteIndex: 0 }), /different plans/);
  assert.match(waitingPlanIssue(routes, 261, { routeIndex: 1, mergeRouteIndex: 0 }), /not supported/);
  assert.match(waitingPlanIssue(routes, 261, { routeIndex: 1, afterStopIndex: 0 }), /Nov 5 AM/);
  assert.equal(waitingPlanIssue(routes, 261, { routeIndex: 0, afterStopIndex: 0 }), null);
  assert.equal(waitingPlanIssue(routes, 261, { routeIndex: 0, mergeRouteIndex: 5 }), null);
});

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

test("waiting editor accepts live progress overlays and context-enriched route IDs", () => {
  const saved = trip("06:00", "07:00");
  saved.stops.splice(1, 0, { job_id: 42, stop_type: "pickup", arrival_time: "2026-10-24T06:30:00" });
  const displayed = structuredClone(saved);
  Object.assign(displayed.stops[1], { stop_id: 91, status: "pending", actual_arrival_time: null,
    actual_departure_time: null, actual_timezone: "America/Toronto" });
  assert.equal(sameWaitingRoute(displayed, { ...saved, route_id: 12 }), true);
  displayed.stops[1].status = "completed";
  displayed.stops[1].actual_departure_time = "2026-10-24T10:32:00+00:00";
  assert.equal(sameWaitingRoute(displayed, saved), true);
});

test("waiting editor compares stop values independently of JSON key order", () => {
  const saved = trip("06:00", "07:00");
  const displayed = { ...saved, stops: saved.stops.map(stop => Object.fromEntries(Object.entries(stop).reverse())) };
  assert.equal(sameWaitingRoute(displayed, saved), true);
});

test("waiting editor rejects real planning changes and missing routes", () => {
  const saved = { ...trip("06:00", "07:00"), route_id: 12 };
  saved.stops.splice(1, 0, { job_id: 42, stop_type: "pickup", arrival_time: "2026-10-24T06:30:00",
    latitude: 45, longitude: -73, waiting_time_to_next_stop_seconds: 120 });
  for (const patch of [{ job_id: 43 }, { stop_type: "dropoff" }, { arrival_time: "2026-10-24T06:31:00" },
    { latitude: 46 }, { waiting_time_to_next_stop_seconds: 180 }]) {
    const changed = structuredClone(saved);
    Object.assign(changed.stops[1], patch);
    assert.equal(sameWaitingRoute(saved, changed), false);
  }
  for (const patch of [{ route_id: 13 }, { team_member_id: 2 }, { vehicle_id: 2 }, { leg: "RETURN" },
    { stops: saved.stops.toReversed() }, { stops: saved.stops.slice(1) }]) {
    assert.equal(sameWaitingRoute(saved, { ...saved, ...patch }), false);
  }
  assert.equal(sameWaitingRoute(undefined, saved), false);
  assert.equal(sameWaitingRoute(saved, undefined), false);
});
