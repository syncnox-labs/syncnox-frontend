const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const helpers = {};
new Function("exports", ts.transpileModule(fs.readFileSync(path.join(__dirname, "../app/route/_components/jobAddition.utils.ts"), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText)(helpers);

test("newly added survives optimization without leaving the plan Optimization Pending", () => {
  assert.equal(helpers.stopNeedsOptimization({ is_new: true }), true, "legacy pending additions");
  assert.equal(helpers.stopNeedsOptimization({ is_new: true, needs_optimization: true }), true);
  assert.equal(helpers.stopNeedsOptimization({ is_new: true, needs_optimization: false }), false);
  assert.equal(helpers.stopNeedsOptimization({ is_new: true, needs_optimization: false, time_edited: true }), true);
  assert.equal(helpers.stopNeedsOptimization({ is_new: false, is_edited: true }), true);
});

test("booking provenance covers both legs and unassigned jobs after a reload", () => {
  const ids = helpers.getAddedJobIds({ manual_job_creations: { token: { job_ids: [1, 2] } },
    routes: [{ stops: [{ job_id: 3, is_new: true }, { job_id: 5 }] }],
    unassigned_jobs: [{ job_id: 4, is_new: true }] });
  assert.deepEqual([...ids].sort(), [1, 2, 3, 4]);
  assert.deepEqual([...helpers.getAddedJobIds(null)], []);
});
