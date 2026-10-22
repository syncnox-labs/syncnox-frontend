const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const compiled = ts.transpileModule(fs.readFileSync(path.join(__dirname, "../store/optimization.store.ts"), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const errorHelpers = {};
new Function("exports", ts.transpileModule(fs.readFileSync(path.join(__dirname, "../utils/optimizationError.utils.ts"), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText)(errorHelpers);

function store(fetch, reOptimizeRequest = async () => {}) {
  let state;
  const exports = {};
  new Function("exports", "require", compiled)(exports, name => {
    if (name === "zustand") return { create: init => {
      const listeners = new Set();
      state = init(update => {
        Object.assign(state, update);
        for (const listener of [...listeners]) listener(state);
      }, () => state);
      return { getState: () => state, subscribe: listener => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      } };
    } };
    if (name === "react") return {};
    if (name === "@/apis/routes.api") return { getOptimizationRequest: fetch, reOptimizeRequest };
    if (name === "@/utils/optimizationError.utils") return errorHelpers;
    throw new Error(name);
  });
  return state;
}

for (const status of ["completed", "failed"]) test(`WebSocket rejects a ${status} operation with a fit error immediately`, async () => {
  const state = store(async () => assert.fail("Completion must not fetch"));
  state.currentOptimization = { id: 1, status: "processing" };
  const completion = state.waitUntilComplete(1);
  state.setOptimizationResult(status, { routes: [] }, "Added booking cannot fit; previous assignments kept");
  await assert.rejects(completion, /previous assignments kept/);
  assert.equal(state.isOptimizing, false);
  assert.match(state.error, /previous assignments kept/);
});

test("waits for the WebSocket result without making GET requests", async () => {
  const state = store(async () => assert.fail("Completion must not fetch"));
  state.currentOptimization = { id: 1, status: "processing" };
  let settled = false;
  const completion = state.waitUntilComplete(1).then(result => { settled = true; return result; });
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(settled, false);
  state.setOptimizationResult("completed", { routes: [{ team_member_id: 7 }] });
  const result = await completion;
  assert.equal(result.result.routes[0].team_member_id, 7);
  assert.equal(state.error, null);
});

test("completion received before the waiter starts is not missed", async () => {
  const state = store(async () => assert.fail("Completion must not fetch"));
  state.currentOptimization = { id: 1, status: "processing" };
  state.setOptimizationResult("completed", { routes: [] });
  assert.equal(await state.waitUntilComplete(1), state.currentOptimization);
});

test("leaving the view cancels a pending wait", async () => {
  const state = store(async () => {});
  state.currentOptimization = { id: 1, status: "processing" };
  const completion = state.waitUntilComplete(1);
  state.clearOptimization();
  await assert.rejects(completion, /view changed/);
});

test("a missing completion event times out without polling", async () => {
  const state = store(async () => assert.fail("Completion must not fetch"));
  state.currentOptimization = { id: 1, status: "processing" };
  await assert.rejects(state.waitUntilComplete(1, 5), /timed out/);
  assert.equal(state.isOptimizing, false);
});

test("reloading a preserved plan still shows why the booking could not be optimized", async () => {
  const plan = { status: "completed", error_message: "No compatible vehicle; previous assignments kept" };
  const state = store(async () => plan);
  assert.equal(await state.fetchOptimization(1), plan);
  assert.equal(state.error, plan.error_message);
});

test("old saved fit paragraphs become a short message on reload", async () => {
  const plan = { status: "completed", error_message: "Route operation failed: Unable to optimize the added booking without dropping assigned jobs. Job #12532: No route was found. This does not prove infeasibility; Job #12533: No route was found. Previous assignments were kept. Review the job times and constraints." };
  const state = store(async () => plan);
  await state.fetchOptimization(1);
  assert.equal(state.error, "Jobs #12532, #12533: cannot fit this driver's hours or route constraints. Assignments kept.");
  assert.ok(state.error.length < 140);
  assert.equal(errorHelpers.formatOptimizationError("Job #12532: Shift starts 05:00; depart by 04:21. Assignments kept."),
    "Job #12532: Shift starts 05:00; depart by 04:21. Assignments kept.");
});

test("a fast worker completion is not overwritten by the enqueue response", async () => {
  let respond;
  const state = store(async () => {}, () => new Promise(resolve => { respond = resolve; }));
  state.currentOptimization = { id: 1, status: "completed" };
  const request = state.reOptimize(1);
  state.setOptimizationResult("completed", { routes: [{ team_member_id: 7 }] });
  respond({ id: 1, status: "processing", result: { routes: [] } });
  await request;
  const completed = await state.waitUntilComplete(1);
  assert.equal(completed.status, "completed");
  assert.equal(completed.result.routes[0].team_member_id, 7);
});

test("a delayed refresh cannot overwrite a newer WebSocket result", async () => {
  let respond;
  const state = store(() => new Promise(resolve => { respond = resolve; }));
  state.currentOptimization = { id: 1, status: "processing" };
  const refresh = state.fetchOptimization(1);
  state.setOptimizationResult("completed", { routes: [{ team_member_id: 7 }] });
  respond({ id: 1, status: "processing", result: { routes: [] } });
  await refresh;
  assert.equal(state.currentOptimization.status, "completed");
  assert.equal(state.currentOptimization.result.routes[0].team_member_id, 7);
});

test("dispatch socket ignores other plans and reconciles once on reconnect", async () => {
  let fetches = 0;
  const plan = { id: 1, status: "processing" };
  const state = store(async () => { fetches++; return plan; });
  state.currentOptimization = plan;
  const hookSource = ts.transpileModule(fs.readFileSync(path.join(__dirname, "../hooks/useDispatchSocket.ts"), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  let socket, cleanup;
  class FakeWebSocket {
    constructor() { socket = this; }
    close() {}
  }
  const hook = {};
  new Function("exports", "require", "WebSocket", hookSource)(hook, name => {
    if (name === "react") return { useRef: value => ({ current: value }), useEffect: fn => { cleanup = fn(); } };
    if (name === "next-auth/react") return { useSession: () => ({ data: { user: { tenant_id: 4 }, access_token: "test" } }) };
    if (name === "@/store/optimization.store") return { useOptimizationStore: { getState: () => state } };
    if (name === "@/store/jobs.store") return { useJobsStore: selector => selector({}) };
    if (name === "@/store/routes.store") return { useRouteStore: selector => selector({}) };
    throw new Error(name);
  }, FakeWebSocket);
  hook.useDispatchSocket();
  socket.onopen();
  await Promise.resolve();
  assert.equal(fetches, 1);
  socket.onmessage({ data: JSON.stringify({ event: "optimization_updated", optimization_request_id: 2, status: "completed", result: { routes: [] } }) });
  assert.equal(state.currentOptimization.status, "processing");
  socket.onmessage({ data: JSON.stringify({ event: "optimization_updated", optimization_request_id: 1, status: "completed", result: { routes: [] } }) });
  assert.equal(state.currentOptimization.status, "completed");
  assert.equal(fetches, 1);
  cleanup();
});

test("background refresh keeps the issue visible while loading and clears it only when resolved", async () => {
  let respond;
  const issue = "Job #12548: cannot fit this driver's hours or route constraints. Assignments kept.";
  const plan = { id: 1, status: "completed", error_message: issue };
  const state = store(() => new Promise(resolve => { respond = resolve; }));
  state.currentOptimization = plan;
  state.error = issue;
  for (let refresh = 0; refresh < 3; refresh++) {
    const pending = state.fetchOptimization(1);
    assert.equal(state.error, issue, "The banner must stay mounted while refreshing");
    respond({ ...plan });
    await pending;
    assert.equal(state.error, issue);
  }
  const resolved = state.fetchOptimization(1);
  assert.equal(state.error, issue);
  respond({ ...plan, error_message: null });
  await resolved;
  assert.equal(state.error, null);
});

test("session refreshes and route filter changes do not reconnect the dispatch socket", () => {
  const hookSource = ts.transpileModule(fs.readFileSync(path.join(__dirname, "../hooks/useDispatchSocket.ts"), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  let previousDeps, cleanup, connections = 0, closes = 0;
  let token = "test", tenant = 4, selectedStatus = "all";
  const routeState = { fetchRoutes: () => {}, updateStopStatusLocally: () => {} };
  const jobState = { updateJobStatusLocally: () => {} };
  class FakeWebSocket {
    constructor() { connections++; }
    close() { closes++; }
  }
  const hook = {};
  const routes = Object.assign(selector => selector({ ...routeState, selectedStatus }), {
    getState: () => ({ ...routeState, selectedStatus }),
  });
  new Function("exports", "require", "WebSocket", hookSource)(hook, name => {
    if (name === "react") return {
      useRef: value => ({ current: value }),
      useEffect: (fn, deps) => {
        if (previousDeps && deps.every((dep, index) => Object.is(dep, previousDeps[index]))) return;
        if (cleanup) cleanup();
        previousDeps = deps;
        cleanup = fn();
      },
    };
    // Each render gets a new session object, as it does after getSession().
    if (name === "next-auth/react") return { useSession: () => ({ data: { user: { tenant_id: tenant }, access_token: token } }) };
    if (name === "@/store/optimization.store") return { useOptimizationStore: { getState: () => ({}) } };
    if (name === "@/store/jobs.store") return { useJobsStore: selector => selector(jobState) };
    if (name === "@/store/routes.store") return { useRouteStore: routes };
    throw new Error(name);
  }, FakeWebSocket);
  hook.useDispatchSocket();
  for (let render = 0; render < 5; render++) hook.useDispatchSocket();
  selectedStatus = "completed";
  hook.useDispatchSocket();
  assert.equal(connections, 1);
  assert.equal(closes, 0);
  token = "renewed";
  hook.useDispatchSocket();
  assert.equal(connections, 2, "Token rotation must still reconnect");
  tenant = 5;
  hook.useDispatchSocket();
  assert.equal(connections, 3, "Tenant changes must still reconnect");
  cleanup();
});
