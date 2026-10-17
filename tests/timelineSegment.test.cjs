const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const compiled = ts.transpileModule(fs.readFileSync(path.join(__dirname, "../app/route/_components/timelineSegment.utils.ts"), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const helpers = {};
new Function("exports", compiled)(helpers);
const { getTimelineSegment } = helpers;
const start = { arrival_time: "2026-09-29T23:30:00" };
const next = { arrival_time: "2026-09-30T00:30:00" };

test("missing distance does not turn elapsed travel into waiting", () => {
  const result = getTimelineSegment(start, next);
  assert.equal(result.elapsedSeconds, 3600);
  assert.equal(result.distanceMeters, null);
  assert.equal(result.waitingSeconds, null);
  assert.equal(result.isWaiting, false);
});
test("zero distance alone does not imply waiting or ignore boarding", () => {
  assert.equal(getTimelineSegment({ ...start, distance_to_next_stop_meters: 0 }, next).isWaiting, false);
  assert.equal(getTimelineSegment({ ...start, travel_time_to_next_stop_seconds: 0, service_duration_seconds: 3600 }, next).isWaiting, false);
});
test("elapsed time separates travel, service and true waiting across midnight", () => {
  const result = getTimelineSegment({ ...start, travel_time_to_next_stop_seconds: 1800, service_duration_seconds: 300 }, next);
  assert.equal(result.waitingSeconds, 1500);
  assert.equal(result.isWaiting, false);
});
test("actual stationary waiting uses only the wait duration", () => {
  const result = getTimelineSegment({ ...start, travel_time_to_next_stop_seconds: 0, service_duration_seconds: 300, waiting_time_to_next_stop_seconds: 3300 }, next);
  assert.equal(result.isWaiting, true);
  assert.equal(result.waitingSeconds, 3300);
});
test("invalid or backward timestamps never create negative segments", () => {
  assert.equal(getTimelineSegment(next, start).elapsedSeconds, 0);
  assert.equal(getTimelineSegment({}, next).elapsedSeconds, 0);
});
test("a valid segment longer than three hours is not treated as a shift gap", () => {
  assert.equal(getTimelineSegment(start, { arrival_time: "2026-09-30T04:30:00" }).elapsedSeconds, 18000);
});

test("a team leader's workday is work, not travel or idle waiting", () => {
  const result = getTimelineSegment({ ...start, segment_type_to_next: "team_leader_work", travel_time_to_next_stop_seconds: 0, service_duration_seconds: 0 }, { arrival_time: "2026-09-30T07:30:00" });
  assert.equal(result.isWorking, true);
  assert.equal(result.elapsedSeconds, 8 * 3600);
  assert.equal(result.waitingSeconds, 0);
  assert.equal(result.isWaiting, false);
});

test("driver 1's 380-minute GO/RETURN gap cannot inherit the terminal zero", () => {
  const result = getTimelineSegment({
    leg: "GO", arrival_time: "2026-09-04T06:40:00", latitude: 45.5278707, longitude: -73.6122252,
    distance_to_next_stop_meters: 0, time_to_next_stop_seconds: 0,
  }, {
    leg: "RETURN", arrival_time: "2026-09-04T13:00:00", latitude: 45.4703015, longitude: -73.7749519,
  });
  assert.equal(result.elapsedSeconds, 380 * 60);
  assert.equal(result.isBetweenTrips, true);
  assert.equal(result.distanceMeters, null);
  assert.equal(result.waitingSeconds, null);
});

test("driver 5's overnight transfer is distinct from a co-located dropoff", () => {
  const stop = {
    leg: "GO", arrival_time: "2026-09-04T05:10:00", latitude: 45.7679916, longitude: -74.0234335,
    distance_to_next_stop_meters: 0, travel_time_to_next_stop_seconds: 0, service_duration_seconds: 0,
  };
  assert.equal(getTimelineSegment(stop, { ...stop }).distanceMeters, 0);
  const result = getTimelineSegment(stop, {
    leg: "RETURN", arrival_time: "2026-09-05T00:30:00", latitude: 45.5669276, longitude: -73.448457,
  });
  assert.equal(result.elapsedSeconds, 1160 * 60);
  assert.equal(result.distanceMeters, null);
  assert.equal(result.travelSeconds, null);
  assert.equal(result.isWaiting, false);
});

test("measured transfer travel stays separate from the long trip gap", () => {
  const result = getTimelineSegment({
    ...start, leg: "GO", segment_type_to_next: "between_trips",
    distance_to_next_stop_meters: 10000, travel_time_to_next_stop_seconds: 900,
    service_duration_seconds: 0, waiting_time_to_next_stop_seconds: 0,
  }, { ...next, leg: "RETURN" });
  assert.equal(result.distanceMeters, 10000);
  assert.equal(result.travelSeconds, 900);
  assert.equal(result.waitingSeconds, 2700);
  assert.equal(result.isBetweenTrips, true);
  assert.equal(result.isWaiting, false);
});
