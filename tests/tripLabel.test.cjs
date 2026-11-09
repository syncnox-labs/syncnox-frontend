const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const source = fs.readFileSync(path.join(__dirname, "../app/route/_components/tripLabel.utils.ts"), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const labels = {};
new Function("exports", compiled)(labels);

test("identifies the reported trip by driver, direction and scheduled time", () => {
  const trip = { team_member_name: "Tahreem Ahmed ANWAR", leg: "RETURN", vehicle_name: "31_Dodge Journey",
    stops: [{ arrival_time: "2026-11-05T17:49:09" }, { arrival_time: "2026-11-05T18:24:56" }] };
  assert.equal(labels.tripLabel(trip), "Tahreem Ahmed ANWAR · Return trip · Nov 5, 2026, 5:49 PM–6:24 PM");
  assert.match(labels.tripLabel(trip, { vehicle: true }), /31_Dodge Journey/);
  assert.equal(labels.vehicleAvailabilityMessage("Assigned to another plan at this time · Driver: Tahreem Ahmed ANWAR"),
    "Tahreem Ahmed ANWAR is using this vehicle during the selected trip.");
});

test("distinguishes trips by date and shows overnight end dates without timezone shifts", () => {
  const route = { team_member_name: "Sablond", leg: "GO", stops: [
    { arrival_time: "2026-11-05T23:40:00" }, { arrival_time: "2026-11-06T00:25:00" }] };
  assert.equal(labels.tripLabel(route), "Sablond · Outbound trip · Nov 5, 2026, 11:40 PM–Nov 6, 2026, 12:25 AM");
  assert.match(labels.tripLabel({ ...route, stops: [] }), /Time not set/);
  assert.equal(labels.tripLabel(undefined), "Trip details unavailable");
});

test("combined route directions use the selected leg's own times", () => {
  const trip = { team_member_name: "Alex", leg: "COMBINED", stops: [
    { leg: "GO", arrival_time: "2026-11-05T08:00:00" }, { leg: "GO", arrival_time: "2026-11-05T09:00:00" },
    { leg: "RETURN", arrival_time: "2026-11-05T17:00:00" }, { leg: "RETURN", arrival_time: "2026-11-05T18:00:00" }] };
  assert.match(labels.tripLabel(trip, { leg: "RETURN" }), /Return trip.*5:00 PM–6:00 PM/);
  assert.doesNotMatch(labels.tripLabel(trip, { leg: "RETURN" }), /8:00 AM/);
});
