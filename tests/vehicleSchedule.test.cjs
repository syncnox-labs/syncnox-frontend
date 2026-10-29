const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const root = path.join(__dirname, "../app/route/_components");

function load(file, imports = {}) {
  const compiled = ts.transpileModule(fs.readFileSync(path.join(root, file), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const result = {};
  new Function("exports", "require", compiled)(result, name => name in imports ? imports[name] : require(name));
  return result;
}
const helpers = load("vehicleSchedule.utils.ts");
const { buildVehicleSchedule, filterVehicleSchedule } = helpers;
const vehicle = (id, name) => ({ id, name, license_plate: `ABC-${id}`, team_member_id: 999,
  load_constraints: [{ constraint_type: "capacity", unit: "seats", max_value: 14 }] });
const stop = (stop_type, time, job_id = null, extra = {}) => ({ stop_type, job_id,
  arrival_time: time ? `2026-10-23T${time}:00` : null, ...extra });
const trip = (id, start = "05:30", end = "09:00") => [stop("depot_start", start),
  stop("pickup", start, id), stop("dropoff", end, id), stop("depot_end", end)];
const route = (overrides = {}) => ({ vehicle_id: 3, vehicle_name: "VAN 3", vehicle_capacity: 14,
  team_member_id: 3, team_member_name: "Alliance Driver 3", leg: "GO", stops: trip(1), ...overrides });

test("groups by actual trip vehicle and lists different drivers in time order", () => {
  const routes = [route({ team_member_id: 14, team_member_name: "Alliance Driver 14", stops: trip(2, "15:00", "18:00") }), route()];
  const fleet = [vehicle(3, "Fleet VAN 3"), vehicle(4, "VAN 4")];
  const before = JSON.stringify({ routes, fleet });
  const groups = buildVehicleSchedule(routes, fleet);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].name, "VAN 3");
  assert.equal(groups[0].plate, "ABC-3");
  assert.deepEqual(groups[0].assignments.map(a => [a.driverName, a.routeIndex, a.jobCount]), [
    ["Alliance Driver 3", 1, 1], ["Alliance Driver 14", 0, 1],
  ]);
  assert.equal(groups[1].assignments.length, 0);
  assert.equal(JSON.stringify({ routes, fleet }), before);
});

test("one driver can use different vehicles without merging their assignments", () => {
  const groups = buildVehicleSchedule([route(), route({ vehicle_id: 4, vehicle_name: "Car 4", stops: trip(2, "15:00", "18:00") })], []);
  assert.deepEqual(groups.map(g => [g.vehicleId, g.assignments.length]), [[4, 1], [3, 1]]);
});

test("splits repeated home/finish boundaries without claiming the intervening gap", () => {
  const stops = [...trip(1), ...trip(2, "15:00", "18:00")];
  const assignments = buildVehicleSchedule([route({ leg: "COMBINED", stops })], [])[0].assignments;
  assert.equal(assignments.length, 2);
  assert.deepEqual(assignments.map(a => a.startStopIndex), [0, 4]);
  assert.equal(Date.parse(assignments[0].end), Date.parse("2026-10-23T09:00:00"));
  assert.equal(Date.parse(assignments[1].start), Date.parse("2026-10-23T15:00:00"));
});

test("unbounded legacy GO/RETURN legs remain separate and keep original stop indices", () => {
  const stops = [stop("pickup", "06:00", 1, { leg: "GO" }), stop("dropoff", "07:00", 1, { leg: "GO" }),
    stop("pickup", "16:00", 1, { leg: "RETURN" }), stop("dropoff", "17:00", 1, { leg: "RETURN", service_duration_seconds: 120 })];
  const assignments = buildVehicleSchedule([route({ leg: "COMBINED", stops })], [])[0].assignments;
  assert.deepEqual(assignments.map(a => [a.leg, a.startStopIndex, a.jobCount]), [["GO", 0, 1], ["RETURN", 2, 1]]);
  assert.equal(Date.parse(assignments[1].end), Date.parse("2026-10-23T17:02:00"));
});

test("preserves overnight dates, linked plan identity and home travel", () => {
  const stops = [stop("depot_start", "23:00"), stop("pickup", "23:30", 1),
    { job_id: 1, stop_type: "dropoff", arrival_time: "2026-10-24T00:30:00" },
    { job_id: null, stop_type: "depot_end", arrival_time: "2026-10-24T01:00:00" }];
  const [assignment] = buildVehicleSchedule([route({ stops, source_optimization_id: 99, source_route_name: "Evening plan" })], [])[0].assignments;
  assert.equal(assignment.start, "2026-10-23T23:00:00");
  assert.equal(Date.parse(assignment.end), Date.parse("2026-10-24T01:00:00"));
  assert.equal(assignment.planName, "Evening plan");
});

test("keeps missing vehicle assignments visible and avoids inventing times", () => {
  const groups = buildVehicleSchedule([route({ vehicle_id: null, vehicle_name: null,
    stops: [stop("pickup", null, 1), stop("dropoff", "08:00", 1)] })], []);
  assert.equal(groups[0].name, "Vehicle not assigned");
  assert.equal(groups[0].vehicleId, null);
  assert.equal(groups[0].assignments[0].start, null);
  assert.equal(groups[0].assignments[0].end, null);
  assert.equal(groups[0].assignments[0].startStopIndex, 1);
  const backward = buildVehicleSchedule([route({ stops: [stop("pickup", "09:00", 1), stop("dropoff", "08:00", 1)] })], [])[0];
  assert.equal(backward.assignments[0].end, null);
});

