const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
function load(file, dependencies = {}) {
  const source = fs.readFileSync(path.join(__dirname, "..", file), "utf8");
  const output = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const exports = {};
  new Function("exports", "require", output)(exports, name => name in dependencies ? dependencies[name] : require(name));
  return exports;
}
const pickupTypes = load("utils/jobPickupType.utils.ts");
const helpers = load("utils/shuttleManifest.utils.ts", { "@/utils/jobPickupType.utils": pickupTypes });
const preview = load("utils/exportPreview.utils.ts", { "./shuttleManifest.utils": helpers });
const stop = (type, at, id = null, address = "") => ({ stop_type: type, arrival_time: at, job_id: id, address_formatted: address });
const fixture = () => {
  const job = { id: 1, template_type: "worker_shuttle", job_type: "return_only", scheduled_date: "2026-11-05",
    worker_shuttle_detail: { candidate_id: "008997", candidate_name: "Gul Rabab", candidate_phone: "+1 (514) 555-0100",
      pick_up_address: "Stale worksite", drop_off_address: "Stale station" },
    custom_fields: { client_name: "Tenzo Sushi", pickup_type: "round_trip", start_hour: "17:00:00", end_hour: "00:00:00", shift: "Evening", quart_id: "SHIFT-42" } };
  const route = { team_member_name: "Omar", team_member_id: 175, vehicle_id: 55, vehicle_name: "Dodge Caravan", vehicle_capacity: 7,
    leg: "RETURN", total_distance_meters: 10000, total_duration_seconds: 7200, stops: [
      stop("depot_start", "2026-11-05T23:40:00", null, "Driver start depot"),
      stop("pickup", "2026-11-06T00:00:00", 1, "12300 Rue De Chaumont, Mirabel, QC"),
      stop("dropoff", "2026-11-06T00:45:00", 1, "Montmorency station"),
      stop("depot_end", "2026-11-06T01:10:00", null, "Driver end depot"),
    ] };
  return { job, route };
};

test("return manifest includes the reference fields and uses saved journey addresses", () => {
  const { job, route } = fixture();
  const rows = helpers.prepareShuttleManifest(route, new Map([[1, job]]), "2026-11-05");
  assert.equal(rows.length, 1, "Pickup/drop-off are one passenger journey");
  const row = rows[0];
  assert.equal(row.candidateId, "008997");
  assert.equal(row.candidateName, "Gul Rabab");
  assert.equal(row.candidatePhone, "+1 (514) 555-0100");
  assert.equal(row.clientName, "Tenzo Sushi");
  assert.equal(row.pickupType, "Round Trip");
  assert.equal(row.shift, "Evening");
  assert.equal(row.shiftReference, "SHIFT-42");
  assert.equal(row.shiftStart, "5:00 PM");
  assert.equal(row.shiftEnd, "12:00 AM");
  assert.equal(row.overnightShift, true);
  assert.equal(row.serviceDate, "Thursday, Nov 5, 2026");
  assert.equal(row.pickupDate, "Friday, Nov 6, 2026");
  assert.equal(row.pickupTime, "12:00 AM");
  assert.equal(row.pickupLocation, "12300 Rue De Chaumont, Mirabel, QC");
  assert.equal(row.dropoffLocation, "Montmorency station");
  assert.equal(row.worksite, row.pickupLocation);
});

test("combined legacy routes keep the GO and RETURN of the same job separate", () => {
  const { job, route } = fixture();
  job.job_type = "round_trip";
  route.leg = "COMBINED";
  route.stops = [
    { ...stop("pickup", "2026-11-05T16:00:00", 1, "Station GO"), leg: "GO" },
    { ...stop("dropoff", "2026-11-05T16:40:00", 1, "Worksite GO"), leg: "GO" },
    { ...stop("pickup", "2026-11-06T00:00:00", 1, "Worksite RETURN"), leg: "RETURN" },
    { ...stop("dropoff", "2026-11-06T00:45:00", 1, "Station RETURN"), leg: "RETURN" },
  ];
  const rows = helpers.prepareShuttleManifest(route, new Map([[1, job]]), "2026-11-05");
  assert.deepEqual(rows.map(row => [row.leg, row.pickupLocation, row.dropoffLocation]), [
    ["GO", "Station GO", "Worksite GO"], ["RETURN", "Worksite RETURN", "Station RETURN"],
  ]);
  assert.equal(rows[0].worksite, "Worksite GO");
  assert.notEqual(rows[0].key, rows[1].key);
  const visits = helpers.prepareShuttleManifestLocations(route, new Map([[1, job]]), "2026-11-05");
  assert.deepEqual(visits.map(visit => [visit.kind, visit.rows[0].leg, visit.rows[0].key]), [
    ["pickup", "GO", rows[0].key], ["dropoff", "GO", rows[0].key],
    ["pickup", "RETURN", rows[1].key], ["dropoff", "RETURN", rows[1].key],
  ]);
});

