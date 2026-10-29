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

function dispatchSocket(state) {
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
  return {
    event: (id, status, result, error_message) => socket.onmessage({ data: JSON.stringify({
      event: "optimization_updated", optimization_request_id: id, status, result, error_message,
    }) }),
    cleanup,
  };
}

function combinedPlan(status = "completed") {
  return { id: 1, status, job_ids: [10, 20], result: { routes: [
    { team_member_id: 7, stops: [{ job_id: 10, stop_type: "pickup" }, { job_id: 10, stop_type: "dropoff" }],
      total_distance_meters: 100, total_duration_seconds: 10 },
    { team_member_id: 8, source_optimization_id: 2, source_route_index: 0,
      stops: [{ job_id: 20, stop_type: "pickup" }, { job_id: 20, stop_type: "dropoff" }],
      total_distance_meters: 200, total_duration_seconds: 20 },
  ], total_distance_meters: 300, total_duration_seconds: 30 } };
}

test("removing an own-plan job in a live update preserves neighboring drivers' routes and totals", () => {
  const state = store(async () => assert.fail("Applying a result must not fetch"));
  const plan = combinedPlan();
  state.currentOptimization = plan;
  const updated = { routes: [{ ...plan.result.routes[0], stops: [], total_distance_meters: 0, total_duration_seconds: 0 }],
    total_distance_meters: 0, total_duration_seconds: 0, unassigned_jobs: [{ job_id: 10 }] };
  const original = JSON.stringify(updated);
  state.setOptimizationResult("completed", updated);
  assert.equal(state.currentOptimization.result.routes.length, 2);
  assert.equal(state.currentOptimization.result.routes[1], plan.result.routes[1]);
  assert.deepEqual(state.currentOptimization.result.routes[0].stops, []);
  assert.equal(state.currentOptimization.result.total_distance_meters, 200);
  assert.equal(state.currentOptimization.result.total_duration_seconds, 20);
  assert.deepEqual(state.currentOptimization.result.unassigned_jobs, [{ job_id: 10 }]);
  assert.equal(JSON.stringify(updated), original);
});

test("an already combined result replaces the previous combined view without duplicating neighbors", () => {
  const state = store(async () => {});
  state.currentOptimization = combinedPlan();
  const updated = combinedPlan().result;
  state.setOptimizationResult("completed", updated);
  assert.equal(state.currentOptimization.result, updated);
  assert.equal(updated.routes.length, 2);
});

test("own-plan socket updates keep neighbors visible and reconcile the complete view once", async () => {
  let respond, fetches = 0;
  const state = store(() => { fetches++; return new Promise(resolve => { respond = resolve; }); });
  const plan = combinedPlan("processing");
  state.currentOptimization = plan;
  const socket = dispatchSocket(state);
  const completion = state.waitUntilComplete(1);
  socket.event(1, "completed", { routes: [{ ...plan.result.routes[0], stops: [] }] });
  assert.equal(fetches, 1);
  const completed = await completion;
  assert.equal(completed.result.routes.length, 2);
  assert.deepEqual(completed.result.routes[0].stops, []);
  assert.equal(completed.result.routes[1], plan.result.routes[1]);
  const refreshed = { ...combinedPlan(), job_ids: [10, 20, 30] };
  respond(refreshed);
  await Promise.resolve();
  assert.equal(state.currentOptimization, refreshed);
  socket.cleanup();
});

