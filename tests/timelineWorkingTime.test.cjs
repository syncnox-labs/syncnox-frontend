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
const timelineTooltip = load("app/route/_components/TimelineTooltip.tsx", { antd: { Tooltip: childrenOnly } });
const jsxRuntime = require("react/jsx-runtime");
let renderedRows = [];
let renderedLanes = [];
let renderedTracks = [];
let renderedStops = [];
function recordElement(factory, type, props, key) {
  if (type === "div" && props["data-driver-key"]) renderedRows.push(props);
  if (type === "div" && props["data-timeline-driver-track"]) renderedTracks.push(props);
  if (type === "div" && /^route-\d+$/.test(String(key))) {
    renderedLanes.push({ routeIndex: Number(String(key).slice(6)), props });
  }
  return factory(type, props, key);
}
const TimelineView = load("app/route/_components/TimelineView.tsx", {
  "react/jsx-runtime": {
    ...jsxRuntime,
    jsx: (...args) => recordElement(jsxRuntime.jsx, ...args),
    jsxs: (...args) => recordElement(jsxRuntime.jsxs, ...args),
  },
  antd: {
    Avatar: childrenOnly, Tooltip: childrenOnly, Dropdown: childrenOnly,
    Select: () => null, Input: () => null, message: {}, Modal: {},
  },
  "@/store/index.store": { useIndexStore: () => ({ activeJobTemplate: "worker_shuttle" }) },
  "@/utils/jobPickupType.utils": load("utils/jobPickupType.utils.ts"),
  "./jobAddition.utils": load("app/route/_components/jobAddition.utils.ts"),
  "./tripMove.utils": load("app/route/_components/tripMove.utils.ts", {
    "./jobAddition.utils": load("app/route/_components/jobAddition.utils.ts"),
  }),
  "./optimizationView.utils": { isDriverMatch: () => true },
  "./ReorderStopsModal": () => null,
  "./TransferStopsModal": () => null,
  "./TimelineStopArrow": props => {
    renderedStops.push(props);
    return React.createElement("span", { "data-test": "route-stop" });
  },
  "./timelineSegment.utils": load("app/route/_components/timelineSegment.utils.ts"),
  "./TimelineTooltip": timelineTooltip,
  "./TimelineTravelSegment": load("app/route/_components/TimelineTravelSegment.tsx", { "./TimelineTooltip": timelineTooltip }),
  "./leaderRoute.utils": load("app/route/_components/leaderRoute.utils.ts"),
  "./stopDisplay.utils": load("app/route/_components/stopDisplay.utils.ts", {
    "./leaderRoute.utils": load("app/route/_components/leaderRoute.utils.ts"),
  }),
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

function renderMultipleTrips(extraProps = {}) {
  const trip = (driverId, name, leg, hour) => ({
    ...route, team_member_id: driverId, team_member_name: name, leg,
    stops: route.stops.map((stop, index) => ({ ...stop, leg,
      arrival_time: `2026-09-29T${String(hour + index).padStart(2, "0")}:00:00` })),
  });
  // Same order and separate-leg arrangement as the reported Driver 3 / 1211 /
  // 13 / 10 result: appended RETURN routes must stay with their own driver.
  const routes = [trip(3, "Driver 3", "GO", 6), trip(12, "Driver 1211", "GO", 7),
    trip(13, "Driver 13", "GO", 8), trip(10, "Driver 10", "COMBINED", 15),
    trip(3, "Driver 3", "RETURN", 16), trip(12, "Driver 1211", "RETURN", 22),
    trip(13, "Driver 13", "RETURN", 17)];
  renderedRows = [];
  renderedLanes = [];
  renderedTracks = [];
  renderedStops = [];
  renderToStaticMarkup(React.createElement(TimelineView, {
    routes, scheduledDate: "2026-09-29", showDriverWorkingTime: false, ...extraProps,
  }));
  return { rows: renderedRows, lanes: renderedLanes, tracks: renderedTracks, stops: renderedStops };
}

for (const showDriverWorkingTime of [false, true]) test(`driver rows stay compact with separate GO/RETURN trips and working time ${showDriverWorkingTime}`, () => {
  const { rows, lanes } = renderMultipleTrips({ showDriverWorkingTime });
  assert.deepEqual(rows.map(row => row["data-driver-key"]), ["driver-id-3", "driver-id-12", "driver-id-13", "driver-id-10"]);
  for (const row of rows) {
    const indices = row["data-route-indices"].split(",").map(Number);
    const trips = lanes.filter(lane => indices.includes(lane.routeIndex));
    assert.equal(trips.length, indices.length);
    assert.equal(row.style.height, 60, "Multiple trips must not increase driver row height");
    for (const lane of trips) {
      assert.equal(lane.props.style.height, row.style.height);
      assert.match(lane.props.className, /\babsolute\b.*\binset-0\b/, "All trips share their driver's row origin");
      assert.equal(lane.props.style.pointerEvents, "none", "An empty RETURN overlay must not cover GO markers");
      assert.match(lane.props.className, /\[&>\*\]:pointer-events-auto/, "Actual route controls remain interactive");
    }
  }
  assert.equal(rows.find(row => row["data-driver-key"] === "driver-id-10").style.height, 60);
});

function dropEvent(clientX = 400) {
  return {
    preventDefault() {}, stopPropagation() {}, clientX,
    currentTarget: { getBoundingClientRect: () => ({ left: 100 }) },
    dataTransfer: { types: ["application/json"], getData: () => JSON.stringify({ type: "unassigned_job", jobId: 999 }) },
  };
}

test("dropping on GO, RETURN or the next driver's lane retains the correct route index", async () => {
  const added = [];
  const { lanes } = renderMultipleTrips({ onAddUnassignedJob: async (...args) => added.push(args) });
  for (const routeIndex of [0, 4, 1, 5, 2, 6, 3]) {
    const lane = lanes.find(lane => lane.routeIndex === routeIndex);
    const event = dropEvent();
    lane.props.onDragOver(event);
    await lane.props.onDrop(event);
  }
  assert.deepEqual(added.map(([routeIndex, jobId]) => [routeIndex, jobId]),
    [0, 4, 1, 5, 2, 6, 3].map(routeIndex => [routeIndex, 999]));
});

test("dropping on blank driver-row space chooses the trip nearest the pointer time", async () => {
  const added = [];
  const { tracks, stops } = renderMultipleTrips({ onAddUnassignedJob: async (...args) => added.push(args) });
  const track = tracks.find(track => track["data-timeline-driver-track"] === "driver-id-3");
  assert.ok(track);
  // Rendered arrows carry actual timeline positions, including the start buffer.
  const morning = stops[0].left;
  const evening = stops[2].left;
  for (const x of [morning - 20, evening + 20]) {
    const event = dropEvent(100 + x);
    track.onDragOver(event);
    await track.onDrop(event);
  }
  assert.deepEqual(added.map(([routeIndex, jobId]) => [routeIndex, jobId]), [[0, 999], [4, 999]]);
});

test("GO and RETURN marker clicks retain their original route indices in the shared row", () => {
  const clicks = [];
  const { stops } = renderMultipleTrips({ onStopClick: (...args) => clicks.push(args) });
  for (const stop of stops) stop.onClick({});
  assert.deepEqual(clicks.map(([, routeIndex]) => routeIndex), [0, 0, 4, 4, 1, 1, 5, 5, 2, 2, 6, 6, 3, 3]);
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

test("rendered timeline numbers and clicks match search and map for shared passenger stops", () => {
  const stopDisplay = load("app/route/_components/stopDisplay.utils.ts", {
    "./leaderRoute.utils": load("app/route/_components/leaderRoute.utils.ts"),
  });
  const { buildMapSearchIndex, filterMapSearchResults } = load("app/route/_components/mapSearch.utils.ts", {
    "./stopDisplay.utils": stopDisplay,
  });
  const { generateMapMarkers } = load("app/route/_components/optimizationView.utils.ts", {
    "./stopDisplay.utils": stopDisplay,
    "@/utils/app.utils": { formatTime12h: value => value },
    "@/utils/googleMaps.utils": { decodePolyline: () => [] },
    "@/utils/timeline.utils": { getRouteColor: () => "#123456" },
  });
  const shared = { ...route.stops[0], arrival_time: "2026-09-29T15:00:00" };
  const selectedRoute = { ...route, stops: [
    { ...shared, stop_type: "depot_start" },
    ...[1, 2, 3].map(job_id => ({ ...shared, job_id })),
    ...Array.from({ length: 19 }, (_, i) => ({ ...shared, job_id: i + 10, latitude: 45.6 + i / 100,
      arrival_time: `2026-09-29T16:${String(i).padStart(2, "0")}:00` })),
    { ...shared, stop_type: "dropoff", job_id: 42, arrival_time: "2026-09-29T16:37:00" },
  ] };
  const [result] = filterMapSearchResults(buildMapSearchIndex([selectedRoute], [
    { id: 42, candidate_name: "Paula Plata" },
  ]), "Paula");
  renderedStops = [];
  const clicked = [];
  renderToStaticMarkup(React.createElement(TimelineView, {
    routes: [selectedRoute], scheduledDate: "2026-09-29", showDriverWorkingTime: false,
    selectedMarkerId: result.markerId, onStopClick: (...args) => clicked.push(args),
  }));
  const arrow = renderedStops.find(stop => stop.displayIndex === result.displayStopNumber);
  assert.ok(arrow, "search number must exist on a rendered timeline arrow");
  assert.equal(arrow.displayIndex, 21);
  assert.equal(arrow.isPickup, false);
  arrow.onClick({ stopPropagation() {} });
  assert.equal(clicked[0][0], result.stop);
  assert.equal(clicked[0][2], result.displayStopNumber, "the details card gets the visible arrow number");
  const marker = generateMapMarkers({ result: { routes: [selectedRoute] } }, []).find(marker => marker.id === result.markerId);
  assert.equal(marker.sequenceNumber, arrow.displayIndex);
});
