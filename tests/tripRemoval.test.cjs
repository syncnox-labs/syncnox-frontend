const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const source = fs.readFileSync(path.join(__dirname, "../app/route/_components/tripRemoval.utils.ts"), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const helpers = {};
new Function("exports", compiled)(helpers);
const { findRoundTripPartner, getTripRemovalTargets } = helpers;

const job = (id, job_type, changes = {}) => ({
  id, job_type, template_type: "worker_shuttle", scheduled_date: "2026-09-29",
  custom_fields: { candidate_id: "7107", candidate_name: "Passenger", client_name: "Client", start_hour: "17:00", end_hour: "04:00" },
  ...changes,
});
const outbound = job(10512, "one_way");
const returning = job(10513, "return_only");

test("current leg targets only the selected job, which owns both stops", () => {
  const routes = [{ stops: [
    { job_id: 10512, stop_type: "pickup" }, { job_id: 10512, stop_type: "dropoff" },
    { job_id: 10513, stop_type: "pickup" }, { job_id: 10513, stop_type: "dropoff" },
  ] }];
  assert.deepEqual(getTripRemovalTargets(routes, 0, 10512), [{ routeIndex: 0, jobId: 10512 }]);
});

test("all jobs targets both directions even on different drivers", () => {
  const routes = [
    { stops: [{ job_id: 10512 }, { job_id: 10512 }] },
    { stops: [{ job_id: 10513 }, { job_id: 10513 }] },
  ];
  assert.equal(findRoundTripPartner(outbound, [outbound, returning]), returning);
  assert.equal(findRoundTripPartner(returning, [outbound, returning]), outbound);
  assert.deepEqual(getTripRemovalTargets(routes, 0, 10512, 10513), [
    { routeIndex: 0, jobId: 10512 }, { routeIndex: 1, jobId: 10513 },
  ]);
});

test("edited end hour does not break the opposite-leg link", () => {
  const edited = job(10513, "return_only", {
    custom_fields: { ...returning.custom_fields, end_hour: "04:35", start_hour: "17:00:00" },
  });
  assert.equal(findRoundTripPartner(outbound, [outbound, edited]), edited);
});

test("another passenger or another date is never selected", () => {
  const other = job(10514, "return_only", {
    custom_fields: { ...returning.custom_fields, candidate_id: "9999" },
  });
  const tomorrow = job(10515, "return_only", { scheduled_date: "2026-09-30" });
  assert.equal(findRoundTripPartner(outbound, [outbound, other, tomorrow]), undefined);
});

test("ambiguous opposite jobs are not linked automatically", () => {
  assert.equal(findRoundTripPartner(outbound, [outbound, returning, job(10516, "return_only")]), undefined);
});
