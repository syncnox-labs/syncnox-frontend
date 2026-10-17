import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const source = readFileSync(new URL("../apis/routes.api.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
}).outputText;

function routesApi(post) {
  const exports = {};
  runInNewContext(compiled, {
    exports,
    require(name) {
      assert.equal(name, "@/config/apiClient.config");
      return { post };
    },
    URLSearchParams,
  });
  return exports;
}

test("bulk assignment sends the complete selection in one POST", async () => {
  const calls = [];
  const response = { success: true, assigned_job_ids: [171, 173], already_assigned_job_ids: [], result: { routes: [], unassigned_jobs: [] } };
  const api = routesApi(async (...args) => {
    calls.push(args);
    return { data: response };
  });
  const actual = await api.bulkAssignJobsToRoute(226, 0, [171, 173], 90);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], "optimization/requests/226/routes/0/bulk-assign-jobs");
  assert.deepEqual(calls[0][1].job_ids, [171, 173]);
  assert.equal(calls[0][1].expected_driver_id, 90);
  assert.equal(calls[0][1].expected_leg, null);
  assert.equal(actual, response);
});

test("a maximum-size batch still makes exactly one POST", async () => {
  const selection = Array.from({ length: 500 }, (_, index) => index + 1);
  let requests = 0;
  const api = routesApi(async (_path, body) => {
    requests += 1;
    assert.deepEqual(body.job_ids, selection);
    assert.equal(body.expected_driver_id, 90);
    assert.equal(body.expected_leg, "RETURN");
    return { data: { success: true, assigned_job_ids: selection, already_assigned_job_ids: [], result: {} } };
  });
  assert.equal(api.BULK_ASSIGNMENT_LIMIT, 500);
  await api.bulkAssignJobsToRoute(226, 3, selection, 90, "RETURN");
  assert.equal(requests, 1);
});

test("API conflicts propagate without automatic individual retries", async () => {
  const error = new Error("Job is no longer unassigned");
  let requests = 0;
  const api = routesApi(async () => {
    requests += 1;
    throw error;
  });
  await assert.rejects(api.bulkAssignJobsToRoute(226, 0, [171, 173], 90), (actual) => actual === error);
  assert.equal(requests, 1);
});