test("multiple passengers at the same stop retain individual contacts and pickup order", () => {
  const { job, route } = fixture();
  route.stops = [stop("pickup", "2026-11-05T16:00:00", 2, "Client"), stop("pickup", "2026-11-05T16:00:00", 1, "Client"),
    stop("dropoff", "2026-11-05T17:00:00", 1, "Home 1"), stop("dropoff", "2026-11-05T17:30:00", 2, "Home 2")];
  const second = { ...job, id: 2, candidate_name: "Second passenger", candidate_phone: "+1 555 0200" };
  const rows = helpers.prepareShuttleManifest(route, new Map([[1, job], [2, second]]), "2026-11-05");
  assert.deepEqual(rows.map(row => [row.jobId, row.sequence]), [[2, 1], [1, 2]]);
  assert.equal(rows[0].candidatePhone, "+1 555 0200");
  assert.equal(rows[0].dropoffLocation, "Home 2");
});

test("incomplete and missing bookings stay visible without fabricated times or contacts", () => {
  const route = { leg: "GO", stops: [stop("pickup", "", 1, "Station"), stop("dropoff", "2026-11-05T17:00:00", 2, "Client")] };
  const rows = helpers.prepareShuttleManifest(route, new Map(), "2026-11-05");
  assert.equal(rows.length, 2);
  assert.equal(rows[0].pickupTime, "Not scheduled");
  assert.equal(rows[0].candidatePhone, "");
  assert.equal(rows[1].pickupTime, "Not scheduled");
  assert.equal(rows[1].dropoffTime, "5:00 PM");
  assert.equal(rows[0].shift, "");
  const visits = helpers.prepareShuttleManifestLocations(route, new Map(), "2026-11-05");
  assert.deepEqual(visits.map(visit => [visit.kind, visit.candidateCount, visit.rows[0].jobId]), [
    ["pickup", 1, 1], ["dropoff", 1, 2],
  ]);
});

test("summary includes actual endpoints and correct per-route vehicle instead of stale fleet metadata", () => {
  const { route } = fixture();
  const summary = preview.prepareDriverSummary(route, "2026-11-05", { name: "Stale default", license_plate: "ABC-123", type: "van" });
  assert.equal(summary.vehicleName, "Dodge Caravan");
  assert.equal(summary.licensePlate, "ABC-123");
  assert.equal(summary.seatCapacity, "7 seats");
  assert.equal(summary.startLocation, "Driver start depot");
  assert.equal(summary.endLocation, "Driver end depot");
  assert.match(summary.startTime, /Thursday, Nov 5, 2026.*11:40 PM/);
  assert.match(summary.endTime, /Friday, Nov 6, 2026.*1:10 AM/);
});

test("service clock times do not depend on the viewer timezone and invalid values are explicit", () => {
  const original = process.env.TZ;
  try {
    for (const zone of ["Asia/Kolkata", "America/Toronto", "UTC"]) {
      process.env.TZ = zone;
      assert.equal(helpers.manifestTime("2026-11-06T00:15:00"), "12:15 AM");
      assert.equal(helpers.manifestDate("2026-11-06T00:15:00"), "Friday, Nov 6, 2026");
    }
  } finally { if (original === undefined) delete process.env.TZ; else process.env.TZ = original; }
  assert.equal(helpers.manifestTime("12:30 PM"), "12:30 PM");
  assert.equal(helpers.manifestTime("99:00"), "Not scheduled");
  assert.equal(helpers.manifestTime("13:80"), "Not scheduled");
  assert.equal(helpers.manifestDate("2026-02-30"), "");
});

test("complete booking fetch batches IDs beyond the default page and rejects missing jobs", async () => {
  const calls = [];
  const ids = Array.from({ length: 205 }, (_, index) => index + 1);
  const jobs = await helpers.loadManifestJobs([...ids, 1], async params => {
    calls.push(params);
    return params.job_ids.split(",").map(id => ({ id: Number(id) }));
  });
  assert.equal(jobs.length, 205);
  assert.deepEqual(calls.map(call => call.limit), [100, 100, 5]);
  await assert.rejects(helpers.loadManifestJobs([1, 2], async () => [{ id: 1 }]), /1 referenced booking/);
  await assert.rejects(helpers.loadManifestJobs([1], async () => { throw new Error("Unavailable"); }), /Unavailable/);
});

