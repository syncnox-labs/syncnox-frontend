const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const helpers = {};
new Function("exports", ts.transpileModule(fs.readFileSync(path.join(__dirname, "../app/route/_components/jobAddition.utils.ts"), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText)(helpers);

test("newly added survives optimization without leaving the plan Optimization Pending", () => {
  assert.equal(helpers.stopNeedsOptimization({ is_new: true }), true, "legacy pending additions");
  assert.equal(helpers.stopNeedsOptimization({ is_new: true, needs_optimization: true }), true);
  assert.equal(helpers.stopNeedsOptimization({ is_new: true, needs_optimization: false }), false);
  assert.equal(helpers.stopNeedsOptimization({ is_new: true, needs_optimization: false, time_edited: true }), false);
  assert.equal(helpers.stopNeedsOptimization({ is_new: false, is_edited: true }), true);
});

test("booking provenance covers both legs and unassigned jobs after a reload", () => {
  const ids = helpers.getAddedJobIds({ manual_job_creations: { token: { job_ids: [1, 2] } },
    routes: [{ stops: [{ job_id: 3, is_new: true }, { job_id: 5 }] }],
    unassigned_jobs: [{ job_id: 4, is_new: true }] });
  assert.deepEqual([...ids].sort(), [1, 2, 3, 4]);
  assert.deepEqual([...helpers.getAddedJobIds(null)], []);
});

test("pending drivers include additions, edits, reordered routes and staged removals with original indices", () => {
  const trip = (driver, stops, extra = {}) => ({ team_member_id: driver, team_member_name: `Driver ${driver}`, stops, ...extra });
  const routes = [
    trip(1, [{ job_id: 10, is_new: true, needs_optimization: false }]),
    trip(2, [{ job_id: 20, needs_optimization: true }], { leg: "RETURN" }),
    trip(3, [{ job_id: 30 }], { needs_optimization: true }),
    trip(2, [{ job_id: 21, time_edited: true }], { leg: "GO" }),
    trip(4, [{ job_id: 40 }]),
    trip(5, [], { needs_optimization: true }),
  ];
  assert.deepEqual(helpers.getPendingDriverRoutes(routes, new Set([40])), [
    { key: "driver-id-2", driverName: "Driver 2", routeIndices: [1, 3] },
    { key: "driver-id-3", driverName: "Driver 3", routeIndices: [2] },
    { key: "driver-id-4", driverName: "Driver 4", routeIndices: [4] },
  ]);
  assert.deepEqual(helpers.getPendingDriverRoutes(), []);
});

test("optimizing one driver keeps other drivers pending across fresh server snapshots and changed indices", () => {
  const routes = [
    { team_member_id: 1, stops: [{ job_id: 10, needs_optimization: true }] },
    { team_member_id: 2, stops: [{ job_id: 20, is_edited: true }] },
  ];
  assert.equal(helpers.getPendingDriverRoutes(routes).length, 2);
  const refreshed = [{ ...routes[1] }, { ...routes[0], stops: [{ job_id: 10, is_new: true, needs_optimization: false }] }];
  assert.deepEqual(helpers.getPendingDriverRoutes(refreshed), [
    { key: "driver-id-2", driverName: "Driver 2", routeIndices: [0] },
  ]);
  assert.equal(helpers.routeNeedsOptimization(refreshed[1]), false);
});

test("drivers sharing a display name are kept separate and old plans without IDs still have stable fallbacks", () => {
  const route = { team_member_name: "Alliance Driver", stops: [{ job_id: 10, is_new: true }] };
  const pending = helpers.getPendingDriverRoutes([{ ...route, team_member_id: 1 }, { ...route, team_member_id: 2 }, route, { stops: route.stops }]);
  assert.deepEqual(pending.map(driver => driver.routeIndices), [[0], [1], [2], [3]]);
  assert.equal(pending[3].driverName, "Driver 4");
});


test("edited highlights survive optimization without keeping drivers pending", () => {
  const stop = { job_id: 7, is_edited: true, time_edited: true, needs_optimization: false };
  assert.equal(helpers.stopNeedsOptimization(stop), false);
  assert.equal(helpers.routeNeedsOptimization({ stops: [stop] }), false);
  assert.deepEqual(helpers.getPendingDriverRoutes([{ team_member_id: 1, stops: [stop] }]), []);
  assert.equal(helpers.stopNeedsOptimization({ ...stop, needs_optimization: true }), true, "editing again must mark pending");
});
