const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

test("cross-plan preview and save send the selected trip identities and signed preview", async () => {
  const source = fs.readFileSync(path.join(__dirname, "../apis/manualRouting.api.ts"), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText;
  const exports = {}, calls = [];
  const client = { post: async (...args) => { calls.push(args); return { data: { success: true } }; } };
  new Function("exports", "require", compiled)(exports, name => name === "@/config/apiClient.config" ? client : require(name));
  const first = { plan_id: 259, route_index: 9, driver_id: 179, vehicle_id: 55, job_ids: [1, 2] };
  const second = { plan_id: 261, route_index: 1, driver_id: 179, vehicle_id: 55, job_ids: [3] };
  await exports.previewCrossPlanWaiting(261, { first, second, waiting_side: "right" });
  await exports.commitCrossPlanWaiting(261, "signed-preview", "unique-request-token");
  assert.deepEqual(calls[0][0], "optimization/requests/261/cross-plan-waiting/preview");
  assert.deepEqual(calls[0][1], { first, second, waiting_side: "right" });
  assert.deepEqual(calls[1][1], { preview_token: "signed-preview", request_token: "unique-request-token" });
});
