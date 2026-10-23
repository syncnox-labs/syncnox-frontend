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
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const exports = {};
  new Function("exports", "require", compiled)(exports, name => name in imports ? imports[name] : require(name));
  return exports;
}

const preview = {
  source: { route_index: 0, driver_id: 8, driver_name: "Driver 8", vehicle_id: 15, vehicle_name: "VEHICULE 4", leg: "GO", route_indices: [0], is_team_leader: false },
  target: { route_index: 1, driver_id: 6, driver_name: "Driver 6", vehicle_id: 12, vehicle_name: "VEHICULE 1", leg: "GO", route_indices: [1], is_team_leader: false },
};

test("preview is read-only and swap sends stale-screen guards for BOTH routes", async () => {
  const calls = [];
  const api = load("apis/routes.api.ts", { "@/config/apiClient.config": {
    get: async (...args) => { calls.push(["GET", ...args]); return { data: preview }; },
    post: async (...args) => { calls.push(["POST", ...args]); return { data: { success: true } }; },
  } });
  assert.deepEqual(await api.getVehicleSwapOptions(236, 0, 1), preview);
  await api.swapRouteVehicles(236, 0, preview);
  assert.deepEqual(calls, [
    ["GET", "optimization/requests/236/routes/0/vehicle-swap-options", { params: { target_route_index: 1 } }],
    ["POST", "optimization/requests/236/routes/0/swap-vehicles", {
      target_route_index: 1, expected_source_driver_id: 8, expected_source_vehicle_id: 15, expected_source_leg: "GO",
      expected_source_route_indices: [0], expected_target_route_indices: [1],
      expected_target_driver_id: 6, expected_target_vehicle_id: 12, expected_target_leg: "GO",
    }],
  ]);
});

function harness(api) {
  const state = [], effects = [], queued = [], ui = {};
  let cursor = 0, closed = 0, refreshed = 0;
  const props = { optimizationId: 236, routeIndex: 0, routes: [
    { team_member_id: 8, team_member_name: "Driver 8", vehicle_id: 15, vehicle_name: "VEHICULE 4", leg: "GO", stops: [{ job_id: 1 }] },
    { team_member_id: 6, team_member_name: "Driver 6", vehicle_id: 12, vehicle_name: "VEHICULE 1", leg: "GO", stops: [{ job_id: 2 }] },
    { team_member_id: 13, team_member_name: "Empty driver", vehicle_id: 14, stops: [] },
  ], onClose: () => { closed++; }, onSuccess: () => { refreshed++; } };
  const component = load("app/route/_components/SwapVehicleModal.tsx", {
    react: { ...React,
      useState: initial => { const i = cursor++; if (!(i in state)) state[i] = initial;
        return [state[i], value => { state[i] = typeof value === "function" ? value(state[i]) : value; }]; },
      useEffect: (fn, deps) => { const i = cursor++;
        if (!effects[i] || deps.some((v, j) => !Object.is(v, effects[i].deps[j]))) {
          effects[i]?.cleanup?.(); effects[i] = { deps }; queued.push(() => { effects[i].cleanup = fn(); });
        }
      },
    },
    "@/apis/routes.api": api,
    antd: {
      Modal: p => { ui.modal = p; return React.createElement("section", null, p.title, p.children, p.footer); },
      Select: p => { ui.select = p; return React.createElement("select", null, p.options.map(o => React.createElement("option", { key: o.value }, o.label))); },
      Button: p => React.createElement("button", { disabled: p.disabled }, p.children),
      Alert: p => { ui.alert = p; return React.createElement("aside", null, p.title, p.action); },
      Empty: p => React.createElement("p", null, p.description), Spin: () => null,
      message: { success: () => {} },
    },
  }).default;
  return { ui, props, get closed() { return closed; }, get refreshed() { return refreshed; },
    render() { cursor = 0; ui.alert = null; const tree = component(props);
      const html = renderToStaticMarkup(tree); while (queued.length) queued.shift()(); return html; },
    async select(index) { ui.select.onChange(index); this.render(); await new Promise(resolve => setImmediate(resolve)); return this.render(); },
  };
}

test("dialog checks the chosen route and confirms the exchange directions before saving", async () => {
  const calls = [];
  const h = harness({ getVehicleSwapOptions: async (...args) => { calls.push(["preview", ...args]); return preview; },
    swapRouteVehicles: async (...args) => { calls.push(["swap", ...args]); return { success: true, message: "Vehicles swapped" }; } });
  const initial = h.render();
  assert.match(initial, /Swap vehicles/);
  assert.doesNotMatch(initial, /Empty driver/);
  assert.equal(h.ui.modal.footer[1].props.disabled, true);
  const checked = await h.select(1);
  assert.match(checked, /Driver 8.*receives.*VEHICULE 1/);
  assert.match(checked, /Driver 6.*receives.*VEHICULE 4/);
  assert.equal(h.ui.modal.footer[1].props.disabled, false);
  await h.ui.modal.footer[1].props.onClick();
  assert.deepEqual(calls, [["preview", 236, 0, 1], ["swap", 236, 0, preview]]);
  assert.equal(h.closed, 1);
  assert.equal(h.refreshed, 1);
});

test("backend qualification conflict is visible and prevents saving", async () => {
  let writes = 0;
  const h = harness({ getVehicleSwapOptions: async () => { throw { detail: "Other driver lacks qualifications" }; },
    swapRouteVehicles: async () => { writes++; } });
  h.render();
  const html = await h.select(1);
  assert.match(html, /Other driver lacks qualifications/);
  assert.equal(h.ui.modal.footer[1].props.disabled, true);
  await h.ui.modal.footer[1].props.onClick();
  assert.equal(writes, 0);
});

test("a booking conflict on save keeps the dialog open and requires another eligibility check", async () => {
  const h = harness({ getVehicleSwapOptions: async () => preview,
    swapRouteVehicles: async () => { throw { detail: "Vehicle is now reserved" }; } });
  h.render(); await h.select(1);
  await h.ui.modal.footer[1].props.onClick();
  assert.match(h.render(), /Vehicle is now reserved/);
  assert.equal(h.ui.modal.footer[1].props.disabled, true);
  assert.equal(h.closed, 0);
  assert.equal(h.refreshed, 0);
  h.ui.alert.action.props.onClick(); h.render();
  await new Promise(resolve => setImmediate(resolve)); h.render();
  assert.equal(h.ui.modal.footer[1].props.disabled, false);
});

test("late preview from a previous target cannot enable a stale swap", async () => {
  const pending = [];
  const h = harness({ getVehicleSwapOptions: () => new Promise(resolve => pending.push(resolve)) });
  h.props.routes.push({ team_member_id: 7, team_member_name: "Driver 7", vehicle_id: 13, stops: [{ job_id: 3 }] });
  h.render(); h.ui.select.onChange(1); h.render();
  h.ui.select.onChange(3); h.render();
  pending[0](preview); await new Promise(resolve => setImmediate(resolve)); h.render();
  assert.equal(h.ui.modal.footer[1].props.disabled, true);
  pending[1]({ source: preview.source, target: { ...preview.target, route_index: 3, driver_id: 7 } });
  await new Promise(resolve => setImmediate(resolve)); h.render();
  assert.equal(h.ui.modal.footer[1].props.disabled, false);
});
