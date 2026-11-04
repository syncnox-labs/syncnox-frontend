const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");

function load(file, imports) {
  const code = ts.transpileModule(fs.readFileSync(`${__dirname}/../${file}`, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const exports = {};
  new Function("exports", "require", code)(exports, name => name in imports ? imports[name] : require(name));
  return exports;
}

function setup({ currentPlan = { id: 52 }, rejectDelete = false, rejectRefresh = false } = {}) {
  const calls = [];
  const helper = load("utils/refreshRoutesAfterDeletion.utils.ts", {
    "@/store/optimization.store": { useOptimizationStore: { getState: () => ({
      currentOptimization: currentPlan,
      fetchOptimization: async id => { calls.push(["plan", id]); if (rejectRefresh) throw new Error("Offline"); },
    }) } },
    "@/store/routes.store": { useRouteStore: { getState: () => ({
      refreshRoutes: async () => { calls.push(["routes"]); if (rejectRefresh) throw new Error("Offline"); },
    }) } },
  });
  const remove = kind => async ids => {
    calls.push([kind, ids]);
    if (rejectDelete) throw new Error("Already shared");
  };
  const jobs = load("store/jobs.store.ts", {
    "@/utils/refreshRoutesAfterDeletion.utils": helper,
    "@/utils/date.utils": { findClosestDateToToday: dates => dates[0] },
    "@/apis/jobs.api": { deleteJob: remove("delete-job"), deleteJobsBulk: remove("delete-jobs"),
      fetchJobs: async () => { calls.push(["jobs"]); return []; } },
  }).useJobsStore;
  const teams = load("store/team.store.ts", {
    "@/utils/refreshRoutesAfterDeletion.utils": helper,
    "@/store/jobs.store": { useJobsStore: jobs },
    "@/apis/team.api": { deleteTeam: remove("delete-team"), bulkDeleteTeams: remove("delete-teams") },
  }).useTeamStore;
  const record = { id: 1, name: "Deleted", scheduled_date: "2026-10-23", status: "draft" };
  jobs.setState({ jobs: [record], allJobs: [record] });
  teams.setState({ teams: [record, { id: 2, name: "Retained" }] });
  return { calls, jobs, teams, helper };
}

for (const bulk of [false, true]) {
  test(`${bulk ? "bulk" : "single"} job deletion reloads the job list, route summary and open plan`, async () => {
    const h = setup();
    if (bulk) await h.jobs.getState().deleteJobsAction([1], "draft");
    else await h.jobs.getState().deleteJobAction(1);
    assert.deepEqual(h.calls[0], [bulk ? "delete-jobs" : "delete-job", bulk ? [1] : 1]);
    assert.ok(h.calls.some(([action]) => action === "jobs"));
    assert.ok(h.calls.some(([action]) => action === "routes"));
    assert.ok(h.calls.some(([action, id]) => action === "plan" && id === 52));
    assert.deepEqual(h.jobs.getState().jobs, []);
  });

  test(`${bulk ? "bulk" : "single"} team deletion reloads released jobs and affected route state`, async () => {
    const h = setup();
    if (bulk) await h.teams.getState().bulkDeleteTeamsAction([1]);
    else await h.teams.getState().deleteTeamAction(1);
    assert.deepEqual(h.calls[0], [bulk ? "delete-teams" : "delete-team", bulk ? [1] : 1]);
    assert.deepEqual(h.teams.getState().teams.map(team => team.id), [2]);
    assert.ok(h.calls.some(([action]) => action === "jobs"));
    assert.ok(h.calls.some(([action]) => action === "routes"));
    assert.ok(h.calls.some(([action, id]) => action === "plan" && id === 52));
  });
}

test("blocked deletion retains records and does not refresh routes", async () => {
  for (const kind of ["job", "team"]) {
    const h = setup({ rejectDelete: true });
    const remove = kind === "job" ? h.jobs.getState().deleteJobAction : h.teams.getState().deleteTeamAction;
    await assert.rejects(remove(1), /Already shared/);
    assert.equal(h.calls.length, 1);
    assert.equal(h.jobs.getState().jobs.length, 1);
    assert.equal(h.teams.getState().teams.length, 2);
  }
});

test("a route reload failure does not misreport a completed deletion as failed", async () => {
  const h = setup({ rejectRefresh: true });
  await h.jobs.getState().deleteJobAction(1);
  assert.deepEqual(h.jobs.getState().jobs, []);
  assert.equal(h.jobs.getState().error, null);
});

test("deleting while no plan is open refreshes the route list alone", async () => {
  const h = setup({ currentPlan: null });
  await h.helper.refreshRoutesAfterDeletion();
  assert.deepEqual(h.calls, [["routes"]]);
});
