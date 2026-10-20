const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

function load(filename, imports = {}) {
  const source = fs.readFileSync(path.join(__dirname, "..", filename), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const exports = {};
  new Function("exports", "require", compiled)(exports, name => name in imports ? imports[name] : require(name));
  return exports;
}

const pickupUtils = load("utils/jobPickupType.utils.ts");
const estimatesUtils = load("app/route/_components/jobStopEstimates.utils.ts");
const appUtils = load("utils/app.utils.ts");
const jobsUtils = load("utils/jobs.utils.tsx", {
  "./app.utils": appUtils,
  "./jobPickupType.utils": pickupUtils,
  "@/components/Jobs/StatusBanner": () => null,
  "@/constants/country": { COUNTRY_CODES: [] },
});
const Card = load("app/route/_components/JobDetailsCard.tsx", {
  "./jobStopEstimates.utils": estimatesUtils,
  "@/utils/jobPickupType.utils": pickupUtils,
  "@/utils/app.utils": appUtils,
  "@/utils/jobs.utils": jobsUtils,
  "@/components/AddressAutocomplete": () => null,
  "@/apis/jobs.api": {},
  "@/store/jobs.store": { useJobsStore: () => ({ jobs: [], patchJobLocally() {} }) },
  "@/store/routes.store": { useRouteStore: () => ({ fetchRoutes() {}, selectedStatus: "assigned" }) },
  "@/store/depots.store": { useDepotStore: () => ({ depots: [] }) },
  "@/store/location-mapping.store": { useLocationMappingStore: () => ({ locationMappings: [] }) },
}).default;

test("optimization details show Round Trip and both actual estimates on either direction", () => {
  for (const [job_type, pickup, dropoff, date] of [
    ["one_way", "2026-09-29T20:30:00", "2026-09-29T20:50:00", "Tue, Sep 29"],
    ["return_only", "2026-09-30T05:35:00", "2026-09-30T06:20:00", "Wed, Sep 30"],
  ]) {
    const routeStops = [{ job_id: 42, stop_type: "pickup", arrival_time: pickup },
      { job_id: 42, stop_type: "dropoff", arrival_time: dropoff }];
    const html = renderToStaticMarkup(React.createElement(Card, {
      job: { id: 42, job_type, pickup_type: job_type, template_type: "worker_shuttle", status: "assigned",
        custom_fields: { pickup_type: "round_trip" },
        worker_shuttle_detail: { start_hour: "21:00", end_hour: "05:30", client_pick_up_time: "21:00" } },
      stopData: routeStops[0], routeStops, onClose() {},
    }));
    const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    assert.match(text, /Pickup Type Round Trip/);
    assert.match(html, /class="[^"]*border-emerald-400[^"]*uppercase[^"]*">\s*Round Trip/);
    assert.ok(text.includes(`Estimated pickup time ${appUtils.formatTime12h(pickup)}`));
    assert.ok(text.includes(`Estimated dropoff time ${appUtils.formatTime12h(dropoff)}`));
    assert.ok(text.includes(date));
    assert.doesNotMatch(text, /Trip Type|Client Pick Up Time|Candidate Pickup ETA|Trip Leg|Client Phone|Status|Candidate ID|Quart \/ Shift Ref|Reach Window/);
    assert.equal((html.match(/aria-current="step"/g) || []).length, 1);
  }
});

const { getJobStopEstimates } = estimatesUtils;
const routeStops = [
  { job_id: 7, stop_type: "pickup", arrival_time: "2026-09-29T22:30:00" },
  { job_id: 42, stop_type: "pickup", arrival_time: "2026-09-29T23:40:00" },
  { job_id: 7, stop_type: "dropoff", arrival_time: "2026-09-29T23:45:00" },
  { job_id: 42, stop_type: "dropoff", arrival_time: "2026-09-30T00:20:00" },
];

test("pickup and dropoff selections resolve the same job pair across midnight", () => {
  const job = { id: 42, pickup_eta: "2026-09-29T10:00:00", dropoff_eta: "2026-09-29T11:00:00" };
  for (const stop of [routeStops[1], routeStops[3]]) {
    assert.deepEqual(getJobStopEstimates(job, stop, routeStops), {
      pickup: "2026-09-29T23:40:00", dropoff: "2026-09-30T00:20:00",
    });
  }
});

test("the dropoff card highlights Dropoff and segregates passenger, journey, shift and assignment", () => {
  const html = renderToStaticMarkup(React.createElement(Card, {
    job: { id: 42, template_type: "worker_shuttle", status: "assigned",
      candidate_name: "Passenger", candidate_phone: "+1 438 123 4567", candidate_id: "C-42",
      pick_up_address: "Montmorency", drop_off_address: "553 Bd du Curé-Boivin, Boisbriand, Québec",
      client_phone: "HIDDEN-CLIENT-PHONE", custom_fields: { client_name: "Workplace", notes: "Bring a badge" } },
    routeStops, stopData: routeStops[3], driverName: "Alliance Driver 2", onClose() {},
  }));
  const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  assert.match(text, /Estimated pickup time 11:40 PM Tue, Sep 29/);
  assert.match(text, /Estimated dropoff time 12:20 AM Wed, Sep 30/);
  assert.match(html, /aria-current="step"[\s\S]*?<h4[^>]*>[\s\S]*?Dropoff/);
  assert.doesNotMatch(text, /ETA|Client Phone|HIDDEN-CLIENT-PHONE|Trip Type|Trip Leg|Status/);
  for (const section of ["Passenger", "Journey", "Shift &amp; schedule", "Assignment", "Notes"]) {
    assert.ok(html.includes(`aria-label="${section}"`));
  }
  assert.ok(text.includes("553 Bd du Curé-Boivin, Boisbriand, Québec"));
  assert.ok(text.includes("Mark Completed"));
  assert.ok(text.includes("Skip Stop"));
});

test("a missing counterpart is Not scheduled, rather than a shift time or stale saved ETA", () => {
  const stop = { job_id: 42, stop_type: "pickup", arrival_time: "2026-09-29T07:35:00" };
  const job = { id: 42, template_type: "worker_shuttle", start_hour: "08:00", end_hour: "17:00",
    pickup_eta: "2026-09-29T07:00:00", dropoff_eta: "2026-09-29T07:30:00" };
  assert.deepEqual(getJobStopEstimates(job, stop, [stop]), { pickup: stop.arrival_time, dropoff: undefined });
  const text = renderToStaticMarkup(React.createElement(Card, {
    job, routeStops: [stop], stopData: stop, onClose() {},
  })).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  assert.match(text, /Estimated pickup time 07:35 AM/);
  assert.match(text, /Estimated dropoff time Not scheduled/);
});

test("unassigned jobs never expose historical route estimates", () => {
  const job = { id: 42, template_type: "worker_shuttle", pickup_eta: "2026-09-29T07:00:00",
    dropoff_eta: "2026-09-29T08:00:00" };
  assert.deepEqual(getJobStopEstimates(job, routeStops[1], routeStops, true), {});
  const text = renderToStaticMarkup(React.createElement(Card, {
    job, routeStops, stopData: { stop_type: "unassigned", job_id: 42 }, isUnassigned: true, onClose() {},
  })).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  assert.match(text, /Estimated pickup time Not scheduled/);
  assert.match(text, /Estimated dropoff time Not scheduled/);
});

test("live route edits replace stale selected-stop and API estimates", () => {
  const selected = { ...routeStops[1], arrival_time: "2026-09-29T12:00:00" };
  assert.deepEqual(getJobStopEstimates({ id: 42 }, selected, routeStops), {
    pickup: routeStops[1].arrival_time, dropoff: routeStops[3].arrival_time,
  });
});

test("legacy round trips with one job ID resolve the selected leg without mixing directions", () => {
  const stops = [
    { job_id: 42, stop_type: "pickup", leg: "GO", arrival_time: "2026-09-29T07:00:00" },
    { job_id: 42, stop_type: "dropoff", leg: "GO", arrival_time: "2026-09-29T08:00:00" },
    { job_id: 42, stop_type: "pickup", leg: "RETURN", arrival_time: "2026-09-29T17:00:00" },
    { job_id: 42, stop_type: "dropoff", leg: "RETURN", arrival_time: "2026-09-29T18:00:00" },
  ];
  assert.deepEqual(getJobStopEstimates({ id: 42 }, stops[3], stops), {
    pickup: stops[2].arrival_time, dropoff: stops[3].arrival_time,
  });
});

test("saved job estimates are available when no route context was supplied", () => {
  const job = { id: 42, pickup_eta: "2026-09-29T07:00:00", dropoff_eta: "2026-09-29T08:00:00" };
  assert.deepEqual(getJobStopEstimates(job, { job_id: 42, stop_type: "dropoff", arrival_time: "2026-09-29T08:05:00" }), {
    pickup: job.pickup_eta, dropoff: "2026-09-29T08:05:00",
  });
});

test("pickup type handles existing response shapes without mutating routing direction", () => {
  for (const source of [
    { custom_fields: { pickup_type: "Round trip" } },
    { pickup_type: "round_trip" },
    { worker_shuttle_detail: { pickup_type: "round_trip" } },
  ]) {
    const job = { job_type: "return_only", ...source };
    assert.equal(pickupUtils.getJobPickupType(job), "round_trip");
    assert.equal(job.job_type, "return_only");
  }
  assert.equal(pickupUtils.getJobPickupType({ job_type: "return_only" }), "return_only");
  assert.equal(pickupUtils.getJobPickupType(null), undefined);
});
