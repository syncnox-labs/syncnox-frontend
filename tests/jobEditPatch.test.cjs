const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
const compiled = ts.transpileModule(fs.readFileSync(`${__dirname}/../app/route/_components/jobEditPatch.utils.ts`, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const loaded = {};
new Function("exports", compiled)(loaded);
const { buildJobEditPatch } = loaded;

test("contact-only edits send no stale routing fields and support explicit clearing", () => {
  const initial = { start_hour: "07:00:00", end_hour: "15:00", candidate_phone: "555", notes: "Old",
    pickup_type: "round_trip", job_type: "return_only" };
  const result = buildJobEditPatch(42, initial, { ...initial, start_hour: "07:00", candidate_phone: "", notes: "" }, true);
  assert.deepEqual(result, { payload: { id: 42, worker_shuttle_detail: { candidate_phone: "", notes: "" } },
    requiresReOptimization: false, timeChanged: false });
});

test("coordinate-only and reach-window edits require reoptimization", () => {
  for (const [key, initial, edited] of [["pick_up_location", { lat: 45, lng: -73 }, { lng: -74, lat: 46 }],
    ["reach_before_minutes", 10, 20], ["service_duration", 5, 15], ["priority_level", "low", "high"]]) {
    const result = buildJobEditPatch(42, { [key]: initial }, { [key]: edited }, key.includes("pick_up") || key.includes("reach"));
    assert.equal(result.requiresReOptimization, true);
    assert.equal(result.timeChanged, false);
  }
});

test("delivery customer edits map to persisted detail fields", () => {
  const result = buildJobEditPatch(42, { client_name: "Old", client_phone: "555", client_email: "old@example.com", notes: "Old" },
    { client_name: "New", client_phone: "", client_email: "new@example.com", notes: "" }, false);
  assert.deepEqual(result.payload, { id: 42, pickup_delivery_detail: {
    client_name: "New", phone_number: "", client_email: "new@example.com", additional_notes: "" } });
});

test("clearing address metadata sends null rather than retaining old coordinates", () => {
  const result = buildJobEditPatch(42, { pick_up_address: "Old", pick_up_location: { lat: 45, lng: -73 } },
    { pick_up_address: "New", pick_up_location: undefined }, true);
  assert.deepEqual(result.payload.worker_shuttle_detail, { pick_up_address: "New", pick_up_location: null });
});