test("empty driver rows do not create scheduled vehicle assignments", () => {
  const groups = buildVehicleSchedule([route({ stops: [] }), route({ stops: [stop("depot_start", "05:00"), stop("depot_end", "18:00")] })], [vehicle(3, "VAN 3")]);
  assert.equal(groups[0].assignments.length, 0);
  assert.equal(filterVehicleSchedule(groups, "", "scheduled").length, 0);
  assert.equal(filterVehicleSchedule(groups, "", "all").length, 1);
});

test("search matches plates, vehicle names and drivers, while preserving the entire vehicle schedule", () => {
  const groups = buildVehicleSchedule([route(), route({ team_member_id: 14, team_member_name: "Other Driver", stops: trip(2) })], [vehicle(3, "VAN 3"), vehicle(4, "VAN 4")]);
  for (const query of ["van 3", "abc-3", "other driver", "  VAN   3  "]) {
    const result = filterVehicleSchedule(groups, query, "all");
    assert.equal(result.length, 1, query);
    assert.equal(result[0].assignments.length, 2);
  }
  assert.equal(filterVehicleSchedule(groups, "van 4", "all").length, 1);
  assert.equal(filterVehicleSchedule(groups, "missing", "all").length, 0);
});

test("searching VAN 3 matches VAN 30 but excludes VAN 1 when other fields contain 3", () => {
  const groups = buildVehicleSchedule([
    route({ vehicle_id: 13, vehicle_name: "VAN 1", team_member_name: "Alliance Driver 3", source_route_name: "route - 3" }),
    route(),
    route({ vehicle_id: 30, vehicle_name: "VAN 30", team_member_name: "Alliance Driver 30" }),
  ], [vehicle(13, "VAN 1"), vehicle(3, "VAN 3"), vehicle(30, "VAN 30")]);
  for (const scope of ["scheduled", "all"]) {
    assert.deepEqual(filterVehicleSchedule(groups, "van 3", scope).map(group => group.name), ["VAN 3", "VAN 30"]);
    assert.deepEqual(filterVehicleSchedule(groups, "abc-3", scope).map(group => group.name), ["VAN 3", "VAN 30"]);
    assert.deepEqual(filterVehicleSchedule(groups, "Alliance Driver 3", scope).map(group => group.name), ["VAN 1", "VAN 3", "VAN 30"]);
  }
  assert.equal(filterVehicleSchedule(groups, "VAN route", "all").length, 0);
  assert.equal(filterVehicleSchedule(groups, "van .", "all").length, 0);
  assert.equal(filterVehicleSchedule(groups, "  ", "all").length, groups.length);
});

test("reflects current assignments after live changes and marks pending schedules", () => {
  const initial = route({ stops: trip(1).map(s => ({ ...s, is_new: true, needs_optimization: false })) });
  assert.equal(buildVehicleSchedule([initial], [])[0].assignments[0].pending, false);
  const updated = route({ vehicle_id: 9, vehicle_name: "Bus 9", needs_optimization: true });
  const group = buildVehicleSchedule([updated], [])[0];
  assert.equal(group.vehicleId, 9);
  assert.equal(group.assignments[0].pending, true);
});

const Card = load("VehicleAssignments.tsx", { "./vehicleSchedule.utils": helpers }).default;
test("vehicle view exposes searchable assignments, dates and accessible timeline actions", () => {
  const html = renderToStaticMarkup(React.createElement(Card, {
    routes: [route()], vehicles: [vehicle(3, "VAN 3")], loading: false, error: null, onViewTrip() {},
  }));
  for (const label of ["Vehicle assignments", "Search vehicles or drivers", "Filter vehicles", "View VAN 3 trip with Alliance Driver 3 in timeline"]) {
    assert.ok(html.includes(`aria-label="${label}"`));
  }
  assert.match(html, /ABC-3/);
  assert.match(html, /Fri, Oct 23/);
  assert.match(html, /5:30 AM/);
  assert.match(html, /9:00 AM/);
  assert.doesNotMatch(html, /Available|Free/);
});

test("Jobs rename and Vehicles tab preserve the existing mounted timeline and jobs table", () => {
  const source = fs.readFileSync(path.join(root, "OptimizationView.tsx"), "utf8");
  assert.match(source, /value="table" aria-label="Jobs"/);
  assert.match(source, /value="vehicles" aria-label="Vehicles"/);
  assert.match(source, /hidden=\{detailView !== "vehicles"\}/);
  assert.match(source, /onViewTrip=\{handleViewVehicleTrip\}/);
  const tree = ts.createSourceFile("view.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let handler;
  (function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(tree) === "handleViewVehicleTrip") handler = node.initializer.getText(tree);
    ts.forEachChild(node, visit);
  })(tree);
  const events = [];
  const context = { route: { result: { routes: [route()] } },
    ...Object.fromEntries(["setDriverSearch", "setSelectedDrawerJob", "setDetailView", "handleFocusRoute", "setSelectedMarkerId"].map(name => [name, value => events.push([name, value])])),
    mapViewState: "normal", handleToggleFullscreen: () => {}, requestAnimationFrame: fn => fn(),
  };
  const compiled = ts.transpileModule(`const handler = ${handler}`, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
  const open = new Function(...Object.keys(context), compiled + "; return handler;")(...Object.values(context));
  open({ routeIndex: 0, startStopIndex: 2 });
  assert.deepEqual(events, [["setDriverSearch", ""], ["setSelectedDrawerJob", null], ["setDetailView", "timeline"],
    ["handleFocusRoute", 0], ["setSelectedMarkerId", null], ["setSelectedMarkerId", "0-2"]]);
  events.length = 0;
  open({ routeIndex: 99, startStopIndex: 0 });
  assert.deepEqual(events, []);
});
