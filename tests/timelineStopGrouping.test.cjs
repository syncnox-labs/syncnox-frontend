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
