const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

const listCode = ts.transpileModule(fs.readFileSync(`${__dirname}/../app/plan/_components/JobsList.tsx`, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
}).outputText;

function displayedJobIds(store) {
  let rows;
  const Null = () => null;
  const exports = {};
  const imports = {
    "./planStyles": {},
    "@/store/jobs.store": { useJobsStore: () => store.getState() },
    "@/store/team.store": { useTeamStore: () => ({ getTeamsMap: () => ({}) }) },
    "@/store/index.store": { useIndexStore: () => ({ activeJobTemplate: "worker_shuttle" }) },
    "@/utils/jobs.utils": { createJobTableColumns: () => [], STANDARD_JOB_FIELD_KEYS: new Set() },
    "@/components/Table/ActionsColumn": { createActionsColumn: () => ({}) },
    "@/components/Table/BaseTable": { __esModule: true, default: ({ rowData }) => { rows = rowData; return null; } },
    antd: { Button: Null, Drawer: Null, Modal: Null, Dropdown: Null, Typography: { Title: Null },
      Flex: ({ children }) => React.createElement(React.Fragment, null, children) },
  };
  new Function("exports", "require", listCode)(exports, name => {
    if (name in imports) return imports[name];
    if (name.startsWith("@/")) return { __esModule: true, default: Null };
    return require(name);
  });
  renderToStaticMarkup(React.createElement(exports.default));
  return rows.map(job => job.id);
}

function storeWith(jobs) {
  const requests = [];
  let failAt;
  const code = ts.transpileModule(fs.readFileSync(`${__dirname}/../store/jobs.store.ts`, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const exports = {};
  new Function("exports", "require", code)(exports, name => {
    if (name === "@/apis/jobs.api") return {
      fetchJobs: async params => {
        requests.push(params);
        if (failAt !== undefined && params.skip === failAt) throw new Error("Refresh failed");
        const filtered = jobs.filter(job => (!params.date || job.scheduled_date === params.date)
          && (!params.status || job.status === params.status));
        return filtered.slice(params.skip || 0, (params.skip || 0) + params.limit);
      },
      createJob: async job => { jobs.push(job); return job; },
    };
    if (name === "@/utils/date.utils") return { findClosestDateToToday: dates => dates[0] };
    if (name === "@/utils/refreshRoutesAfterDeletion.utils") return { refreshRoutesAfterDeletion: async () => {} };
    return require(name);
  });
  return { store: exports.useJobsStore, requests, failAt: skip => { failAt = skip; } };
}

const job = (id, date = "2026-10-23", status = "draft") => ({ id, scheduled_date: date, status });

test("refreshing an import keeps jobs from every imported date available without reloading", async () => {
  const existing = job(1, "2026-10-15");
  const imported = [job(2), job(3, "2026-10-24")];
  const { store, requests } = storeWith([existing, ...imported]);
  store.setState({ jobs: [existing], allJobs: [existing], selectedDate: "2026-10-15" });
  // The importer selects the first imported date before refreshing the list.
  store.getState().setSelectedDate(imported[0].scheduled_date);
  await store.getState().refreshDraftJobs();
  assert.equal(requests[0].date, undefined);
  assert.deepEqual(store.getState().jobs.map(job => job.id), [1, 2, 3]);
  assert.deepEqual(store.getState().draftJobDates, ["2026-10-15", "2026-10-23", "2026-10-24"]);
  assert.equal(store.getState().selectedDate, "2026-10-23");
  for (const entry of [existing, ...imported]) {
    store.getState().setSelectedDate(entry.scheduled_date);
    const state = store.getState();
    assert.deepEqual(state.draftJobs.map(job => job.id), [entry.id]);
    assert.deepEqual(displayedJobIds(store), [entry.id]);
  }
});

test("job refresh loads every API page instead of truncating at 1,000 jobs", async () => {
  const jobs = Array.from({ length: 2107 }, (_, index) => job(index + 1,
    index < 2000 ? "2026-10-23" : "2026-10-24"));
  const { store, requests } = storeWith(jobs);
  store.setState({ selectedDate: "2026-10-23" });
  await store.getState().refreshDraftJobs();
  assert.deepEqual(requests.map(params => params.skip), [0, 1000, 2000]);
  assert.equal(store.getState().jobs.length, 2107);
  assert.equal(new Set(store.getState().jobs.map(job => job.id)).size, 2107);
  store.getState().setSelectedDate("2026-10-24");
  assert.equal(store.getState().draftJobs.length, 107);
});

test("status filtering retains dates and fetches all pages of matching jobs", async () => {
  const jobs = [job(1, "2026-10-15", "assigned"),
    ...Array.from({ length: 1001 }, (_, index) => job(index + 2, index % 2 ? "2026-10-23" : "2026-10-24"))];
  const { store, requests } = storeWith(jobs);
  store.setState({ allJobs: jobs, selectedDate: "2026-10-23" });
  await store.getState().fetchJobsByStatus("draft");
  assert.equal(store.getState().jobs.length, 1001);
  assert.ok(requests.every(params => params.status === "draft" && !params.date));
  assert.deepEqual(store.getState().draftJobDates, ["2026-10-23", "2026-10-24"]);
  assert.equal(store.getState().allJobs.length, 1002);
});

test("creating a job on another date immediately makes it visible", async () => {
  const existing = job(1, "2026-10-15"), created = job(2);
  const { store } = storeWith([existing]);
  store.setState({ jobs: [existing], allJobs: [existing], selectedDate: existing.scheduled_date });
  await store.getState().createJobAction(created);
  assert.equal(store.getState().selectedDate, created.scheduled_date);
  assert.deepEqual(store.getState().draftJobs.map(job => job.id), [2]);
});

test("a later-page failure preserves the previous list instead of publishing a partial refresh", async () => {
  const { store, failAt } = storeWith(Array.from({ length: 1001 }, (_, index) => job(index + 1)));
  const existing = job(9000);
  store.setState({ jobs: [existing], allJobs: [existing] });
  failAt(1000);
  await store.getState().refreshDraftJobs();
  assert.equal(store.getState().jobs.length, 1);
  assert.deepEqual(store.getState().jobs, [existing]);
  assert.deepEqual(store.getState().allJobs, [existing]);
  assert.equal(store.getState().error, "Refresh failed");
  assert.equal(store.getState().isLoading, false);
});

test("empty refresh clears stale date indicators and table rows", async () => {
  const { store } = storeWith([]);
  store.setState({ jobs: [job(1)], draftJobs: [job(1)], draftJobDates: ["2026-10-23"], selectedDate: "2026-10-23" });
  await store.getState().refreshDraftJobs();
  assert.deepEqual(store.getState().draftJobDates, []);
  assert.deepEqual(store.getState().jobs, []);
  assert.deepEqual(store.getState().draftJobs, []);
});
