const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");

function setup(initialJobs, overrides = {}) {
  const jobs = [...initialJobs];
  const calls = [];
  const matching = status => jobs.filter(job => status === "all" || job.status === status);
  const api = {
    fetchJobsCalendar: async (date, status, skip = 0) => {
      calls.push({ type: "calendar", date, status, ...(skip ? { skip } : {}) });
      if (overrides.calendar) return overrides.calendar(date, status, skip);
      const filtered = matching(status);
      const day = filtered.filter(job => job.scheduled_date === date);
      return { date, status, available_dates: [...new Set(filtered.map(job => job.scheduled_date).filter(Boolean))].sort(),
        unscheduled_count: filtered.filter(job => !job.scheduled_date).length,
        total: day.length, jobs: day.slice(skip, skip + 1000) };
    },
    fetchJobs: async params => {
      calls.push({ type: "page", ...params });
      if (overrides.page) return overrides.page(params);
      const day = matching(params.status || "all").filter(job => job.scheduled_date === params.date);
      return day.slice(params.skip, params.skip + params.limit);
    },
    createJob: async job => { jobs.push(job); return job; },
    updateJob: async change => {
      const index = jobs.findIndex(job => job.id === change.id);
      jobs[index] = { ...jobs[index], ...change };
      return jobs[index];
    },
    deleteJob: async id => { const index = jobs.findIndex(job => job.id === id); if (index >= 0) jobs.splice(index, 1); },
    deleteJobsBulk: async ids => { for (const id of ids) { const index = jobs.findIndex(job => job.id === id); if (index >= 0) jobs.splice(index, 1); } },
  };
  const source = fs.readFileSync(`${__dirname}/../store/jobs.store.ts`, "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true,
  } }).outputText;
  const exports = {};
  new Function("exports", "require", compiled)(exports, name => {
    if (name === "@/apis/jobs.api") return api;
    if (name === "@/utils/date.utils") return { findClosestDateToToday: dates => dates[0] };
    if (name === "@/utils/refreshRoutesAfterDeletion.utils") return { refreshRoutesAfterDeletion: async () => {} };
    return require(name);
  });
  return { store: exports.useJobsStore, calls, jobs };
}

const job = (id, date, status = "draft") => ({ id, scheduled_date: date, status });

