const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

function loadUtility(filename, imports = {}) {
  const source = fs.readFileSync(path.join(__dirname, "../utils", filename), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
  }).outputText;
  const exports = {};
  new Function("exports", "require", compiled)(exports, name => {
    if (name in imports) return imports[name];
    return require(name);
  });
  return exports;
}

const appUtils = loadUtility("app.utils.ts");
const { createJobTableColumns } = loadUtility("jobs.utils.tsx", {
  "./app.utils": appUtils,
  "./jobPickupType.utils": loadUtility("jobPickupType.utils.ts"),
  "@/components/Jobs/StatusBanner": () => null,
  "@/constants/country": { COUNTRY_CODES: [] },
});

test("split round trips retain their booking pickup type and directional job type", () => {
  const pickup = columns().find(column => column.field === "pickup_type");
  for (const job_type of ["one_way", "return_only"]) {
    const job = { job_type, pickup_type: job_type, custom_fields: { pickup_type: "round_trip" } };
    assert.equal(pickup.valueGetter({ data: job }), "Round Trip");
    assert.equal(job.job_type, job_type);
    assert.equal(pickup.valueGetter({ data: { job_type } }), job_type === "one_way" ? "One Way" : "Return Only");
  }
});

function columns(templateType = "worker_shuttle", jobStatus = "assigned") {
  return createJobTableColumns({ templateType, jobStatus, teamsMap: { 8: "Vikas SINGH" } });
}

test("assigned shuttle columns show both stop ETAs and the route's vehicle", () => {
  const assigned = columns();
  const pickup = assigned.find(column => column.field === "pickup_eta");
  const dropoff = assigned.find(column => column.field === "dropoff_eta");
  const vehicle = assigned.find(column => column.field === "vehicle_name");
  assert.equal(pickup.valueFormatter({ value: "2026-09-29T23:30:00" }), "11:30 PM");
  assert.equal(dropoff.valueFormatter({ value: "2026-09-30T00:30:00" }), "12:30 AM");
  assert.equal(pickup.tooltipField, "pickup_eta");
  assert.equal(dropoff.tooltipField, "dropoff_eta");
  assert.equal(vehicle.valueFormatter({ value: "Van 15" }), "Van 15");
  for (const column of [pickup, dropoff, vehicle]) {
    assert.equal(column.valueFormatter({ value: null }), "-");
  }
});

test("assignment columns are scoped to the worker shuttle Assigned view", () => {
  for (const [template, status] of [
    ["worker_shuttle", "draft"], ["worker_shuttle", "completed"],
    ["pickup_delivery_job", "assigned"],
  ]) {
    assert.equal(columns(template, status).some(column =>
      ["pickup_eta", "dropoff_eta", "vehicle_name"].includes(column.field)), false);
  }
  assert.equal(columns("worker_shuttle", "draft").some(column => column.field === "route_name"), false);
});

test("assigned route name links to its optimization and handles missing routes", () => {
  const route = columns().find(column => column.field === "route_name");
  const rendered = route.cellRenderer({ value: "Night shuttle", data: { optimization_id: 21 } });
  assert.equal(rendered.props.href, "/route/21");
  assert.equal(rendered.props.children, "Night shuttle");
  assert.equal(route.cellRenderer({ value: null, data: {} }), "-");
});

test("team filtering still uses the displayed member name in both templates", () => {
  for (const template of ["worker_shuttle", "pickup_delivery_job"]) {
    const team = columns(template).find(column => column.field === "assigned_to");
    assert.equal(team.filter, "agTextColumnFilter");
    assert.equal(team.filterValueGetter({ data: { assigned_to: 8 } }), "Vikas SINGH");
    assert.equal(team.filterValueGetter({ data: {} }), "");
  }
});