test("manifest renders all fields and escapes imported content using the existing Ant Design theme", () => {
  const { job, route } = fixture();
  job.worker_shuttle_detail.candidate_name = '<script>alert("x")</script>';
  const styles = new Proxy({}, { get: (_, key) => String(key) });
  const Section = load("app/route/_components/ShuttleManifestSection.tsx", { "./RouteExportPreview.module.css": { default: styles, __esModule: true } }).default;
  const summary = preview.prepareDriverSummary(route, "2026-11-05");
  const html = renderToStaticMarkup(React.createElement(Section, { locations: helpers.prepareShuttleManifestLocations(route, new Map([[1, job]]), "2026-11-05"), summary }));
  for (const label of ["Driver: Omar", "Dodge Caravan", "Candidate / contact", "Client / worksite", "Journey / destination", "Journey / pickup location", "Planned pickup / drop-off", "Shift / service date", "Start location", "End location", "008997", "Evening", "Montmorency station", "Driver start depot", "Driver end depot"]) assert.ok(html.includes(label), label);
  assert.ok(html.includes("ant-table"));
  assert.ok(html.includes("&lt;script&gt;"));
  assert.ok(!html.includes('<script>alert("x")</script>'));
});

module.exports = { load, helpers, preview, fixture };

test("shuttle preview requires fresh complete booking details before printing", () => {
  const { job, route: trip } = fixture();
  const Null = () => null;
  const styles = new Proxy({}, { get: (_, key) => String(key) });
  const Modal = ({ title, children, footer }) => React.createElement("section", null, title, children, footer);
  const Button = ({ children, disabled }) => React.createElement("button", { disabled }, children);
  const Text = ({ children }) => React.createElement("span", null, children);
  const Preview = load("app/route/_components/RouteExportPreview.tsx", {
    "@/utils/exportPreview.utils": preview,
    "@/utils/shuttleManifest.utils": helpers,
    "@/store/vehicle.store": { useVehicleStore: () => ({ vehicles: [] }) },
    "@/apis/jobs.api": {},
    "@/components/GoogleMaps": { __esModule: true, default: Null },
    "./DriverSummaryTable": { __esModule: true, default: Null },
    "./RouteStopsTable": { __esModule: true, default: Null },
    "./ShuttleManifestSection": { __esModule: true, default: Null },
    "./RouteExportPreview.module.css": { __esModule: true, default: styles },
    "./optimizationView.utils": { generateRoutePolylines: () => [], generateMapMarkers: () => [] },
    "react-to-print": { useReactToPrint: () => () => {} },
    antd: { Modal, Typography: { Title: Text, Text }, Button, Select: Null, Divider: Null, Alert: Null, Spin: Null, Empty: Null },
  }).default;
  const html = renderToStaticMarkup(React.createElement(Preview, {
    open: true, onClose() {}, jobs: [job], route: { id: 253, route_name: "Nov 5", status: "completed", scheduled_date: "2026-11-05", result: { routes: [trip] } },
  }));
  assert.match(html, /Shuttle manifest/);
  assert.match(html, /Loading complete booking details/);
  assert.match(html, /Draft · Pending share/);
  assert.match(html, /button disabled=""/);
  assert.equal(renderToStaticMarkup(React.createElement(Preview, { open: false })), "");
});

