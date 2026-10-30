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
let renderedMergeButtons = [];
let renderedRouteMenus = [];
function recordElement(factory, type, props, key) {
  if (type === "button" && /^Merge .*waiting time$/.test(props["aria-label"] || "")) renderedMergeButtons.push(props);
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
    Avatar: childrenOnly, Tooltip: childrenOnly, Dropdown: props => {
      if (props.menu?.items) renderedRouteMenus.push(props.menu.items);
      return childrenOnly(props);
    },
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
  "./routeWaiting.utils": load("app/route/_components/routeWaiting.utils.ts"),
  "./TimelineTooltip": timelineTooltip,
  "./TimelineTravelSegment": load("app/route/_components/TimelineTravelSegment.tsx", { "./TimelineTooltip": timelineTooltip }),
  "./leaderRoute.utils": load("app/route/_components/leaderRoute.utils.ts"),
  "./stopDisplay.utils": load("app/route/_components/stopDisplay.utils.ts", {
    "./leaderRoute.utils": load("app/route/_components/leaderRoute.utils.ts"),
  }),
  "@/utils/timeline.utils": load("utils/timeline.utils.ts", { "./app.utils": load("utils/app.utils.ts") }),
}).default;

test("a timeline gap opens a merge for the two exact routes", () => {
  renderedMergeButtons = [];
  const calls = [];
  const trip = (id, hour) => ({ ...route, vehicle_id: 5, stops: [
    { ...route.stops[0], job_id: null, stop_type: "depot_start", arrival_time: `2026-09-29T${hour}:00:00` },
    { ...route.stops[0], job_id: id, arrival_time: `2026-09-29T${hour}:05:00` },
    { ...route.stops[1], job_id: id, arrival_time: `2026-09-29T${hour}:15:00` },
    { ...route.stops[1], job_id: null, stop_type: "depot_end", arrival_time: `2026-09-29T${hour}:25:00` },
  ] });
  const html = renderToStaticMarkup(React.createElement(TimelineView, {
    routes: [trip(1, "08"), trip(2, "09")], teams: [team], scheduledDate: "2026-09-29",
    onMergeRoutes: (...args) => calls.push(args),
  }));
  assert.match(html, /aria-label="Merge routes with waiting time"/);
  assert.equal(renderedMergeButtons.length, 1);
  assert.equal(renderedMergeButtons[0].style.width, 24);
  renderedMergeButtons[0].onClick({ stopPropagation() {} });
  assert.deepEqual(calls, [[0, 1]]);
});

test("touching trips remain mergeable from the menu without a button covering their icons", () => {
  renderedMergeButtons = [];
  renderedRouteMenus = [];
  const calls = [];
  const stops = [
    { ...route.stops[0], job_id: null, stop_type: "depot_start", arrival_time: "2026-09-29T07:55:00" },
    ...route.stops,
    { ...route.stops[1], job_id: null, stop_type: "depot_end", arrival_time: "2026-09-29T09:05:00" },
    { ...route.stops[0], job_id: null, stop_type: "depot_start", arrival_time: "2026-09-29T09:05:00" },
    { ...route.stops[0], job_id: 2, arrival_time: "2026-09-29T09:10:00" },
    { ...route.stops[1], job_id: 2, arrival_time: "2026-09-29T09:20:00" },
    { ...route.stops[1], job_id: null, stop_type: "depot_end", arrival_time: "2026-09-29T09:25:00" },
  ];
  renderToStaticMarkup(React.createElement(TimelineView, {
    routes: [{ ...route, stops }], teams: [team], scheduledDate: "2026-09-29",
    onEditWaiting: (...args) => calls.push(args),
  }));
  assert.equal(renderedMergeButtons.length, 0);
  const item = renderedRouteMenus.flat().find(item => item.key === "merge-trips-0-3");
  assert.ok(item, "The route menu must retain access to merging a narrow gap");
  item.onClick();
  assert.deepEqual(calls, [[0, 3]]);
});

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

test("an ETA update changes marker positions, the time axis and driver duration", () => {
  const renderRoute = candidate => {
    renderedStops = [];
    const html = renderToStaticMarkup(React.createElement(TimelineView, {
      routes: [candidate], teams: [team], scheduledDate: "2026-09-29", showDriverWorkingTime: false,
    }));
    return { html, positions: renderedStops.map(stop => stop.left) };
  };
  const before = renderRoute({ ...route, total_duration_seconds: 3600 });
  const after = renderRoute({ ...route, total_duration_seconds: 10800, stops: [route.stops[0],
    { ...route.stops[1], arrival_time: "2026-09-29T11:00:00", time_edited: true }] });
  assert.equal(after.positions[0], before.positions[0]);
  assert.equal(after.positions[1] - before.positions[1], 120 * 4);
  assert.doesNotMatch(before.html, /11:00 AM/);
  assert.match(after.html, /11:00 AM/);
  assert.match(after.html, /width:1080px/);
  assert.match(after.html, /3h/);
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
