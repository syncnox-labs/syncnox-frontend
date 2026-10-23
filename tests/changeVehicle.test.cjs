const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

function load(filename, imports) {
  const source = fs.readFileSync(path.join(__dirname, "..", filename), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const exports = {};
  new Function("exports", "require", compiled)(exports, name => name in imports ? imports[name] : require(name));
  return exports;
}

test("vehicle options request the selected trip scope", async () => {
  const calls = [];
  const api = load("apis/routes.api.ts", { "@/config/apiClient.config": {
    get: async (...args) => { calls.push(args); return { data: { vehicles: [] } }; },
  } });
  await api.getRouteVehicleOptions(21, 2);
  await api.getRouteVehicleOptions(21, 0, "driver");
  assert.deepEqual(calls, [
    ["optimization/requests/21/routes/2/vehicle-options", { params: { scope: "route" } }],
    ["optimization/requests/21/routes/0/vehicle-options", { params: { scope: "driver" } }],
  ]);
});

test("changing a vehicle sends stale-screen guards in one request", async () => {
  const calls = [];
  const api = load("apis/routes.api.ts", { "@/config/apiClient.config": {
    post: async (...args) => { calls.push(args); return { data: { success: true } }; },
  } });
  const payload = { vehicle_id: 11, expected_driver_id: 8, expected_vehicle_id: 10, expected_leg: "RETURN", scope: "route" };
  assert.equal((await api.changeRouteVehicle(21, 2, payload)).success, true);
  assert.deepEqual(calls, [["optimization/requests/21/routes/2/change-vehicle", payload]]);
});

test("a vehicle conflict reaches the dialog without an automatic retry", async () => {
  const conflict = new Error("Vehicle is now booked");
  let requests = 0;
  const api = load("apis/routes.api.ts", { "@/config/apiClient.config": {
    post: async () => { requests++; throw conflict; },
  } });
  await assert.rejects(api.changeRouteVehicle(21, 0, {}), error => error === conflict);
  assert.equal(requests, 1);
});

const Null = () => null;
const modal = load("app/route/_components/ChangeVehicleModal.tsx", {
  "@/apis/routes.api": {},
  antd: {
    Modal: ({ title, children, footer }) => React.createElement("section", null, React.createElement("h1", null, title), children, footer),
    Button: ({ children, disabled }) => React.createElement("button", { disabled }, children),
    Select: ({ options }) => React.createElement("select", null, options.map(option => React.createElement("option", { key: option.value }, option.label))),
    Spin: Null, Input: Null, Alert: Null, Empty: Null,
  },
}).default;

test("driver dialog offers a clear choice between trips and all trips", () => {
  const html = renderToStaticMarkup(React.createElement(modal, {
    optimizationId: 21, routeIndex: 0, onClose: () => {}, onSuccess: () => {},
    routes: [
      { team_member_id: 8, team_member_name: "Driver Example", vehicle_name: "Van 1", leg: "GO", stops: [{ job_id: 1 }] },
      { team_member_id: 8, team_member_name: "Driver Example", vehicle_name: "Car 2", leg: "RETURN", stops: [{ job_id: 2 }] },
      { team_member_id: 8, team_member_name: "Driver Example", vehicle_name: "Empty vehicle", leg: "GO", stops: [] },
    ],
  }));
  assert.match(html, /Change vehicle/);
  assert.match(html, /Driver Example/);
  assert.match(html, /GO · Van 1/);
  assert.match(html, /RETURN · Car 2/);
  assert.match(html, /All trips for this driver/);
  assert.doesNotMatch(html, /Empty vehicle/);
  assert.match(html, /disabled=""/);
});

test("leader dialog makes the both-leg vehicle replacement explicit", () => {
  const html = renderToStaticMarkup(React.createElement(modal, {
    optimizationId: 21, routeIndex: 0, onClose: () => {}, onSuccess: () => {},
    routes: [{ team_member_id: 8, team_member_name: "Leader", vehicle_name: "Bus 1", leg: "COMBINED", is_team_leader: true, stops: [{ job_id: 1 }] }],
  }));
  assert.match(html, /Bus 1/);
  assert.match(html, /Both legs will be updated together/);
  assert.doesNotMatch(html, /<select/);
});

test("vehicle dialog preserves backend details from plain API and Axios errors", () => {
  const source = fs.readFileSync(path.join(__dirname, "../app/route/_components/ChangeVehicleModal.tsx"), "utf8");
  const tree = ts.createSourceFile("modal.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let declaration;
  (function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(tree) === "errorText") declaration = node.parent.parent.getText(tree);
    ts.forEachChild(node, visit);
  })(tree);
  assert.ok(declaration);
  const compiled = ts.transpileModule(declaration, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
  const errorText = new Function("isAxiosError", compiled + ";return errorText;")(require("axios").isAxiosError);
  const detail = "Route times are missing. Reoptimize before changing vehicles.";
  assert.equal(errorText({ detail }), detail);
  assert.equal(errorText({ isAxiosError: true, response: { data: { detail } } }), detail);
  for (const error of [null, undefined, {}, { detail: [] }, new Error("Network failure")]) {
    assert.equal(errorText(error), "Unable to change the vehicle. Please try again.");
  }
});
