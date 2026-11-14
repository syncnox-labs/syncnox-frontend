const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

const root = path.join(__dirname, "../app/route/_components");
function load(file, imports = {}) {
  const source = fs.readFileSync(path.join(root, file), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const exports = {};
  new Function("exports", "require", code)(exports, name => imports[name] || require(name));
  return exports;
}
const location = load("jobMapLocation.utils.ts");
const { buildMapCompareItems } = load("mapCompare.utils.ts", {
  "./jobMapLocation.utils": location,
  "@/utils/timeline.utils": { getRouteColor: index => ["green", "blue"][index] },
});

function candidate(routeIndex, stopIndex, jobId, type, position) {
  return {
    routeIndex, stopIndex, jobId: String(jobId), driverName: `Driver ${routeIndex + 1}`,
    candidateName: `Person ${jobId}`, displayStopNumber: stopIndex, searchableText: `person ${jobId}`,
    stop: { job_id: jobId, stop_type: type, latitude: position.lat, longitude: position.lng, address_formatted: `Address ${jobId}` },
    job: { id: jobId, status: "assigned" },
  };
}

test("compares the exact selected route stops and unassigned pickup across drivers", () => {
  const stops = [candidate(0, 1, 10, "pickup", { lat: 45.1, lng: -73.1 }),
    candidate(1, 3, 20, "dropoff", { lat: 45.2, lng: -73.2 })];
  const unassigned = [{ id: 30, candidate_name: "Alex", pick_up_location: { lat: 45.3, lng: -73.3 },
    pick_up_address: "Alex pickup", drop_off_location: { lat: 45.4, lng: -73.4 }, drop_off_address: "Alex drop-off" }];
  const items = buildMapCompareItems(stops, unassigned);
  assert.equal(items.length, 4);
  assert.match(items[0].subtitle, /Driver 1 · Stop 1 · Job #10/);
  assert.match(items[1].subtitle, /Driver 2 · Stop 3 · Job #20/);
  assert.match(items[2].subtitle, /Unassigned · Job #30/);
  assert.deepEqual(items.slice(0, 3).map(item => item.marker.position),
    [{ lat: 45.1, lng: -73.1 }, { lat: 45.2, lng: -73.2 }, { lat: 45.3, lng: -73.3 }]);
  assert.match(items[3].title, /Drop-off/);
  assert.deepEqual(items[3].marker.position, { lat: 45.4, lng: -73.4 });
});

test("co-located bookings remain individually selectable and keys do not silently follow a changed booking", () => {
  const point = { lat: 45, lng: -73 };
  const original = candidate(0, 1, 10, "pickup", point);
  const sameVisit = candidate(0, 2, 11, "pickup", point);
  const items = buildMapCompareItems([original, sameVisit], []);
  assert.notEqual(items[0].key, items[1].key);
  assert.deepEqual(items[0].marker.position, items[1].marker.position);
  const changed = buildMapCompareItems([candidate(0, 1, 12, "pickup", point)], []);
  assert.notEqual(items[0].key, changed[0].key);
});

test("missing and invalid coordinates are listed as unavailable without creating a map marker", () => {
  const items = buildMapCompareItems([candidate(0, 1, 10, "pickup", { lat: NaN, lng: -73 })], [{ id: 30 }]);
  assert.equal(items.length, 2);
  assert.equal(items[0].marker, null);
  assert.equal(items[1].marker, null);
});

test("a driver stop remains selected when browsing unassigned jobs", () => {
  let stateIndex = 0;
  const react = { ...React, useState: () => [["", "unassigned", 60][stateIndex++], () => {}],
    useMemo: callback => callback(), useRef: () => ({ current: null }), useEffect: () => {} };
  const Panel = load("MapComparePanel.tsx", { react }).default;
  const items = buildMapCompareItems([candidate(0, 1, 10, "pickup", { lat: 45, lng: -73 })],
    [{ id: 30, candidate_name: "Alex", pick_up_location: { lat: 46, lng: -74 } }]);
  const html = renderToStaticMarkup(React.createElement(Panel, {
    items, selected: [items[0]], onToggle() {}, onClear() {}, onClose() {}, loading: false, error: null,
  }));
  const [selection, results] = html.split('aria-label="Available stops"');
  assert.match(selection, /Person 10/);
  assert.match(selection, /1 selected/);
  assert.match(results, /Alex/);
  assert.doesNotMatch(results, /Person 10/);
});

test("map details show a generic job's real route, time and address", () => {
  const mockAntd = {
    Typography: { Text: ({ children }) => React.createElement("span", null, children) },
    Tag: ({ children }) => React.createElement("span", null, children),
    Button: ({ children }) => React.createElement("button", null, children),
    message: { success() {}, error() {} }, App: { useApp: () => ({ modal: { confirm() {} } }) },
  };
  const InfoWindow = load("RouteInfoWindow.tsx", {
    antd: mockAntd,
    "@/utils/jobs.utils": { STATUS_COLORS: { draft: "gray" } },
    "@/utils/app.utils": { formatTime12h: value => value },
    "@/apis/jobs.api": { updateJobStatus() {} },
    "@/store/jobs.store": { useJobsStore: () => ({ patchJobLocally() {} }) },
    "@/store/routes.store": { useRouteStore: () => ({ fetchRoutes() {} }) },
    "@/apis/location-mapping.api": { LOCATION_TYPE_OPTIONS: [] },
    "@/utils/customMapMarker": { getLocationTypeColor: () => "green" },
  }).default;
  const delivery = candidate(0, 1, 10, "job", { lat: 45, lng: -73 });
  delivery.candidateName = "Unknown Candidate";
  delivery.stop.arrival_time = "2026-11-05T16:48:00";
  delivery.job = { id: 10, status: "assigned", business_name: "North Store",
    pickup_delivery_detail: { time_window_start: "08:00", time_window_end: "10:00" } };
  const unassigned = { id: 30, business_name: "South Store", location: { lat: 46, lng: -74 }, address_formatted: "South address" };
  const items = buildMapCompareItems([delivery], [unassigned]);
  const render = item => renderToStaticMarkup(React.createElement(InfoWindow, { marker: item.marker }));
  const assignedHtml = render(items[0]);
  assert.match(assignedHtml, /Job #10/);
  assert.match(assignedHtml, /North Store/);
  assert.match(assignedHtml, /Driver 1/);
  assert.match(assignedHtml, /Nov 5, 4:48 PM/);
  assert.match(assignedHtml, /08:00 – 10:00/);
  assert.match(assignedHtml, /Mark Complete/);
  const unassignedHtml = render(items[1]);
  assert.match(unassignedHtml, /South Store/);
  assert.match(unassignedHtml, /South address/);
  assert.match(unassignedHtml, /Unassigned/);
  assert.doesNotMatch(unassignedHtml, /Mark Complete|Skip|>Driver<|>ETA</);
  const shuttle = candidate(1, 2, 40, "pickup", { lat: 45, lng: -73 });
  shuttle.leg = "GO";
  shuttle.job = { id: 40, status: "assigned", template_type: "worker_shuttle" };
  const shuttleHtml = render(buildMapCompareItems([shuttle], [])[0]);
  assert.match(shuttleHtml, /Person 40/);
  assert.match(shuttleHtml, /Pickup/);
  assert.match(shuttleHtml, /Driver 2/);
  assert.match(shuttleHtml, />GO</);
});