test("a deletion refresh overtaken by a socket update cannot hide neighbors or discard the final combined view", async () => {
  const responses = [];
  const state = store(() => new Promise(resolve => responses.push(resolve)));
  const plan = combinedPlan();
  state.currentOptimization = plan;
  const socket = dispatchSocket(state);
  const removalRefresh = state.fetchOptimization(1);
  const ownRoute = { ...plan.result.routes[0], stops: [] };
  socket.event(1, "completed", { routes: [ownRoute], unassigned_jobs: [{ job_id: 10 }] });
  assert.equal(responses.length, 2);
  assert.equal(state.currentOptimization.result.routes[1], plan.result.routes[1]);
  assert.deepEqual(state.currentOptimization.result.routes[0].stops, []);
  responses[0]({ ...plan });
  await removalRefresh;
  assert.deepEqual(state.currentOptimization.result.routes[0].stops, [], "An earlier GET must not restore the deleted job");
  const reconciled = { ...plan, result: { ...plan.result, routes: [ownRoute, plan.result.routes[1]],
    unassigned_jobs: [{ job_id: 10 }] } };
  responses[1](reconciled);
  await Promise.resolve();
  assert.equal(state.currentOptimization, reconciled);
  socket.cleanup();
});

test("a neighboring-plan completion refreshes the viewed plan and removes genuinely deleted routes", async () => {
  let respond, fetchedId;
  const state = store(id => { fetchedId = id; return new Promise(resolve => { respond = resolve; }); });
  const plan = combinedPlan();
  state.currentOptimization = plan;
  const socket = dispatchSocket(state);
  socket.event(2, "processing", { routes: [] });
  assert.equal(fetchedId, undefined, "Keep saved neighboring trips visible during their re-optimization");
  socket.event(2, "completed", { routes: [] });
  assert.equal(fetchedId, 1);
  assert.equal(state.currentOptimization, plan, "Do not replace the viewed plan with its neighbor's result");
  const refreshed = { ...plan, result: { routes: [plan.result.routes[0]] } };
  respond(refreshed);
  await Promise.resolve();
  assert.equal(state.currentOptimization, refreshed);
  socket.cleanup();
});

test("a failed neighbor update cannot fail the viewed plan", async () => {
  let fetches = 0;
  const plan = combinedPlan();
  const state = store(async () => { fetches++; return plan; });
  state.currentOptimization = plan;
  const socket = dispatchSocket(state);
  socket.event(2, "failed", undefined, "Neighbor operation failed");
  await Promise.resolve();
  assert.equal(fetches, 1);
  assert.equal(state.currentOptimization.status, "completed");
  assert.equal(state.error, null);
  socket.cleanup();
});

for (const olderFirst of [true, false]) test(`latest reconciliation wins when older response arrives ${olderFirst ? "first" : "last"}`, async () => {
  const responses = [];
  const state = store(() => new Promise(resolve => responses.push(resolve)));
  const plan = combinedPlan();
  state.currentOptimization = plan;
  const older = state.fetchOptimization(1);
  const newer = state.fetchOptimization(1);
  const latest = { ...plan, job_ids: [10, 20, 30] };
  if (olderFirst) {
    responses[0]({ ...plan });
    await older;
    responses[1](latest);
    await newer;
  } else {
    responses[1](latest);
    await newer;
    responses[0]({ ...plan });
    await older;
  }
  assert.equal(state.currentOptimization, latest);
});

test("an outdated failed refresh cannot replace a newer plan's error state", async () => {
  let reject;
  const state = store(() => new Promise((resolve, fail) => { reject = fail; }));
  state.currentOptimization = combinedPlan();
  const older = state.fetchOptimization(1);
  state.currentOptimization = { id: 3, status: "completed" };
  reject(new Error("Old plan unavailable"));
  await assert.rejects(older, /unavailable/);
  assert.equal(state.error, null);
  assert.equal(state.currentOptimization.id, 3);
});

test("failed combined-view refresh keeps neighboring routes visible and reports the loading error", async () => {
  const state = store(async () => { throw new Error("Refresh unavailable"); });
  const plan = combinedPlan();
  state.currentOptimization = plan;
  const socket = dispatchSocket(state);
  socket.event(1, "completed", { routes: [{ ...plan.result.routes[0], stops: [] }] });
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(state.currentOptimization.result.routes.length, 2);
  assert.deepEqual(state.currentOptimization.result.routes[0].stops, []);
  assert.equal(state.currentOptimization.status, "completed");
  assert.equal(state.error, "Refresh unavailable");
  socket.cleanup();
});

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
