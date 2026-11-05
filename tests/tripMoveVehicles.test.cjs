const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
function load(file, dependencies) {
  const source = fs.readFileSync(path.join(__dirname, "..", file), "utf8");
  const output = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const exports = {};
  new Function("exports", "require", output)(exports, name => name in dependencies ? dependencies[name] : require(name));
  return exports;
}
const selection = { sourceRouteIndex: 0, sourceDriverId: 173, sourceLeg: "COMBINED", startStopIndex: 0,
  stops: [{ job_id: null, stop_type: "depot_start", arrival_time: "2026-10-24T05:57:00" }] };

test("fleet availability preview and move send the same trip snapshot with explicit vehicle selection", async () => {
  const calls = [];
  const api = load("apis/routes.api.ts", { "@/config/apiClient.config": {
    post: async (...args) => { calls.push(args); return { data: {} }; },
  } });
  const body = { start_stop_index: 0, target_route_index: 1, expected_target_vehicle_id: null, expected_stops: selection.stops };
  await api.getMoveTripVehicleOptions(251, 5, body);
  await api.moveRouteTrip(251, 5, { ...body, vehicle_id: 30 });
  assert.deepEqual(calls, [
    ["optimization/requests/251/routes/5/move-trip-vehicle-options", body],
    ["optimization/requests/251/routes/5/move-trip", { ...body, vehicle_id: 30 }],
  ]);
});

test("an empty destination uses a null vehicle snapshot without requiring driver configuration", async () => {
  const { tripMoveRequest } = load("app/route/_components/tripMoveRequest.utils.ts", { "@/apis/routes.api": {} });
  const routes = [{ team_member_id: 173 }, { team_member_id: 177, vehicle_id: null, leg: "COMBINED", stops: [] }];
  const request = await tripMoveRequest(252, routes, selection, 1);
  assert.equal(request.optimizationId, 252);
  assert.equal(request.routeIndex, 0);
  assert.equal(request.payload.expected_target_vehicle_id, null);
  assert.equal(request.payload.expected_target_driver_id, 177);
  assert.equal(request.payload.target_route_index, 1);
  assert.deepEqual(request.payload.expected_stops, selection.stops);
});

test("Hovsep's projected trip resolves to its owning plan and Pressoir's stored empty row", async () => {
  const calls = [];
  const { tripMoveRequest } = load("app/route/_components/tripMoveRequest.utils.ts", { "@/apis/routes.api": {
    getOptimizationRequest: async id => {
      calls.push(id);
      return { result: { routes: [{ team_member_id: 177, vehicle_id: null, leg: "COMBINED" }] } };
    },
  } });
  const routes = [{ team_member_id: 173, source_optimization_id: 251, source_route_index: 5,
    source_stop_range: [14, 28], source_leg: "COMBINED", leg: "RETURN" },
    { team_member_id: 177, vehicle_id: 99, leg: "RETURN" }];
  const request = await tripMoveRequest(252, routes, { ...selection, sourceLeg: "RETURN", startStopIndex: 2 }, 1);
  assert.deepEqual(calls, [251]);
  assert.equal(request.optimizationId, 251);
  assert.equal(request.routeIndex, 5);
  assert.equal(request.payload.start_stop_index, 16);
  assert.equal(request.payload.expected_source_leg, "COMBINED");
  assert.equal(request.payload.target_route_index, 0);
  assert.equal(request.payload.expected_target_vehicle_id, null);
  assert.equal(request.payload.expected_target_leg, "COMBINED");
});

test("a projected destination resolves to the driver's own row in the source plan", async () => {
  const { tripMoveRequest } = load("app/route/_components/tripMoveRequest.utils.ts", { "@/apis/routes.api": {} });
  const routes = [{ team_member_id: 173 }, { team_member_id: 177, vehicle_id: null, leg: "COMBINED" },
    { team_member_id: 177, vehicle_id: 99, source_optimization_id: 250, leg: "RETURN" }];
  const request = await tripMoveRequest(252, routes, selection, 2);
  assert.equal(request.payload.target_route_index, 1);
  assert.equal(request.payload.expected_target_vehicle_id, null);
});

const Null = () => null;
test("vehicle selector explains availability and stays disabled while checking vehicles", () => {
  const Modal = load("app/route/_components/MoveTripModal.tsx", {
    "@/apis/routes.api": {}, "@/store/optimization.store": {}, "./tripMoveRequest.utils": {},
    antd: {
      Modal: ({ title, children, footer }) => React.createElement("section", null, React.createElement("h1", null, title), children, footer),
      Button: ({ children, disabled }) => React.createElement("button", { disabled }, children),
      Spin: Null, Input: Null, Empty: Null, Alert: Null,
    },
  }).default;
  const html = renderToStaticMarkup(React.createElement(Modal, {
    optimizationId: 252, routes: [{ team_member_name: "Hovsep TERZIAN" }, { team_member_name: "Pressoir Augustin", vehicle_id: null }],
    selection, targetIndex: 1, onClose() {}, onBusyChange() {}, onSuccess() {},
  }));
  assert.match(html, /Hovsep TERZIAN/);
  assert.match(html, /Pressoir Augustin/);
  assert.match(html, /Passenger times and stop order stay unchanged/);
  assert.match(html, /Checking vehicles and driver availability/);
  assert.match(html, /disabled=""/);
});
