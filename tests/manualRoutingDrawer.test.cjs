const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

function load(relative, imports = {}) {
  const source = fs.readFileSync(path.join(__dirname, "..", relative), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
    jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
  } }).outputText;
  const exports = {};
  new Function("exports", "require", compiled)(exports, name => imports[name] || require(name));
  return exports;
}

test("the editor distinguishes requested and scheduled times and previews a merge before saving", async () => {
  const jobs = [
    { id: 18830, job_type: "return_only", start_hour: "20:00", end_hour: "04:30", candidate_name: "Johnson" },
    { id: 18832, job_type: "return_only", start_hour: "20:00", end_hour: "05:30", candidate_name: "Erik" },
  ];
  const trip = (id, time) => ({ team_member_id: 10, team_member_name: "Farwa", vehicle_id: 6,
    vehicle_name: "C_Escape", leg: "RETURN", route_id: id === 18830 ? 3941 : 3942, stops: [
      { job_id: id, stop_type: "pickup", arrival_time: `2026-11-18T${time}:00`, address_formatted: "Pickup" },
      { job_id: id, stop_type: "dropoff", arrival_time: "2026-11-18T06:00:00", address_formatted: "Drop-off" },
    ] });
  const routes = [trip(18830, "05:30"), trip(18832, "05:34")];
  const plan = { id: 156, route_name: "Plan", scheduled_date: "2026-11-17", job_ids: [18830, 18832],
    result: { routes, unassigned_jobs: [] } };
  const context = { result: plan.result, revision: "revision", drivers: [{ id: 10, name: "Farwa" }],
    job_summaries: { 18830: { id: 18830, name: "Johnson", job_type: "return_only", start_hour: "20:00", end_hour: "04:30" },
      18832: { id: 18832, name: "Erik", job_type: "return_only", start_hour: "20:00", end_hour: "05:30" } } };
  const state = [{ action: "edit", route_index: 0, job_ids: [18830], driver_id: 10, vehicle_id: 6 },
    plan.result, context, "revision", null, null, undefined, [], {}, []];
  const refs = [];
  let stateIndex = 0, refIndex = 0, buttons = [], nativeButtons = [], selects = [];
  const mockReact = { ...React,
    useState(initial) { const index = stateIndex++; if (!(index in state)) state[index] = initial;
      return [state[index], value => { state[index] = typeof value === "function" ? value(state[index]) : value; }]; },
    useRef(initial) { const index = refIndex++; return refs[index] ||= { current: initial }; },
    useMemo: fn => fn(), useEffect: () => {},
  };
  const fragment = ({ children }) => React.createElement(React.Fragment, null, children);
  const Button = props => { buttons.push(props); return React.createElement("button", { disabled: props.disabled }, props.children); };
  const Input = () => null;
  Input.TextArea = () => null;
  const jsx = require("react/jsx-runtime");
  const record = (factory, type, props, key) => {
    if (type === "button") nativeButtons.push(props);
    return factory(type, props, key);
  };
  const previews = [], commits = [];
  const merged = { ...routes[0], stops: [{ ...routes[0].stops[0], arrival_time: "2026-11-18T05:35:00" },
    routes[0].stops[1], ...routes[1].stops] };
  const checked = { preview_token: "signed", explanation: "Merge the trips.", result: { ...plan.result, routes: [merged, routes[1]] },
    affected_route_indices: [0, 1], deleted_route_indices: [1] };
  const utils = load("app/route/_components/manualRouting.utils.ts", {
    "./assignmentError.utils": load("app/route/_components/assignmentError.utils.ts"),
    "./tripLabel.utils": load("app/route/_components/tripLabel.utils.ts"),
  });
  const imports = {
    react: mockReact,
    "react/jsx-runtime": { ...jsx, jsx: (...args) => record(jsx.jsx, ...args), jsxs: (...args) => record(jsx.jsxs, ...args) },
    antd: { Alert: ({ title, description }) => React.createElement("div", null, title, description), Button, Checkbox: () => null,
      Collapse: () => null, Drawer: ({ children, footer }) => React.createElement("div", null, children, footer), Input,
      InputNumber: () => null, Select: props => { selects.push(props); return null; }, Spin: () => null, Tag: fragment,
      message: { success() {}, warning() {} } },
    "@/components/AddressAutocomplete": () => null,
    "@/store/jobs.store": { useJobsStore: () => ({ jobs, fetchJobsByIds: async () => {} }) },
    "@/store/team.store": { useTeamStore: () => ({ teams: [] }) },
    "@/store/vehicle.store": { useVehicleStore: () => ({ vehicles: [{ id: 6, name: "C_Escape" }] }) },
    "@/store/optimization.store": { useOptimizationStore: { setState() {} } },
    "@/store/manualRouting.store": { useManualRoutingStore: () => ({ intent: { planId: 156, action: "edit" }, close() {} }) },
    "@/apis/manualRouting.api": { previewManualRouting: async (...args) => { previews.push(args); return checked; },
      commitManualRouting: async (...args) => { commits.push(args); return { result: plan.result, message: "Saved" }; } },
    "./manualRouting.utils": utils,
  };
  const Drawer = load("app/route/_components/ManualRoutingDrawer.tsx", imports).default;
  function render() {
    stateIndex = refIndex = 0; buttons = []; nativeButtons = []; selects = [];
    return renderToStaticMarkup(React.createElement(Drawer, { plan }));
  }

  let html = render();
  assert.match(html, /Requested pickup: 4:30 AM \(next day\)/);
  assert.match(html, /Scheduled pickup:.*5:30 AM \(next day\)/);
  assert.match(html, /Preview changes/);
  const mergeAction = nativeButtons.find(button => button.children?.[1] === "Merge trips");
  assert.ok(mergeAction);
  mergeAction.onClick();
  render();
  assert.equal(buttons.find(button => button.children === "Preview changes").disabled, true,
    "A merge cannot be previewed until both trips are selected");
  selects.find(select => select.placeholder === "Search by driver, time or vehicle").onChange(1);
  html = render();
  assert.match(html, /Johnson.*#18830/);
  assert.match(html, /Erik.*#18832/);
  nativeButtons.find(button => button.children?.[1] === "Merge trips").onClick();
  assert.equal(state[0].merge_route_index, 1, "Reselecting the current action must preserve the chosen trip");
  selects.find(select => select.value === 0 && typeof select.onChange === "function").onChange(1);
  assert.equal(state[0].merge_route_index, undefined, "Changing the source clears the merge target");
  render();
  selects.find(select => select.value === 1 && typeof select.onChange === "function").onChange(0);
  render();
  selects.find(select => select.placeholder === "Search by driver, time or vehicle").onChange(1);
  render();
  await buttons.find(button => button.children === "Preview changes").onClick();
  assert.equal(previews.length, 1);
  assert.equal(previews[0][1].action, "merge");
  assert.equal(previews[0][1].merge_route_index, 1);
  assert.equal(commits.length, 0, "Preview must not save the merge");
  html = render();
  assert.match(html, /Review your changes/);
  assert.match(html, /Previously 5:30 AM \(next day\)/);
  await buttons.find(button => button.children === "Merge routes").onClick();
  assert.equal(commits.length, 1);
  assert.equal(commits[0][1], "signed");
});