test("candidate counts reflect one location visit, including individual boarding times", () => {
  const { job, route } = fixture();
  route.leg = "GO";
  const jobs = new Map([1, 2, 3].map(id => [id, { ...job, id, job_type: "one_way", candidate_id: String(id) }]));
  route.stops = [
    stop("pickup", "2026-11-05T04:23:00", 1, "Côte-Vertu"),
    stop("pickup", "2026-11-05T04:25:00", 2, "  CÔTE-VERTU  "),
    stop("pickup", "2026-11-05T04:27:00", 3, "Côte-Vertu"),
    ...[1, 2, 3].map(id => stop("dropoff", "2026-11-05T04:40:00", id, "WeCook, Dorval")),
  ];
  const rows = helpers.prepareShuttleManifest(route, jobs, "2026-11-05");
  assert.deepEqual(rows.map(row => row.pickupCandidateCount), [3, 3, 3]);
  assert.deepEqual(rows.map(row => row.dropoffCandidateCount), [3, 3, 3]);
  const Section = load("app/route/_components/ShuttleManifestSection.tsx", {
    "./RouteExportPreview.module.css": { __esModule: true, default: new Proxy({}, { get: (_, key) => String(key) }) },
  }).default;
  const html = renderToStaticMarkup(React.createElement(Section, { locations: helpers.prepareShuttleManifestLocations(route, jobs, "2026-11-05"), summary: preview.prepareDriverSummary(route, "2026-11-05") }));
  const locations = helpers.prepareShuttleManifestLocations(route, jobs, "2026-11-05");
  assert.deepEqual(locations.map(visit => [visit.kind, visit.candidateCount, visit.rows.map(row => row.jobId)]), [
    ["pickup", 3, [1, 2, 3]], ["dropoff", 3, [1, 2, 3]],
  ]);
  assert.equal(locations[0].location, "Côte-Vertu");
  assert.match(locations[0].plannedArrival, /4:23 AM/);
  assert.match(locations[0].plannedDeparture, /4:27 AM/);
  assert.equal((html.match(/class="locationHeading"/g) || []).length, 2);
  assert.equal((html.match(/3 candidates/g) || []).length, 2);
  assert.match(html, /1\. .*Pickup/);
  assert.match(html, /2\. .*Drop-off/);
  assert.match(html, /3 passenger journeys/);
  const pickupSection = html.split('class="locationVisit"')[1];
  assert.equal((pickupSection.match(/Côte-Vertu/g) || []).length, 1, "Common pickup location belongs in its heading");
});

test("later visits and different locations have independent counts and duplicate candidates count once", () => {
  const { job, route } = fixture();
  route.leg = "GO";
  const jobs = new Map([1, 2, 3, 4].map(id => [id, { ...job, id, job_type: "one_way", candidate_id: String(id === 2 ? 1 : id) }]));
  route.stops = [
    stop("pickup", "2026-11-05T04:23:00", 1, "Station"),
    stop("pickup", "2026-11-05T04:25:00", 2, "Station"),
    stop("dropoff", "2026-11-05T04:40:00", 1, "Client"),
    stop("dropoff", "2026-11-05T04:40:00", 2, "Client"),
    stop("depot_end", "2026-11-05T05:00:00"),
    stop("depot_start", "2026-11-05T06:00:00"),
    stop("pickup", "2026-11-05T06:23:00", 3, "Station"),
    stop("pickup", "2026-11-05T06:25:00", 4, "Another station"),
    stop("dropoff", "2026-11-05T06:40:00", 3, "Client"),
    stop("dropoff", "2026-11-05T06:40:00", 4, "Client"),
  ];
  const rows = helpers.prepareShuttleManifest(route, jobs, "2026-11-05");
  assert.deepEqual(rows.map(row => row.pickupCandidateCount), [1, 1, 1, 1]);
  assert.deepEqual(rows.map(row => row.dropoffCandidateCount), [1, 1, 2, 2]);
  const visits = helpers.prepareShuttleManifestLocations(route, jobs, "2026-11-05");
  assert.deepEqual(visits.map(visit => [visit.sequence, visit.kind, visit.location, visit.candidateCount, visit.rows.map(row => row.jobId)]), [
    [1, "pickup", "Station", 1, [1, 2]], [2, "dropoff", "Client", 1, [1, 2]],
    [3, "pickup", "Station", 1, [3]], [4, "pickup", "Another station", 1, [4]],
    [5, "dropoff", "Client", 2, [3, 4]],
  ]);
});

test("co-located address aliases use physical coordinates for candidate counts", () => {
  const { job, route } = fixture();
  route.stops = [
    { ...stop("pickup", "2026-11-05T16:00:00", 1, "Client entrance"), latitude: 45.50001, longitude: -73.50001 },
    { ...stop("pickup", "2026-11-05T16:00:00", 2, "Client address"), latitude: 45.50002, longitude: -73.50002 },
    stop("dropoff", "2026-11-05T17:00:00", 1, "Home"), stop("dropoff", "2026-11-05T17:00:00", 2, "Home"),
  ];
  const rows = helpers.prepareShuttleManifest(route, new Map([[1, job], [2, { ...job, id: 2, candidate_id: "second" }]]), "2026-11-05");
  assert.deepEqual(rows.map(row => row.pickupCandidateCount), [2, 2]);
});

