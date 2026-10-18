const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

function load(relativePath, imports = {}) {
  const source = fs.readFileSync(path.join(__dirname, "..", relativePath), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020,
      jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
    },
  }).outputText;
  const exports = {};
  new Function("exports", "require", compiled)(exports, name => name in imports ? imports[name] : require(name));
  return exports;
}

const childrenOnly = ({ children }) => React.createElement(React.Fragment, null, children);
const TimelineView = load("app/route/_components/TimelineView.tsx", {
  antd: {
    Avatar: childrenOnly, Tooltip: childrenOnly, Dropdown: childrenOnly,
    Select: () => null, Input: () => null, message: {}, Modal: {},
  },
  "@/store/index.store": { useIndexStore: () => ({ activeJobTemplate: "worker_shuttle" }) },
  "./optimizationView.utils": { isDriverMatch: () => true },
  "./ReorderStopsModal": () => null,
  "./TransferStopsModal": () => null,
  "./TimelineStopArrow": () => React.createElement("span", { "data-test": "route-stop" }),
  "./timelineSegment.utils": load("app/route/_components/timelineSegment.utils.ts"),
  "./leaderRoute.utils": load("app/route/_components/leaderRoute.utils.ts"),
  "@/utils/timeline.utils": load("utils/timeline.utils.ts", { "./app.utils": load("utils/app.utils.ts") }),
}).default;

const route = {
  team_member_id: 8, team_member_name: "Driver Example", leg: "GO",
  stops: [
    { job_id: 1, stop_type: "pickup", latitude: 45.5, longitude: -73.5, arrival_time: "2026-09-29T08:00:00" },
    { job_id: 1, stop_type: "dropoff", latitude: 45.6, longitude: -73.6, arrival_time: "2026-09-29T09:00:00" },
  ],
};
const team = { id: 8, name: "Driver Example", work_start_time: "06:00", work_end_time: "18:00" };
function render(showDriverWorkingTime, driver = team) {
  return renderToStaticMarkup(React.createElement(TimelineView, {
    routes: [route], teams: [driver], scheduledDate: "2026-09-29",
    showDriverWorkingTime, onDriverWorkingHoursChange: async () => {},
  }));
}

test("hidden working time removes the availability background and shift editing controls", () => {
  const html = render(false);
  assert.doesNotMatch(html, /border-emerald-200\/80 bg-emerald-50\/50/);
  assert.doesNotMatch(html, /aria-label="Change Driver Example.*shift (start|end)/);
  assert.match(html, /Driver Example/);
  assert.equal((html.match(/data-test="route-stop"/g) || []).length, 2);
  // 07:30–10:00 route range at 4 px/min; the hidden 06:00–18:00
  // working shift must not stretch the timeline.
  assert.match(html, /width:600px/);
  assert.doesNotMatch(html, /width:3240px/);
});

test("enabled working time renders bands, shift handles, and the full shift range", () => {
  const html = render(true);
  assert.match(html, /border-emerald-200\/80 bg-emerald-50\/50/);
  assert.match(html, /aria-label="Change Driver Example shift start/);
  assert.match(html, /aria-label="Change Driver Example shift end/);
  assert.match(html, /width:3240px/);
  assert.equal((html.match(/data-test="route-stop"/g) || []).length, 2);
});

test("working time is shown by default, including inferred shifts", () => {
  const html = render(undefined, { id: 8, name: "Driver Example" });
  assert.match(html, /border-emerald-200\/80 bg-emerald-50\/50/);
  assert.match(html, /aria-label="Change Driver Example shift start/);
  assert.match(html, /aria-label="Change Driver Example shift end/);
});

test("working time preference survives reloads and preserves other map settings", () => {
  const file = ts.createSourceFile("OptimizationView.tsx", fs.readFileSync(
    path.join(__dirname, "../app/route/_components/OptimizationView.tsx"), "utf8"),
    ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const names = new Set([
    "MAP_OVERLAYS_STORAGE_KEY", "DEFAULT_MAP_OVERLAYS", "getStoredMapOverlays", "handleToggleDriverWorkingTime",
  ]);
  const declarations = [];
  function visit(node) {
    if (ts.isVariableDeclaration(node) && names.has(node.name.getText(file))) {
      declarations.push(`const ${node.getText(file)};`);
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  assert.equal(declarations.length, names.size);
  const compiled = ts.transpileModule(declarations.join("\n") +
    "\nObject.assign(exports, { getStoredMapOverlays, handleToggleDriverWorkingTime });", {
    compilerOptions: { target: ts.ScriptTarget.ES2020 },
  }).outputText;
  let stored = JSON.stringify({ stops: false, depots: true, visibleLocationTypes: ["client"] });
  let checked;
  function settings() {
    const exports = {};
    new Function("exports", "window", "localStorage", "useCallback", "setShowDriverWorkingTime", compiled)(
      exports, {}, { getItem: () => stored, setItem: (_key, value) => { stored = value; } },
      callback => callback, value => { checked = value; },
    );
    return exports;
  }
  assert.equal(settings().getStoredMapOverlays().driverWorkingTime, true);
  settings().handleToggleDriverWorkingTime(true);
  assert.equal(checked, true);
  assert.equal(settings().getStoredMapOverlays().driverWorkingTime, true);
  assert.equal(JSON.parse(stored).stops, false);
  assert.equal(JSON.parse(stored).depots, true);
  assert.deepEqual(JSON.parse(stored).visibleLocationTypes, ["client"]);
  settings().handleToggleDriverWorkingTime(false);
  assert.equal(checked, false);
  assert.equal(settings().getStoredMapOverlays().driverWorkingTime, false);
  stored = "invalid JSON";
  assert.equal(settings().getStoredMapOverlays().driverWorkingTime, true);
  stored = null;
  assert.equal(settings().getStoredMapOverlays().driverWorkingTime, true);
});
