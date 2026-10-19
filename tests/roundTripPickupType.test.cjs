const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

function load(filename, imports = {}) {
  const source = fs.readFileSync(path.join(__dirname, "..", filename), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const exports = {};
  new Function("exports", "require", compiled)(exports, name => name in imports ? imports[name] : require(name));
  return exports;
}

const pickupUtils = load("utils/jobPickupType.utils.ts");
const appUtils = load("utils/app.utils.ts");
const jobsUtils = load("utils/jobs.utils.tsx", {
  "./app.utils": appUtils,
  "./jobPickupType.utils": pickupUtils,
  "@/components/Jobs/StatusBanner": () => null,
  "@/constants/country": { COUNTRY_CODES: [] },
});
const Card = load("app/route/_components/JobDetailsCard.tsx", {
  "@/utils/jobPickupType.utils": pickupUtils,
  "@/utils/app.utils": appUtils,
  "@/utils/jobs.utils": jobsUtils,
  "@/components/AddressAutocomplete": () => null,
  "@/apis/jobs.api": {},
  "@/store/jobs.store": { useJobsStore: () => ({ jobs: [], patchJobLocally() {} }) },
  "@/store/routes.store": { useRouteStore: () => ({ fetchRoutes() {}, selectedStatus: "assigned" }) },
  "@/store/depots.store": { useDepotStore: () => ({ depots: [] }) },
  "@/store/location-mapping.store": { useLocationMappingStore: () => ({ locationMappings: [] }) },
}).default;

test("optimization details show Round Trip on both legs with their own directional pickup times", () => {
  for (const [job_type, label, pickup] of [
    ["one_way", "One Way", "09:00 PM"], ["return_only", "Return Only", "05:30 AM"],
  ]) {
    const html = renderToStaticMarkup(React.createElement(Card, {
      job: { id: 42, job_type, pickup_type: job_type, template_type: "worker_shuttle", status: "assigned",
        custom_fields: { pickup_type: "round_trip" },
        worker_shuttle_detail: { start_hour: "21:00", end_hour: "05:30", client_pick_up_time: "21:00" } },
      stopData: { stop_type: "pickup", job_id: 42 }, onClose() {},
    }));
    const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    assert.match(text, /Pickup Type Round Trip/);
    assert.ok(text.includes(`Trip Type ${label}`));
    assert.ok(text.includes(`Client Pick Up Time ${pickup}`));
  }
});

test("pickup type handles existing response shapes without mutating routing direction", () => {
  for (const source of [
    { custom_fields: { pickup_type: "Round trip" } },
    { pickup_type: "round_trip" },
    { worker_shuttle_detail: { pickup_type: "round_trip" } },
  ]) {
    const job = { job_type: "return_only", ...source };
    assert.equal(pickupUtils.getJobPickupType(job), "round_trip");
    assert.equal(job.job_type, "return_only");
  }
  assert.equal(pickupUtils.getJobPickupType({ job_type: "return_only" }), "return_only");
  assert.equal(pickupUtils.getJobPickupType(null), undefined);
});