test("missing optional details render without placeholder text or empty labels", () => {
  const { job, route } = fixture();
  delete job.custom_fields.shift;
  delete job.worker_shuttle_detail.candidate_id;
  delete job.worker_shuttle_detail.candidate_phone;
  const Section = load("app/route/_components/ShuttleManifestSection.tsx", {
    "./RouteExportPreview.module.css": { __esModule: true, default: new Proxy({}, { get: (_, key) => String(key) }) },
  }).default;
  const html = renderToStaticMarkup(React.createElement(Section, { locations: helpers.prepareShuttleManifestLocations(route, new Map([[1, job]]), "2026-11-05"), summary: preview.prepareDriverSummary(route, "2026-11-05") }));
  assert.doesNotMatch(html, /Not specified|Candidate ID:/);
  assert.match(html, /Start:/);
  assert.match(html, /5:00 PM/);
});

test("per-driver export selects all their vehicle and projected trip fragments", () => {
  const { route } = fixture();
  const anotherDriver = { ...route, team_member_id: 180, team_member_name: "Vikas Singh" };
  const secondTrip = { ...route, vehicle_id: 54, source_optimization_id: 253 };
  const placeholder = { ...route, team_member_id: 190, team_member_name: "Empty driver", stops: [] };
  const routes = [route, anotherDriver, secondTrip, placeholder];
  assert.deepEqual(helpers.selectManifestRoutes(routes, 175), [route, secondTrip]);
  assert.deepEqual(helpers.selectManifestRoutes(routes, 180), [anotherDriver]);
  assert.equal(helpers.selectManifestRoutes(routes, "all").length, 3);
  assert.deepEqual(helpers.manifestDriverOptions(routes), [
    { value: "all", label: "All drivers" }, { value: 175, label: "Omar" }, { value: 180, label: "Vikas Singh" },
  ]);
});

test("selected driver filters the printed sections, map and PDF filename together", () => {
  const { job, route: trip } = fixture();
  const other = { ...trip, team_member_id: 180, team_member_name: "Vikas Singh",
    stops: trip.stops.map(stop => ({ ...stop, job_id: stop.job_id == null ? null : 2 })) };
  const jobs = [job, { ...job, id: 2 }];
  const mapInputs = [], sections = [];
  let printOptions;
  const Null = () => null;
  const Text = ({ children }) => React.createElement("span", null, children);
  const Preview = load("app/route/_components/RouteExportPreview.tsx", {
    react: { ...React, useState: initial => initial === "all" ? [175, () => {}] : React.useState(initial) },
    "@/utils/exportPreview.utils": preview,
    "@/utils/shuttleManifest.utils": helpers,
    "@/store/vehicle.store": { useVehicleStore: () => ({ vehicles: [] }) },
    "@/apis/jobs.api": {},
    "@/components/GoogleMaps": { __esModule: true, default: Null },
    "./DriverSummaryTable": { __esModule: true, default: Null },
    "./RouteStopsTable": { __esModule: true, default: Null },
    "./ShuttleManifestSection": { __esModule: true, default: props => { sections.push(props.summary.driverName); return null; } },
    "./RouteExportPreview.module.css": { __esModule: true, default: new Proxy({}, { get: (_, key) => String(key) }) },
    "./optimizationView.utils": {
      generateRoutePolylines: plan => { mapInputs.push(plan); return []; },
      generateMapMarkers: plan => { mapInputs.push(plan); return []; },
    },
    "react-to-print": { useReactToPrint: options => { printOptions = options; return () => {}; } },
    antd: {
      Modal: ({ title, children, footer }) => React.createElement("section", null, title, children, footer),
      Typography: { Title: Text, Text }, Button: ({ children }) => React.createElement("button", null, children),
      Select: ({ options }) => React.createElement("select", null, options.map(option => React.createElement("option", { key: option.value }, option.label))),
      Divider: Null, Alert: Null, Spin: Null, Empty: Null,
    },
  }).default;
  const html = renderToStaticMarkup(React.createElement(Preview, { open: true, onClose() {}, jobs,
    route: { id: 253, route_name: "Nov 5", status: "completed", scheduled_date: "2026-11-05", result: { routes: [trip, other] } },
  }));
  assert.deepEqual(sections, ["Omar"]);
  assert.equal(mapInputs.length, 2);
  for (const plan of mapInputs) {
    assert.deepEqual(plan.result.routes.map(route => route.team_member_id), [175]);
    assert.deepEqual(plan.job_ids, [1]);
    assert.deepEqual(plan.team_member_ids, [175]);
  }
  assert.equal(printOptions.documentTitle, "Nov 5_Omar_Manifest");
  assert.match(html, /All drivers/);
  assert.match(html, /Export for/);
});
