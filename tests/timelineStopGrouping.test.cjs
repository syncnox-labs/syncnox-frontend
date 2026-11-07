const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

function load(name, imports = {}) {
  const source = fs.readFileSync(path.join(__dirname, "../app/route/_components", name), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const exports = {};
  new Function("exports", "require", compiled)(exports, name => imports[name]);
  return exports;
}
const helpers = load("stopDisplay.utils.ts", { "./leaderRoute.utils": load("leaderRoute.utils.ts") });
const { groupStopsByLocation } = helpers;

const stop = { leg: "GO", stop_type: "pickup", latitude: 45.5, longitude: -73.5,
  arrival_time: "2026-09-04T05:00:00", job_id: 1 };

test("one physical visit groups passengers and preserves raw indices", () => {
  const stops = [stop, { ...stop, job_id: 2 }, { ...stop, longitude: -73.6, job_id: 3 }];
  const groups = groupStopsByLocation(stops);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].candidateCount, 2);
  assert.deepEqual(groups[0].rawStops, stops.slice(0, 2));
  assert.equal(groups[1].firstRawIndex, 2);
});

test("visits at different times or legs never disappear into one marker", () => {
  for (const next of [
    { ...stop, arrival_time: "2026-09-04T15:00:00" },
    { ...stop, arrival_time: "2026-09-05T05:00:00" },
    { ...stop, leg: "RETURN" },
  ]) assert.equal(groupStopsByLocation([stop, next]).length, 2);
});

test("unknown arrival times are not assumed to be one visit", () => {
  const unknown = { ...stop, arrival_time: undefined };
  assert.equal(groupStopsByLocation([unknown, { ...unknown }]).length, 2);
});

test("a mixed visit has one number and preserves pickup/drop-off raw indices", () => {
  const pickup = { ...stop, leg: "RETURN", arrival_time: "2026-11-06T00:00:00", address_formatted: "Pickup address" };
  const dropoff = { ...pickup, stop_type: "dropoff", address_formatted: "Drop-off address" };
  const stops = [
    { ...stop, stop_type: "depot_start" },
    stop,
    { ...stop, stop_type: "dropoff", longitude: -73.6 },
    pickup, dropoff,
    { ...pickup, arrival_time: "2026-11-06T01:00:00", job_id: 2 },
  ];
  const { groups, byRawIndex } = helpers.getRouteStopDisplay({ stops });
  assert.deepEqual(groups.map(group => group.displayStopNumber), [0, 1, 2, 3, 4]);
  const visit = byRawIndex.get(3);
  assert.equal(visit, byRawIndex.get(4));
  assert.equal(visit.hasPickup, true);
  assert.equal(visit.hasDropoff, true);
  assert.equal(visit.candidateCount, 1, "the same booking is not counted twice");
  assert.deepEqual(helpers.getStopTooltipStops(visit), [dropoff, pickup]);
  assert.deepEqual(visit.rawStops, [pickup, dropoff], "hover order never changes operational order");
  assert.deepEqual(stops.slice(3, 5), [pickup, dropoff]);
});

test("drop-off aliases and multiple passengers share one stable hover order", () => {
  const stops = [stop, { ...stop, job_id: 2, stop_type: "drop_off" },
    { ...stop, job_id: 3 }, { ...stop, job_id: 4, stop_type: "dropoff" }];
  const [visit] = groupStopsByLocation(stops);
  assert.equal(visit.candidateCount, 4);
  assert.deepEqual(helpers.getStopTooltipStops(visit).map(stop => stop.job_id), [2, 4, 1, 3]);
  assert.deepEqual(visit.rawStops, stops);
});

test("mixed visits respect time, leg, coordinates, depot boundaries and intervening visits", () => {
  for (const next of [
    { ...stop, stop_type: "dropoff", arrival_time: "2026-09-04T05:01:00" },
    { ...stop, stop_type: "dropoff", leg: "RETURN" },
    { ...stop, stop_type: "dropoff", latitude: 45.6 },
    { ...stop, stop_type: "depot_start" },
    { ...stop, stop_type: "depot_end" },
    { ...stop, stop_type: "break" },
    { ...stop, stop_type: "job" },
  ]) assert.equal(groupStopsByLocation([stop, next]).length, 2);
  for (const latitude of [undefined, null, NaN, Infinity]) {
    const invalid = { ...stop, latitude };
    assert.equal(groupStopsByLocation([invalid, { ...invalid, stop_type: "dropoff" }]).length, 2);
  }
  assert.equal(groupStopsByLocation([stop, { ...stop, longitude: -74 }, { ...stop, stop_type: "dropoff" }]).length, 3);
});
