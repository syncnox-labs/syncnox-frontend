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
