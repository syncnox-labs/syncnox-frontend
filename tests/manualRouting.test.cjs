const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const { runInNewContext } = require("node:vm");
const ts = require("typescript");

function load(relative, dependencies = {}) {
  const source = fs.readFileSync(path.join(__dirname, "..", relative), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true,
  } }).outputText;
  const exports = {};
  runInNewContext(compiled, { exports, require: name => dependencies[name] || require(name),
    setTimeout: callback => { callback(); return 0; }, Date, encodeURIComponent });
  return exports;
}

test("manual route labels distinguish three trips by name, driver, direction and time", () => {
  const { manualRouteLabel } = load("app/route/_components/manualRouting.utils.ts");
  const labels = [6, 10, 15].map((hour, index) => manualRouteLabel({ team_member_name: "Robin", leg: "GO", stops: [
    { arrival_time: `2026-10-26T${String(hour).padStart(2, "0")}:00:00` },
    { arrival_time: `2026-10-26T${String(hour + 1).padStart(2, "0")}:00:00` },
  ] }, index));
  assert.equal(new Set(labels).size, 3);
  assert.match(labels[2], /Route 3.*Robin.*GO.*Trip 3:00 PM/);
});

test("job membership counts each booking once across pickup and drop-off", () => {
  const { routeJobIds } = load("app/route/_components/manualRouting.utils.ts");
  assert.deepEqual(Array.from(routeJobIds({ stops: [{ job_id: null }, { job_id: 3 }, { job_id: 3 }, { job_id: 7 }] })), [3, 7]);
});

test("conflicts explain decoded API bodies, Axios errors and validation errors", () => {
  const { manualRoutingError } = load("app/route/_components/manualRouting.utils.ts");
  assert.equal(manualRoutingError({ detail: "Working hours conflict" }), "Working hours conflict");
  assert.equal(manualRoutingError({ response: { data: { detail: "Route changed" } } }), "Route changed");
  assert.equal(manualRoutingError({ detail: [{ msg: "Select jobs" }] }), "Select jobs");
});

test("routing account failures show the provider remedy instead of changing the assignment", () => {
  const { manualRoutingError, manualRoutingErrorInfo } = load("app/route/_components/manualRouting.utils.ts");
  const detail = { category: "routing_provider_unavailable", code: "insufficient_credits",
    message: "TomTom has insufficient credits. Restore credits, then check again." };
  for (const error of [{ detail }, { response: { data: { detail } } }]) {
    assert.equal(manualRoutingError(error), detail.message);
    const info = manualRoutingErrorInfo(error);
    assert.equal(info.title, "Routing service unavailable");
    assert.equal(info.showChangeOptions, false);
    assert.equal(info.message, detail.message);
  }
  const conflict = manualRoutingErrorInfo({ detail: "Conflicts with job #12864" });
  assert.equal(conflict.title, "This assignment needs a change");
  assert.equal(conflict.showChangeOptions, true);
});

test("local route times keep the plan's clock time", () => {
  const { localRouteTime } = load("app/route/_components/manualRouting.utils.ts");
  assert.equal(localRouteTime("2026-10-27T06:15:00"), "2026-10-27T06:15");
});

test("background preview retrieves only its own result and never saves automatically", async () => {
  const calls = [];
  let polls = 0;
  const result = { success: true, preview_token: "signed", result: { routes: [] } };
  const api = load("apis/manualRouting.api.ts", { "@/config/apiClient.config": {
    post: async (url, body) => { calls.push({ url, body }); return { data: { pending: true, preview_id: "preview-1" } }; },
    get: async url => { calls.push({ url }); return { data: polls++ === 0 ? { pending: true, preview_id: "preview-1" } : result }; },
  } });
  const actual = await api.previewManualRouting(48, { action: "assign", job_ids: [1, 2] });
  assert.equal(actual, result);
  assert.equal(calls[0].url, "optimization/requests/48/manual-routing/preview?background=true");
  assert.equal(calls.length, 3);
  assert.ok(calls.every(call => !call.url.endsWith("/commit")));
});

test("save sends the signed preview and stable retry token once", async () => {
  const calls = [];
  const api = load("apis/manualRouting.api.ts", { "@/config/apiClient.config": {
    post: async (url, body) => { calls.push({ url, body }); return { data: { success: true } }; },
  } });
  await api.commitManualRouting(48, "signed-preview", "stable-retry-token");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].body.preview_token, "signed-preview");
  assert.equal(calls[0].body.request_token, "stable-retry-token");
  assert.equal(calls[0].body.approve_working_time_extension, false);
});

test("extending working time requires the explicit approval flag on the reviewed assignment", async () => {
  const calls = [];
  const api = load("apis/manualRouting.api.ts", { "@/config/apiClient.config": {
    post: async (url, body) => { calls.push({ url, body }); return { data: { success: true } }; },
  } });
  await api.commitManualRouting(237, "reviewed-extension", "stable-approval-token", true);
  assert.equal(calls[0].body.preview_token, "reviewed-extension");
  assert.equal(calls[0].body.approve_working_time_extension, true);
});

test("canceling a preview stops fetching its result", async () => {
  let polls = 0;
  const api = load("apis/manualRouting.api.ts", { "@/config/apiClient.config": {
    post: async () => ({ data: { pending: true, preview_id: "preview-1" } }),
    get: async () => { polls++; },
  } });
  await assert.rejects(api.previewManualRouting(48, { action: "create", job_ids: [] }, { aborted: true }), /canceled/);
  assert.equal(polls, 0);
});

test("recorded progress is protected in the editor", () => {
  const { hasJobProgress } = load("app/route/_components/manualRouting.utils.ts");
  assert.equal(hasJobProgress({ status: "completed" }), true);
  assert.equal(hasJobProgress({ status: "in_transit" }), true);
  assert.equal(hasJobProgress({ status: "assigned" }), false);
});

test("dropping job 12802 onto Samer chooses the driver and automatic placement", () => {
  const { assignmentProposal } = load("app/route/_components/manualRouting.utils.ts");
  const proposal = assignmentProposal([12802], 117, "Samer TIGHDET");
  assert.equal(proposal.driver_id, 117);
  assert.equal(proposal.expected_driver_name, "Samer TIGHDET");
  assert.equal(proposal.placement, "auto");
  assert.equal(proposal.route_index, undefined, "A driver's afternoon route must not be forced onto a late return job");
});

test("return job timing is the worker's shift end, including the 23:00 example", () => {
  const { manualJobTrip } = load("app/route/_components/manualRouting.utils.ts");
  const trip = manualJobTrip({ id: 12802, job_type: "return_only", start_hour: "16:30:00", end_hour: "23:00:00" });
  assert.equal(trip.direction, "RETURN");
  assert.equal(trip.timeLabel, "Requested pickup: 11:00 PM");
});

test("outbound work start and overnight return pickup are labeled distinctly", () => {
  const { manualJobTrip } = load("app/route/_components/manualRouting.utils.ts");
  assert.equal(manualJobTrip({ job_type: "one_way", start_hour: "08:00:00" }).timeLabel, "Work starts at 8:00 AM");
  assert.equal(manualJobTrip({ job_type: "return_only", start_hour: "22:00:00", end_hour: "06:00:00" }).timeLabel, "Requested pickup: 6:00 AM (next day)");
});
