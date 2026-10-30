const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const React = require("react");
const dayjs = require("dayjs");
const { renderToStaticMarkup } = require("react-dom/server");

function load(relative, imports = {}) {
  const source = fs.readFileSync(path.join(__dirname, "..", relative), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
  } }).outputText;
  const exports = {};
  new Function("exports", "require", compiled)(exports, name => name in imports ? imports[name] : require(name));
  return exports;
}

test("ETA API sends the selected route snapshot and local date/time", async () => {
  const calls = [];
  const api = load("apis/routeEta.api.ts", { "@/config/apiClient.config": {
    patch: async (...args) => { calls.push(args); return { data: { success: true } }; },
  } });
  const route = { team_member_id: 7, vehicle_id: null, stops: [
    { job_id: 42, stop_type: "pickup", arrival_time: "2026-10-13T06:00:00" },
    { stop_type: "depot_end", arrival_time: "2026-10-13T07:00:00" },
  ] };
  await api.editRouteETA(12, 0, 1, "2026-10-14T00:30:00", route);
  assert.equal(calls[0][0], "optimization/requests/12/routes/0/eta");
  assert.deepEqual(calls[0][1], { stop_index: 1, arrival_time: "2026-10-14T00:30:00",
    expected_driver_id: 7, expected_vehicle_id: null, expected_stops: [route.stops[0],
      { ...route.stops[1], job_id: null }] });
});

test("selecting a time immediately updates the form and saving updates timeline state", async () => {
  const route = { team_member_id: 7, vehicle_id: 9, stops: [
    { job_id: 42, stop_type: "pickup", arrival_time: "2026-10-13T06:00:00" },
    { job_id: 42, stop_type: "dropoff", arrival_time: "2026-10-13T07:00:00" },
  ] };
  const plan = { id: 12, result: { routes: [route] }, job_ids: [42] };
  const saved = { routes: [{ ...route, stops: route.stops.map(stop => ({ ...stop,
    arrival_time: dayjs(stop.arrival_time).add(10, "minute").format("YYYY-MM-DDTHH:mm:ss") })) }] };
  const states = [{ route, requestId: 12, routeIndex: 0, stopIndex: 0 }, dayjs(route.stops[0].arrival_time), null, undefined];
  let stateIndex = 0, picker, footer, closed = false;
  const calls = [], updates = [];
  const store = { currentOptimization: plan,
    setOptimizationResult: (...args) => updates.push(args), fetchOptimization: async () => plan };
  const container = ({ children }) => React.createElement(React.Fragment, null, children);
  const Modal = load("app/route/_components/RouteETAModal.tsx", {
    react: { ...React, useEffect() {}, useRef: value => ({ current: value }),
      useState: initial => { const index = stateIndex++; return [states[index] ?? initial, value => { states[index] = value; }]; } },
    antd: { Alert: container, Spin: () => null, Button: container,
      Modal: props => { footer = props.footer; return container(props); },
      DatePicker: props => { picker = props; return null; }, message: { success() {}, warning() {} } },
    "@/apis/routes.api": {},
    "@/apis/routeEta.api": { editRouteETA: async (...args) => { calls.push(args); return { result: saved, message: "Saved" }; } },
    "@/store/optimization.store": { useOptimizationStore: { getState: () => store } },
    "@/store/jobs.store": { useJobsStore: { getState: () => ({ fetchJobsByIds: async () => {} }) } },
    "./manualRouting.utils": { manualRoutingError: reason => reason.message },
  }).default;
  const render = () => {
    stateIndex = 0;
    return renderToStaticMarkup(React.createElement(Modal, { plan, selection: { routeIndex: 0, stopIndex: 0 },
      onClose: () => { closed = true; }, onSaved: updated => assert.deepEqual(updated, saved.routes[0]) }));
  };
  render();
  assert.equal(picker.needConfirm, false);
  picker.onChange(dayjs("2026-10-13T06:10:00"));
  const preview = render();
  assert.equal(picker.value.format("HH:mm:ss"), "06:10:00");
  assert.match(preview, /07:10:00/);
  const saveButton = React.Children.toArray(footer.props.children).at(-1);
  await saveButton.props.onClick();
  assert.equal(calls[0][3], "2026-10-13T06:10:00");
  assert.deepEqual(updates, [["completed", saved]]);
  assert.equal(closed, true);
});
