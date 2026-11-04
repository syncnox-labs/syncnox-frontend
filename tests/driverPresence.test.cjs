const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

function load(file, imports) {
  const code = ts.transpileModule(fs.readFileSync(`${__dirname}/../${file}`, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020,
      jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const exports = {};
  new Function("exports", "require", code)(exports, name => name in imports ? imports[name] : require(name));
  return exports;
}

function store(get = async () => ({ data: [] })) {
  return load("store/driverPresence.store.ts", { "@/config/apiClient.config": { get } }).useDriverPresenceStore;
}

test("presence snapshot exposes online, offline and mobile not set up independently of team active status", async () => {
  const calls = [];
  const state = store(async url => { calls.push(url); return { data: [
    { driver_id: 174, status: "online" }, { driver_id: 175, status: "offline" }, { driver_id: 176, status: "not_setup" },
  ] }; });
  state.getState().setTenant("1");
  await state.getState().refresh();
  assert.deepEqual(calls, ["/driver/presence"]);
  assert.deepEqual(state.getState().statuses, { 174: "online", 175: "offline", 176: "not_setup" });
});

test("live connection events override an older in-flight snapshot, including a newly configured driver", async () => {
  let complete;
  const state = store(() => new Promise(resolve => { complete = resolve; }));
  state.getState().setTenant("1");
  const pending = state.getState().refresh();
  state.getState().update(1, { driver_id: 174, status: "online" });
  state.getState().update(1, { driver_id: 175, status: "not_setup" });
  complete({ data: [{ driver_id: 174, status: "offline" }] });
  await pending;
  assert.deepEqual(state.getState().statuses, { 174: "online", 175: "not_setup" });
});

test("changing tenants rejects stale responses and events from the previous tenant", async () => {
  let complete;
  const state = store(() => new Promise(resolve => { complete = resolve; }));
  state.getState().setTenant("1");
  const pending = state.getState().refresh();
  state.getState().setTenant("2");
  state.getState().update(1, { driver_id: 174, status: "online" });
  complete({ data: [{ driver_id: 174, status: "online" }] });
  await pending;
  assert.deepEqual(state.getState().statuses, {});
});

test("losing live status or failing a refresh clears green dots without calling those drivers offline", async () => {
  const state = store(async () => { throw new Error("Offline"); });
  state.getState().setTenant("1");
  for (const [driver_id, status] of [[174, "online"], [175, "offline"], [176, "not_setup"]]) {
    state.getState().update(1, { driver_id, status });
  }
  await state.getState().refresh();
  assert.deepEqual(state.getState().statuses, { 174: "unknown", 175: "unknown", 176: "not_setup" });
});

test("presence indicator renders the requested colors with accessible status labels", () => {
  for (const [status, color, label] of [["online", "bg-green-500", "Online"], ["offline", "bg-red-500", "Offline"],
    ["not_setup", "bg-gray-400", "Mobile not set up"], ["unknown", "bg-transparent", "Connection status unavailable"]]) {
    const Indicator = load("components/DriverPresenceIndicator.tsx", {
      "@/store/driverPresence.store": { useDriverPresenceStore: selector => selector({ statuses: { 174: status } }) },
    }).default;
    const html = renderToStaticMarkup(React.createElement(Indicator, { driverId: 174 }));
    assert.ok(html.includes(color));
    assert.ok(html.includes(`aria-label="${label}`));
    assert.ok(html.includes(`title="${label}`));
    assert.match(html, /rounded-full/);
  }
});

test("Team cards use connection presence instead of the administrative Active badge", () => {
  const Card = load("app/team/_components/TeamMemberCard.tsx", {
    antd: { Checkbox: () => null },
    "@/components/DriverPresenceIndicator": ({ driverId }) => React.createElement("span", { "data-presence-driver": driverId }),
  }).default;
  const html = renderToStaticMarkup(React.createElement(Card, {
    team: { id: 174, name: "Driver", role_type: "driver", status: "active" },
    isSelected: false, onClick() {},
  }));
  assert.match(html, /data-presence-driver="174"/);
  assert.doesNotMatch(html, /title="active"/);
});

test("dispatch events update presence and reconnect refreshes the snapshot", () => {
  const updates = [], refreshes = [];
  let socket;
  class WebSocket { constructor() { socket = this; } close() {} }
  const code = ts.transpileModule(fs.readFileSync(`${__dirname}/../hooks/useDispatchSocket.ts`, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const exports = {};
  new Function("exports", "require", "WebSocket", code)(exports, name => ({
    react: { useRef: initial => ({ current: initial }), useEffect: effect => effect() },
    "next-auth/react": { useSession: () => ({ data: { user: { tenant_id: 1 }, access_token: "test" } }) },
    "@/store/jobs.store": { useJobsStore: selector => selector({}) },
    "@/store/routes.store": { useRouteStore: selector => selector({}) },
    "@/store/optimization.store": { useOptimizationStore: { getState: () => ({}) } },
    "@/store/driverPresence.store": { useDriverPresenceStore: { getState: () => ({
      refresh: async () => { refreshes.push(true); }, update: (...args) => updates.push(args), markUnavailable() {},
    }) } },
  }[name]), WebSocket);
  exports.useDispatchSocket();
  socket.onopen();
  socket.onmessage({ data: JSON.stringify({ event: "driver_presence", tenant_id: 1, driver_id: 174, status: "online" }) });
  assert.equal(refreshes.length, 1);
  assert.equal(updates[0][0], 1);
  assert.equal(updates[0][1].status, "online");
});
