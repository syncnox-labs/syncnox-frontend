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

function store(fetch) {
  let state;
  const exports = {};
  new Function("exports", "require", "setTimeout", compiled)(exports, name => {
    if (name === "zustand") return { create: init => {
      state = init(update => Object.assign(state, update), () => state);
      return { getState: () => state };
    } };
    if (name === "react") return {};
    if (name === "@/apis/routes.api") return { getOptimizationRequest: fetch };
    if (name === "@/utils/optimizationError.utils") return errorHelpers;
    throw new Error(name);
  }, fn => fn());
  return state;
}

for (const status of ["completed", "failed"]) test(`polling rejects a ${status} operation with a fit error immediately`, async () => {
  let calls = 0;
  const restored = { status, error_message: "Added booking cannot fit; previous assignments kept", result: { routes: [] } };
  const state = store(async () => { calls++; return restored; });
  await assert.rejects(state.pollUntilComplete(1, 0, 3), /previous assignments kept/);
  assert.equal(calls, 1);
  assert.equal(state.currentOptimization, restored);
  assert.equal(state.isOptimizing, false);
});

test("polling retries network failures then returns a successfully optimized plan", async () => {
  let calls = 0;
  const result = { status: "completed", error_message: null };
  const state = store(async () => { if (++calls === 1) throw new Error("temporary network failure"); return result; });
  assert.equal(await state.pollUntilComplete(1, 0, 3), result);
  assert.equal(calls, 2);
  assert.equal(state.error, null);
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
