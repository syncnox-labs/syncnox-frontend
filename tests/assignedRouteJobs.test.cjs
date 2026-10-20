const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const source = fs.readFileSync(path.join(__dirname, "../app/route/_components/assignedRouteJobs.utils.ts"), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const helpers = {};
const additionHelpers = {};
new Function("exports", ts.transpileModule(fs.readFileSync(path.join(__dirname, "../app/route/_components/jobAddition.utils.ts"), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText)(additionHelpers);
new Function("exports", "require", compiled)(helpers, name => {
  assert.equal(name, "./jobAddition.utils");
  return additionHelpers;
});
const { getAssignedRouteJobs } = helpers;

const pickup = (job_id, hour = "08") => ({ job_id, stop_type: "pickup", arrival_time: `2026-09-29T${hour}:00:00` });
const dropoff = (job_id, hour = "09") => ({ job_id, stop_type: "dropoff", arrival_time: `2026-09-29T${hour}:00:00` });
const job = (id, status = "assigned") => ({ id, status, assigned_to: 99, route_name: "Old route", vehicle_name: "Old vehicle" });
const plan = () => ({
  id: 21, route_name: "Night shuttle", job_ids: [1, 2, 3, 4, 5], result: { routes: [
    { team_member_id: 8, vehicle_id: 11, vehicle_name: "New van", leg: "GO",
      stops: [{ stop_type: "depot_start" }, pickup(1), pickup(2), dropoff(1), dropoff(2)] },
    { team_member_id: 9, vehicle_id: 12, vehicle_name: "Bus", leg: "RETURN",
      stops: [pickup(3, "17"), dropoff(3, "18")] },
  ] },
});

test("optimized additions keep their badge in assigned and unassigned tables without changing lifecycle status", () => {
  const route = plan();
  route.result.added_job_ids = [1, 4];
  route.result.unassigned_jobs = [{ job_id: 4, is_new: true }];
  const jobs = [job(1), job(2), job(4, "draft")];
  assert.equal(helpers.getAssignedRouteJobs(route, jobs)[0].is_new, true);
  assert.equal(helpers.getAssignedRouteJobs(route, jobs)[1].is_new, false);
  assert.equal(helpers.getUnassignedRouteJobs(route, jobs)[0].is_new, true);
  assert.equal(jobs[0].is_new, undefined);
});

test("shows each assigned job once and excludes unassigned jobs and jobs from other plans", () => {
  const route = plan();
  const rows = getAssignedRouteJobs(route, [job(1), job(2), job(3), job(4, "draft"), job(5), job(99)]);
  assert.deepEqual(rows.map(row => row.id), [1, 2, 3]);
  // Job 5 has assigned status but belongs to no trip in this plan.
  assert.equal(rows.some(row => row.id === 5), false);
});

test("the table remains fixed to Assigned even when route stops contain other statuses", () => {
  for (const status of ["draft", "in_progress", "in_transit", "completed", "failed", "cancelled"]) {
    assert.deepEqual(getAssignedRouteJobs(plan(), [job(1, status)]), []);
  }
});

test("route focus and driver search restrict the table to the matching trips", () => {
  const jobs = [job(1), job(2), job(3)];
  assert.deepEqual(getAssignedRouteJobs(plan(), jobs, 1).map(row => row.id), [3]);
  assert.deepEqual(getAssignedRouteJobs(plan(), jobs, null, new Set([0])).map(row => row.id), [1, 2]);
  assert.deepEqual(getAssignedRouteJobs(plan(), jobs, 1, new Set([0])), []);
  assert.deepEqual(getAssignedRouteJobs(plan(), jobs, null, new Set()), []);
  assert.deepEqual(getAssignedRouteJobs(plan(), jobs).map(row => row.id), [1, 2, 3]);
});

test("current route vehicle, driver, name and ETAs override stale job data without mutating the store", () => {
  const route = plan();
  const stored = { ...job(1), pickup_eta: "old-pickup", dropoff_eta: "old-dropoff" };
  const before = structuredClone({ route, stored });
  const [row] = getAssignedRouteJobs(route, [stored]);
  assert.equal(row.optimization_id, 21);
  assert.equal(row.route_name, "Night shuttle");
  assert.equal(row.assigned_to, 8);
  assert.equal(row.vehicle_id, 11);
  assert.equal(row.vehicle_name, "New van");
  assert.equal(row.pickup_eta, "2026-09-29T08:00:00");
  assert.equal(row.dropoff_eta, "2026-09-29T09:00:00");
  assert.deepEqual({ route, stored }, before);
});

test("omitted leader self-stops retain the API ETA for the missing end of the trip", () => {
  const route = plan();
  route.result.routes[0].stops = [dropoff(1)];
  const [row] = getAssignedRouteJobs(route, [{ ...job(1), pickup_eta: "2026-09-29T07:30:00" }]);
  assert.equal(row.pickup_eta, "2026-09-29T07:30:00");
  assert.equal(row.dropoff_eta, "2026-09-29T09:00:00");
});

test("delivery job stops and empty results work without shuttle-specific data", () => {
  const route = plan();
  route.result.routes[0].stops = [{ ...pickup(1), stop_type: "job" }];
  assert.equal(getAssignedRouteJobs(route, [job(1)])[0].pickup_eta, "2026-09-29T08:00:00");
  assert.deepEqual(getAssignedRouteJobs({ id: 21 }, [job(1)]), []);
  assert.deepEqual(getAssignedRouteJobs(route, []), []);
});

test("unassigned table rows use explicit current-plan membership and clear stale assignments", () => {
  const { getUnassignedRouteJobs } = helpers;
  const route = plan();
  route.result.unassigned_jobs = [{ job_id: 4 }, { job_id: 4 }, { job_id: 1 }];
  const stored = { ...job(4, "draft"), pickup_eta: "old", dropoff_eta: "old", vehicle_id: 99 };
  const before = structuredClone(stored);
  const rows = getUnassignedRouteJobs(route, [job(1), stored, job(5, "draft"), job(99, "draft")]);
  assert.deepEqual(rows.map(row => row.id), [4]);
  assert.equal(rows[0].status, "draft", "assignment presentation must not change persisted lifecycle status");
  for (const key of ["assigned_to", "vehicle_id", "vehicle_name", "pickup_eta", "dropoff_eta"]) {
    assert.equal(rows[0][key], undefined, key);
  }
  assert.equal(rows[0].optimization_id, route.id);
  assert.deepEqual(stored, before);
});
