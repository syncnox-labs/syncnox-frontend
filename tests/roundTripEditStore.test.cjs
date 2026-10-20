const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");

function storeWith(api) {
  const source = fs.readFileSync(`${__dirname}/../store/jobs.store.ts`, "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const exports = {};
  new Function("exports", "require", code)(exports, name => {
    if (name === "@/apis/jobs.api") return api;
    if (name === "@/utils/date.utils") return { findClosestDateToToday: () => null };
    return require(name);
  });
  return exports.useJobsStore;
}

const go = { id: 1, scheduled_date: "2026-10-13", job_type: "one_way", status: "assigned", candidate_name: "Before" };
const back = { ...go, id: 2, job_type: "return_only" };

test("a booking edit merges both legs without discarding unrelated plan jobs or another date", async () => {
  let fetches = 0;
  const changed = [{ ...go, candidate_name: "After" }, { ...back, candidate_name: "After" }];
  const store = storeWith({ updateJob: async () => ({ ...changed[0], updated_jobs: changed }), fetchJobs: async () => { fetches++; return []; } });
  const other = { ...go, id: 3, candidate_name: "Unrelated" };
  store.setState({ jobs: [go, other], allJobs: [go, back, other], draftJobs: [], allDraftJobs: [], selectedDate: "2026-10-20" });
  await store.getState().updateJobAction({ id: 1, candidate_name: "After" });
  assert.deepEqual(store.getState().jobs.map(job => [job.id, job.candidate_name]), [[1, "After"], [3, "Unrelated"], [2, "After"]]);
  assert.equal(store.getState().allJobs.find(job => job.id === 2).candidate_name, "After");
  assert.equal(fetches, 0);
  assert.equal(store.getState().isLoading, false);
});

test("single-job and older API responses still update the selected job", async () => {
  const store = storeWith({ updateJob: async () => ({ ...go, notes: "Updated" }) });
  store.setState({ jobs: [go, back] });
  await store.getState().updateJobAction({ id: 1, notes: "Updated" });
  assert.equal(store.getState().jobs[0].notes, "Updated");
  assert.deepEqual(store.getState().jobs[1], back);
});

test("a rejected booking edit keeps both local legs intact", async () => {
  const rejection = new Error("Partner is in progress");
  const store = storeWith({ updateJob: async () => { throw rejection; } });
  store.setState({ jobs: [go, back] });
  await assert.rejects(store.getState().updateJobAction({ id: 1, notes: "Not saved" }), /Partner is in progress/);
  assert.deepEqual(store.getState().jobs, [go, back]);
  assert.equal(store.getState().isLoading, false);
});

test("changing an unrouted booking's date refreshes the selected date filter", async () => {
  let request;
  const changed = [{ ...go, scheduled_date: "2026-10-14" }, { ...back, scheduled_date: "2026-10-14" }];
  const store = storeWith({ updateJob: async () => ({ ...changed[0], updated_jobs: changed }),
    fetchJobs: async params => { request = params; return []; } });
  store.setState({ jobs: [go, back], selectedDate: "2026-10-13" });
  await store.getState().updateJobAction({ id: 1, scheduled_date: "2026-10-14" });
  assert.equal(request.date, "2026-10-13");
  assert.deepEqual(store.getState().jobs, []);
});