test("calendar requests send the selected date and status, adding pagination only when needed", async () => {
  const source = fs.readFileSync(`${__dirname}/../apis/jobs.api.ts`, "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
  const exports = {}, requests = [];
  new Function("exports", "require", compiled)(exports, name => name === "@/config/apiClient.config"
    ? { __esModule: true, default: { get: async url => { requests.push(url); return { data: {} }; } } }
    : require(name));
  await exports.fetchJobsCalendar("2026-11-05", "draft");
  await exports.fetchJobsCalendar(null, "all", 1000);
  assert.equal(requests[0], "/jobs/calendar?status=draft&date=2026-11-05");
  assert.equal(requests[1], "/jobs/calendar?status=all&skip=1000");
});

test("initial load selects the closest available date without downloading other days", async () => {
  const h = setup([job(1, "2020-01-01")]);
  await h.store.getState().startJobsList();
  assert.equal(h.store.getState().selectedDate, "2020-01-01");
  assert.deepEqual(h.store.getState().jobs.map(item => item.id), [1]);
  assert.equal(h.calls.length, 2);
  assert.ok(h.calls.every(call => call.type === "calendar" && call.status === "draft"));
});

test("the jobs screen loads one date and status, while the calendar retains all matching dates", async () => {
  const h = setup([job(1, "2026-11-05"), job(2, "2026-11-12"), job(3, "2026-11-12", "completed")]);
  h.store.setState({ selectedDate: "2026-11-05" });
  await h.store.getState().startJobsList();
  assert.deepEqual(h.calls, [{ type: "calendar", date: "2026-11-05", status: "draft" }]);
  assert.deepEqual(h.store.getState().jobs.map(item => item.id), [1]);
  assert.deepEqual(h.store.getState().draftJobDates, ["2026-11-05", "2026-11-12"]);
  h.store.getState().setSelectedDate("2026-11-12");
  await h.store.getState().loadJobsList("2026-11-12", "draft");
  assert.deepEqual(h.store.getState().jobs.map(item => item.id), [2]);
  await h.store.getState().loadJobsList("2026-11-12", "completed");
  assert.deepEqual(h.store.getState().jobs.map(item => item.id), [3]);
  assert.deepEqual(h.store.getState().draftJobDates, ["2026-11-12"]);
  await h.store.getState().loadJobsList("2026-11-05", "completed");
  assert.deepEqual(h.store.getState().jobs, []);
  assert.deepEqual(h.store.getState().draftJobDates, ["2026-11-12"]);
  await h.store.getState().loadJobsList("2026-11-12", "all");
  assert.deepEqual(h.store.getState().jobs.map(item => item.id), [2, 3]);
  assert.ok(h.calls.every(call => call.type === "calendar"));
});

test("all pages are loaded for the selected day without fetching other days", async () => {
  const h = setup([...Array.from({ length: 1101 }, (_, index) => job(index + 1, "2026-11-05")),
    job(9000, "2026-11-12")]);
  h.store.setState({ selectedDate: "2026-11-05" });
  await h.store.getState().startJobsList();
  assert.equal(h.store.getState().jobs.length, 1101);
  assert.deepEqual(h.calls, [
    { type: "calendar", date: "2026-11-05", status: "draft" },
    { type: "page", date: "2026-11-05", status: "draft", skip: 1000, limit: 1000 },
  ]);
});

test("unscheduled jobs remain accessible and paginated without fetching jobs from other dates", async () => {
  const h = setup([...Array.from({ length: 1001 }, (_, index) => job(index + 1, null)),
    job(2000, null, "completed")]);
  await h.store.getState().startJobsList();
  assert.equal(h.store.getState().selectedDate, null);
  assert.equal(h.store.getState().jobsListDate, "unscheduled");
  assert.equal(h.store.getState().unscheduledJobsCount, 1001);
  assert.equal(h.store.getState().jobs.length, 1001);
  assert.deepEqual(h.calls.slice(-2), [
    { type: "calendar", date: null, status: "draft" },
    { type: "calendar", date: null, status: "draft", skip: 1000 },
  ]);
  await h.store.getState().loadJobsList("unscheduled", "completed");
  assert.deepEqual(h.store.getState().jobs.map(item => item.id), [2000]);
  h.jobs.push(job(3000, "2026-11-05"));
  h.store.getState().setSelectedDate("2026-11-05");
  await h.store.getState().loadJobsList("2026-11-05", "completed");
  assert.equal(h.store.getState().selectedDate, "2026-11-05");
  assert.equal(h.store.getState().unscheduledJobsCount, 1);
});

test("a page failure reports an error rather than publishing an incomplete day", async () => {
  const h = setup(Array.from({ length: 1001 }, (_, index) => job(index + 1, "2026-11-05")),
    { page: async () => { throw new Error("Page unavailable"); } });
  h.store.setState({ selectedDate: "2026-11-05" });
  await h.store.getState().startJobsList();
  assert.deepEqual(h.store.getState().jobs, []);
  assert.equal(h.store.getState().error, "Page unavailable");
  assert.equal(h.store.getState().isLoading, false);
});

test("out-of-order date responses and responses after leaving cannot replace the current list", async () => {
  let resolveSlow;
  const h = setup([], { calendar: (date, status) => date === "2026-11-05"
    ? new Promise(resolve => { resolveSlow = resolve; })
    : Promise.resolve({ date, status, available_dates: [date], total: 1, jobs: [job(2, date)] }) });
  h.store.setState({ selectedDate: "2026-11-05" });
  const slow = h.store.getState().startJobsList();
  h.store.getState().setSelectedDate("2026-11-12");
  await h.store.getState().loadJobsList("2026-11-12", "draft");
  resolveSlow({ date: "2026-11-05", status: "draft", available_dates: ["2026-11-05"], total: 1, jobs: [job(1, "2026-11-05")] });
  await slow;
  assert.equal(h.store.getState().selectedDate, "2026-11-12");
  assert.deepEqual(h.store.getState().jobs.map(item => item.id), [2]);
  const leaving = h.store.getState().loadJobsList("2026-11-05", "draft");
  h.store.getState().stopJobsList();
  resolveSlow({ date: "2026-11-05", status: "draft", available_dates: [], total: 1, jobs: [job(1, "2026-11-05")] });
  await leaving;
  assert.equal(h.store.getState().jobsListActive, false);
  assert.deepEqual(h.store.getState().jobs, []);
});

test("an older full-history request cannot overwrite the scoped list after navigation", async () => {
  let resolveOld;
  const h = setup([job(1, "2026-11-05")], {
    page: () => new Promise(resolve => { resolveOld = resolve; }),
  });
  const oldRequest = h.store.getState().fetchAllJobs();
  h.store.setState({ selectedDate: "2026-11-05" });
  await h.store.getState().startJobsList();
  resolveOld([job(99, "2026-11-05")]);
  await oldRequest;
  assert.deepEqual(h.store.getState().jobs.map(item => item.id), [1]);
  assert.equal(h.store.getState().isLoading, false);
  const callsBefore = h.calls.length;
  await h.store.getState().fetchAllJobs();
  assert.deepEqual(h.calls.slice(callsBefore), [{ type: "calendar", date: "2026-11-05", status: "draft" }]);
});

test("a late status response cannot replace the newly selected status", async () => {
  let releaseDraft;
  const h = setup([], { calendar: (date, status) => status === "draft"
    ? new Promise(resolve => { releaseDraft = resolve; })
    : Promise.resolve({ date, status, available_dates: [date], total: 1, jobs: [job(2, date, status)] }) });
  h.store.setState({ selectedDate: "2026-11-05" });
  const draft = h.store.getState().startJobsList();
  await h.store.getState().loadJobsList("2026-11-05", "completed");
  releaseDraft({ date: "2026-11-05", status: "draft", available_dates: ["2026-11-05"], total: 1, jobs: [job(1, "2026-11-05")] });
  await draft;
  assert.equal(h.store.getState().jobsListStatus, "completed");
  assert.deepEqual(h.store.getState().jobs.map(item => item.id), [2]);
});

test("create, edit, delete and import refresh the active date without fetching all history", async () => {
  const h = setup([job(1, "2026-11-05")]);
  h.store.setState({ selectedDate: "2026-11-05" });
  await h.store.getState().startJobsList();
  await h.store.getState().createJobAction(job(2, "2026-11-12"));
  assert.equal(h.store.getState().selectedDate, "2026-11-12");
  assert.deepEqual(h.store.getState().jobs.map(item => item.id), [2]);
  await h.store.getState().updateJobAction({ id: 2, scheduled_date: "2026-11-05" });
  assert.deepEqual(h.store.getState().jobs, []);
  h.store.getState().setSelectedDate("2026-11-05");
  await h.store.getState().loadJobsList("2026-11-05", "draft");
  await h.store.getState().deleteJobAction(1);
  assert.deepEqual(h.store.getState().jobs.map(item => item.id), [2]);
  h.jobs.push(job(3, "2026-11-13"));
  h.store.getState().setSelectedDate("2026-11-13");
  await h.store.getState().refreshDraftJobs();
  assert.deepEqual(h.store.getState().jobs.map(item => item.id), [3]);
  assert.ok(h.calls.every(call => call.type === "calendar"));
});

test("a refresh started before a mutation cannot hide the newly created job", async () => {
  let releaseOld;
  let count = 0;
  let h;
  h = setup([job(1, "2026-11-05")], { calendar: (date, status) => {
    count++;
    if (count === 2) return new Promise(resolve => { releaseOld = resolve; });
    const day = h.jobs.filter(item => item.scheduled_date === date && item.status === status);
    return Promise.resolve({ date, status, available_dates: [date], unscheduled_count: 0, total: day.length, jobs: day });
  } });
  h.store.setState({ selectedDate: "2026-11-05" });
  await h.store.getState().startJobsList();
  const old = h.store.getState().loadJobsList("2026-11-05", "draft", false, true);
  await h.store.getState().createJobAction(job(2, "2026-11-05"));
  releaseOld({ date: "2026-11-05", status: "draft", available_dates: ["2026-11-05"], unscheduled_count: 0,
    total: 1, jobs: [job(1, "2026-11-05")] });
  await old;
  assert.deepEqual(h.store.getState().jobs.map(item => item.id), [1, 2]);
});
