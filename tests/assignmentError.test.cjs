const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const ts = require("typescript");

const source = fs.readFileSync(path.join(__dirname, "../app/route/_components/assignmentError.utils.ts"), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const exported = {};
new Function("exports", compiled)(exported);
const describe = (text, status) => exported.assignmentErrorInfo(text, text, status);

const cases = [
  {
    name: "Samir's booking conflict includes the driver, selected job and one remedy",
    raw: "Existing trip for Samir Kadi:\nJob #6690's pickup must be 02:50–05:20, but existing driver or vehicle bookings block that window for Samir Kadi.\nExisting booking: Samir Kadi, team_leader, Mon 26 Oct 2026, 02:45:11 AM +0000 – 03:53:58 PM +0000.\nA separate trip cannot overlap existing work. Choose another available driver or vehicle, or move the conflicting work before retrying.\nSamir Kadi needs an available vehicle.",
    title: "Driver already booked", message: /Samir Kadi.*#6690.*2:50 AM–5:20 AM/, action: /another driver.*conflicting trip/,
  },
  {
    name: "a vehicle-only booking is not blamed on the driver",
    raw: "Separate trip for Jose:\nJob #6690's pickup must be 02:50–05:20, but existing driver or vehicle bookings block that window for Jose.\nExisting booking: Vehicle C_Escape, team_leader, Mon 26 Oct 2026, 02:45:11 AM +0000 – 03:53:58 PM +0000.",
    title: "Vehicle already booked", message: /C_Escape.*#6690/, action: /another available vehicle/,
  },
  {
    name: "missing road data is not declared an impossible road connection",
    raw: "Separate trip for Jose:\nRoad travel from job #6579's pickup to job #6579's dropoff could not be verified. Check the saved map locations and routing data. Extending working hours cannot repair a missing road connection.",
    title: "Couldn't check road travel", message: /#6579.*between pickup and drop-off.*couldn't be checked/, action: /map locations.*try again/,
  },
  {
    name: "travel back to the driver's finish is identified separately",
    raw: "Road travel from job #6579's dropoff to Robin SINGH's route finish could not be verified. Check the saved map locations and routing data.",
    title: "Couldn't check road travel", message: /drop-off to the route finish/, action: /map locations/,
  },
  {
    name: "a deadline conflict gives the deadline and earliest possible arrival",
    raw: "Extending working time cannot resolve this assignment:\nJob #6579's drop-off must be 05:40–05:50, but its earliest possible drop-off is 06:00 using the current road travel data, even before boarding time. Travel from job #6579's pickup to job #6579's dropoff needs at least 100m 00s. This is a job time-window or travel-data conflict, not a driver working-hours limit.",
    title: "Can't arrive in time", message: /#6579.*drop-off by 5:50 AM.*6:00 AM/, action: /map locations.*job time/,
  },
  {
    name: "conflicting jobs retain both IDs without implying the driver can never take the job",
    raw: "Existing trip for Christopher NIYONZIMA:\nJob #12881 cannot share Christopher NIYONZIMA's trip. Conflicts with job #12877: both pickups must be next day 00:00–next day 00:15, but travel between them needs at least 30m 00s. Use another driver or change a job time.",
    title: "Jobs can't share this trip", message: /#12881.*#12877.*next day 12:00 AM.*30 minutes apart/, action: /another trip or driver/,
  },
  {
    name: "off-duty error keeps the next-day pickup explicit",
    raw: "Job #12881's pickup window next day 00:00–next day 00:15 is outside Christopher NIYONZIMA's working hours (16:00–23:00). Choose an available driver or correct the working hours or job time.",
    title: "Driver is off duty", message: /Christopher NIYONZIMA.*#12881.*next day 12:00 AM–next day 12:15 AM/, action: /extra working time/,
  },
  {
    name: "capacity errors state actual demand and vehicle seats",
    raw: "Job #12881 requires 15 seats, but VAN 5 has 14. Choose a vehicle with enough seats.",
    title: "Not enough seats", message: /#12881 needs 15 seats.*VAN 5 has 14/, action: /at least 15 seats/,
  },
  {
    name: "required driver error names the person to select",
    raw: "Job #6690 requires driver Samir Kadi. Choose that driver, or open More options to change the job’s required driver.",
    title: "Required driver", message: /#6690 requires Samir Kadi/, action: /Samir Kadi.*required driver/,
  },
  {
    name: "vehicle qualifications are a clear driver and vehicle mismatch",
    raw: "Jose lacks the qualifications required for BUS 5.",
    title: "Driver can't use this vehicle", message: /Jose isn't qualified to drive BUS 5/, action: /another vehicle.*qualified driver/,
  },
  {
    name: "repeated missing-vehicle messages become one instruction",
    raw: "Hovsep TERZIAN needs an available vehicle.\nElizabeth needs an available vehicle.\nHrayr Karageozian needs an available vehicle.",
    title: "Choose a vehicle", message: /available vehicle is needed/, action: /Select a driver and an available vehicle/,
  },
  {
    name: "unsuccessful search is not called impossible",
    raw: "No route was found for jobs #6690 with Jose within the search time and the selected working hours, seats, and pickup/drop-off windows. This does not prove that every possible stop order is infeasible. Try another available driver, review the job times, or retry a smaller selection.",
    title: "No matching trip found", message: /couldn't find a trip/, action: /another driver.*fewer jobs/,
  },
  {
    name: "stale data has a refresh remedy",
    raw: "The plan, driver progress, or availability changed since this preview. Review the placement again; no changes were saved.",
    title: "Availability changed", message: /changed since the last check/, action: /Check again.*refresh/,
  },
  {
    name: "expired preview has a retry remedy",
    raw: "This preview expired or is invalid. Review the placement again before saving.",
    title: "Preview expired", message: /expired/, action: /Check again/,
  },
  {
    name: "missing map point names the job field to fix",
    raw: "A selected job has no pickup or drop-off coordinates. Edit its address and choose a map suggestion.",
    title: "Map location missing", message: /location is missing/, action: /Edit the job.*missing address/,
  },
  {
    name: "invalid times omit parser internals",
    raw: "A selected job needs valid pickup/drop-off times: invalid literal for int() with base 10: 'broken'.",
    title: "Check the job times", message: /job time is missing or invalid/, action: /start and end times/,
  },
  {
    name: "extra time approval explains which button to use",
    raw: "Review and approve the extra working time before assigning these jobs. No changes were saved.",
    title: "Approve extra working time", message: /approval for extra working time/, action: /Extend time & assign/,
  },
];
for (const item of cases) test(item.name, () => {
  const result = describe(item.raw);
  assert.equal(result.title, item.title);
  assert.match(result.message, item.message);
  assert.match(result.action, item.action);
  assert.ok(result.message.length <= 200);
  assert.ok(result.action.length <= 160);
  assert.doesNotMatch(result.message, /Existing trip for|Separate trip for|48-hour|team_leader|\+0000/);
});

test("service errors never ask the user to change drivers or job times", () => {
  const record = { category: "routing_provider_unavailable", code: "insufficient_credits", message: "Long provider details" };
  const result = exported.assignmentErrorInfo(record, record.message, 503);
  assert.equal(result.title, "Routing service unavailable");
  assert.match(result.action, /administrator.*credits/);
  assert.equal(result.showChangeOptions, false);
  const outage = describe("Preview status is temporarily unavailable. Please retry.", 503);
  assert.equal(outage.title, "Assignment check unavailable");
  assert.equal(outage.showChangeOptions, false);
});

test("unknown errors keep a concise factual reason without inventing a specific constraint", () => {
  const result = describe("Keep the active trip and completed jobs on their current route. Split or move future jobs instead.");
  assert.equal(result.message, "Keep the active trip and completed jobs on their current route.");
  assert.equal(result.action, "Split or move future jobs instead.");
  assert.doesNotMatch(JSON.stringify(result), /capacity|off duty|already booked/);
});

test("plain routing outages and network failures ask for a retry rather than changed jobs", () => {
  const outage = describe("Route directions could not be loaded. Your changes are kept; retry the preview.");
  assert.equal(outage.title, "Assignment check unavailable");
  assert.equal(outage.action, "Try again in a moment.");
  assert.equal(outage.showChangeOptions, false);
  const network = describe("Network Error");
  assert.equal(network.title, "Connection problem");
  assert.match(network.action, /connection.*try again/);
});

test("routing-account access errors and assignment permissions have different remedies", () => {
  const routing = exported.assignmentErrorInfo({ category: "routing_provider_unavailable", code: "access_denied" }, "Forbidden", 403);
  assert.equal(routing.title, "Routing service unavailable");
  assert.match(routing.action, /routing account/);
  const permission = describe("Forbidden", 403);
  assert.equal(permission.title, "Permission needed");
  assert.match(permission.action, /assignment access/);
  assert.equal(permission.showChangeOptions, false);
});
