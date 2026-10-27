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
  runInNewContext(compiled, { exports, require: name => dependencies[name] || (name === "./assignmentError.utils"
    ? load("app/route/_components/assignmentError.utils.ts") : require(name)),
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
    assert.equal(info.message, "The routing service has run out of credits.");
    assert.match(info.action, /administrator.*restore routing credits/);
  }
  const conflict = manualRoutingErrorInfo({ detail: "Conflicts with job #12864" });
  assert.equal(conflict.title, "Can't assign job");
  assert.equal(conflict.showChangeOptions, true);
});

test("local route times keep the plan's clock time", () => {
  const { localRouteTime } = load("app/route/_components/manualRouting.utils.ts");
  assert.equal(localRouteTime("2026-10-27T06:15:00"), "2026-10-27T06:15");
});

test("ride duration shows longer and overnight trips from their actual stop times", () => {
  const { formatRideDuration } = load("app/route/_components/manualRouting.utils.ts");
  assert.equal(formatRideDuration("2026-10-23T04:30:00", "2026-10-23T07:40:00"), "3h 10m");
  assert.equal(formatRideDuration("2026-10-23T23:30:00", "2026-10-24T02:00:01"), "2h 30m 1s");
  assert.equal(formatRideDuration("2026-10-23T04:30:00Z", "2026-10-23T08:40:00+01:00"), "3h 10m");
  assert.equal(formatRideDuration("invalid", "2026-10-23T07:40:00"), undefined);
  assert.equal(formatRideDuration("2026-10-23T08:00:00", "2026-10-23T07:00:00"), undefined);
});

test("preview identifies other passengers whose rides exceed two hours", () => {
  const { otherLongRides } = load("app/route/_components/manualRouting.utils.ts");
  const stops = [
    { job_id: 1, stop_type: "pickup", arrival_time: "2026-10-23T04:30:00" },
    { job_id: 2, stop_type: "pickup", arrival_time: "2026-10-23T07:00:00" },
    { job_id: 1, stop_type: "dropoff", arrival_time: "2026-10-23T07:40:00" },
    { job_id: 2, stop_type: "dropoff", arrival_time: "2026-10-23T07:40:00" },
  ];
  const rides = otherLongRides(stops, [2]);
  assert.equal(rides.length, 1);
  assert.equal(rides[0].jobId, 1);
  assert.equal(rides[0].duration, "3h 10m");
  assert.equal(otherLongRides(stops, [1, 2]).length, 0);
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

test("assignment context requests availability for the selected jobs in one read", async () => {
  const calls = [];
  const api = load("apis/manualRouting.api.ts", { "@/config/apiClient.config": {
    get: async url => { calls.push(url); return { data: { assignment_choices: [] } }; },
  } });
  await api.getManualRoutingContext(51, [6690, 6692]);
  assert.equal(calls[0], "optimization/requests/51/manual-routing/context?job_ids=6690&job_ids=6692");
  assert.equal(calls.length, 1);
});

test("off-shift drivers are hidden unless extra working time is explicitly shown", () => {
  const { filterAssignmentChoices } = load("app/route/_components/assignmentChoices.utils.ts");
  const choices = [
    { driver_id: 1, vehicle_id: 10, route_index: null, requires_working_time_extension: true, changes_required_driver: false },
    { driver_id: 2, vehicle_id: 20, route_index: 3, requires_working_time_extension: false, changes_required_driver: false },
    { driver_id: 3, vehicle_id: 30, route_index: null, requires_working_time_extension: false, changes_required_driver: true },
  ];
  const base = { placement: "auto", includeExtraHours: false, changeFixedDriver: false };
  assert.deepEqual(Array.from(filterAssignmentChoices(choices, base), x => x.driver_id), [2]);
  assert.deepEqual(Array.from(filterAssignmentChoices(choices, { ...base, includeExtraHours: true }), x => x.driver_id), [1, 2]);
  assert.deepEqual(Array.from(filterAssignmentChoices(choices, { ...base, changeFixedDriver: true }), x => x.driver_id), [2, 3]);
});

test("existing and separate trips have independent availability choices", () => {
  const { filterAssignmentChoices } = load("app/route/_components/assignmentChoices.utils.ts");
  const choices = [null, 0, 3].map(route_index => ({ driver_id: 1, vehicle_id: 10, route_index,
    requires_working_time_extension: false, changes_required_driver: false }));
  const base = { includeExtraHours: false, changeFixedDriver: false };
  assert.deepEqual(Array.from(filterAssignmentChoices(choices, { ...base, placement: "new" }), x => x.route_index), [null]);
  assert.deepEqual(Array.from(filterAssignmentChoices(choices, { ...base, placement: "existing", routeIndex: 0 }), x => x.route_index), [0]);
});

test("a batch recommendation may use different qualified drivers and vehicles", () => {
  const { choicesCoverJobs, filterAssignmentChoices } = load("app/route/_components/assignmentChoices.utils.ts");
  const choices = [
    { driver_id: 1, vehicle_id: 10, route_index: null, job_ids: [1], requires_working_time_extension: false, changes_required_driver: false },
    { driver_id: 2, vehicle_id: 20, route_index: null, job_ids: [2], requires_working_time_extension: false, changes_required_driver: false },
    { driver_id: 3, vehicle_id: 30, route_index: null, job_ids: [1, 2], requires_working_time_extension: true, changes_required_driver: false },
  ];
  const available = filterAssignmentChoices(choices, { placement: "auto", includeExtraHours: false, changeFixedDriver: false });
  assert.equal(choicesCoverJobs(available, [1, 2]), true);
  assert.equal(choicesCoverJobs(available.filter(x => x.driver_id === 1), [1, 2]), false);
  assert.equal(choicesCoverJobs(available, [1, 2, 3]), false);
});
