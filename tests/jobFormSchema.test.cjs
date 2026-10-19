const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const dayjs = require("dayjs");

function loadSource(filename, imports = {}) {
  const source = fs.readFileSync(path.join(__dirname, "..", filename), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const exports = {};
  new Function("exports", "require", compiled)(exports, name => name in imports ? imports[name] : require(name));
  return exports;
}

const schema = loadSource("components/Jobs/jobForm.schema.ts", {
  "@/utils/jobPickupType.utils": loadSource("utils/jobPickupType.utils.ts"),
});
const { getJobFormFields, getJobFieldControl, getJobInitialValues, buildJobFormPayload, parseCoordinates } = schema;
function field(field_key, overrides = {}) {
  return { id: 1, tenant_id: 7, entity_type: "job", field_key, label: field_key, data_type: "string",
    group: "additional", is_required: false, is_visible_in_list: true, display_order: 0, ...overrides };
}

test("editing either round-trip leg preserves the configured booking type", () => {
  const fields = [field("pickup_type", { data_type: "select", options: ["one_way", "return_only", "round_trip"] })];
  for (const job_type of ["one_way", "return_only"]) {
    const job = { job_type, pickup_type: job_type, custom_fields: { pickup_type: "round_trip" } };
    const values = getJobInitialValues(fields, job);
    assert.equal(values.pickup_type, "round_trip");
    const payload = buildJobFormPayload(fields, values, "worker_shuttle");
    assert.equal(payload.pickup_type, "round_trip");
    assert.equal(payload.custom_fields.pickup_type, "round_trip");
  }
});

test("saved schema is authoritative across all groups, ordered and filtered only by dispatch visibility", () => {
  const definitions = [
    field("notes", { id: 4, group: "pod", display_order: 3, is_visible_in_list: false }),
    field("start_hour", { id: 2, group: "optimization", display_order: 1 }),
    field("badge", { id: 3, display_order: 1 }),
    field("hidden", { surfaces: { disp: false } }),
    field("vehicle_only", { entity_type: "vehicle" }),
  ];
  assert.deepEqual(getJobFormFields(definitions).map(f => f.field_key), ["start_hour", "badge", "notes"]);
  assert.deepEqual(getJobFormFields([]), []);
  assert.equal(definitions[0].field_key, "notes", "must not reorder the source configuration");
});

test("explicit types and select options override familiar built-in keys", () => {
  assert.equal(getJobFieldControl(field("start_hour")), "time");
  assert.equal(getJobFieldControl(field("start_hour", { data_type: "select" })), "select");
  assert.equal(getJobFieldControl(field("go_pickup_point", { data_type: "select" })), "select");
  assert.equal(getJobFieldControl(field("client_address")), "address");
  assert.equal(getJobFieldControl(field("custom_geo", { data_type: "geo" })), "geo");
});

test("edit initialization preserves false and zero, aliases, dates, times and configured select types", () => {
  const fields = [field("approved", { data_type: "boolean" }), field("count", { data_type: "number" }),
    field("quart_id"), field("start_hour"), field("scheduled_date", { data_type: "date" }),
    field("shift", { data_type: "select", options: [0, 1] })];
  const initial = getJobInitialValues(fields, { approved: false, count: 0, scheduled_date: "2026-10-19",
    worker_shuttle_detail: { quant_id: "Q-42", start_hour: "08:30:00" }, custom_fields: { approved: true, shift: "0" } });
  assert.equal(initial.approved, false);
  assert.equal(initial.count, 0);
  assert.equal(initial.quart_id, "Q-42");
  assert.equal(initial.start_hour.format("HH:mm"), "08:30");
  assert.equal(initial.scheduled_date.format("YYYY-MM-DD"), "2026-10-19");
  assert.equal(initial.shift, 0);
});

test("new jobs use only configured defaults and do not inject absent date, job type, or assignment fields", () => {
  const initial = getJobInitialValues([field("badge", { default_value: "STAFF" }), field("count", { data_type: "number", default_value: "0" }),
    field("approved", { data_type: "boolean", default_value: "false" })], null, { date: "2026-10-19", jobType: "one_way" });
  assert.deepEqual(initial, { badge: "STAFF", count: 0, approved: false });
  assert.equal(getJobInitialValues([field("job_type", { data_type: "select", options: ["delivery"] })], null, { jobType: "one_way" }).job_type, undefined);
});

test("adding a return-route stop prefills the configured trip-direction alias without adding a job type control", () => {
  const values = getJobInitialValues([field("pickup_type", { data_type: "select", options: ["one_way", "return_only"], default_value: "one_way" }),
    field("scheduled_date", { data_type: "date", default_value: "2026-10-01" })], null, { date: "2026-10-19", jobType: "return_only" });
  assert.equal(values.pickup_type, "return_only");
  assert.equal(values.scheduled_date.format("YYYY-MM-DD"), "2026-10-19");
  assert.equal(Object.hasOwn(values, "job_type"), false);
});

test("payload includes every configured field and excludes hidden, removed and stale form values", () => {
  const fields = [field("start_hour"), field("badge"), field("pod_notes", { group: "pod" }),
    field("approved", { data_type: "boolean" }), field("count", { data_type: "number" }),
    field("hidden", { surfaces: { disp: false } })];
  const payload = buildJobFormPayload(fields, { start_hour: dayjs("08:30", "HH:mm"), badge: "A42", pod_notes: "Done",
    approved: false, count: 0, hidden: "secret", job_type: "one_way", assigned_to: 8, removed: "old" }, "worker_shuttle");
  const expected = { start_hour: "08:30", badge: "A42", pod_notes: "Done", approved: false, count: 0 };
  assert.deepEqual(payload, { template_type: "worker_shuttle", ...expected, custom_fields: expected });
});

test("optional clears are explicit while unsupplied fields are not overwritten", () => {
  const payload = buildJobFormPayload([field("notes"), field("untouched")], { notes: undefined }, "worker_shuttle");
  assert.equal(payload.notes, null);
  assert.equal(Object.hasOwn(payload, "untouched"), false);
  assert.deepEqual(payload.custom_fields, { notes: null });
  assert.deepEqual(getJobInitialValues([field("notes", { default_value: "Default" })], { custom_fields: { notes: null } }), {});
});

test("configured geo/date controls serialize and address selection supplies routing metadata without extra controls", () => {
  const payload = buildJobFormPayload([field("location", { data_type: "geo" }), field("scheduled_date", { data_type: "date" }),
    field("pick_up_address")], { location: "19.1, 72.9", scheduled_date: dayjs("2026-10-19"), pick_up_address: "Station" },
    "worker_shuttle", { pick_up_address: { lat: 19.2, lng: 72.8 } });
  assert.deepEqual(payload.location, { lat: 19.1, lng: 72.9 });
  assert.equal(payload.scheduled_date, "2026-10-19");
  assert.deepEqual(payload.pick_up_location, { lat: 19.2, lng: 72.8 });
  assert.equal(Object.hasOwn(payload.custom_fields, "pick_up_location"), false);
});

test("address edits clear stale routing metadata and explicit coordinate fields retain their configured value", () => {
  const fields = [field("pick_up_location", { data_type: "geo" }), field("pick_up_address")];
  const payload = buildJobFormPayload(fields, { pick_up_location: "1,2", pick_up_address: "Station" }, "worker_shuttle",
    { pick_up_address: { lat: 3, lng: 4 } });
  assert.deepEqual(payload.pick_up_location, { lat: 1, lng: 2 });
  const cleared = buildJobFormPayload([field("address_formatted")], { address_formatted: "" }, "pickup_delivery_job", { address_formatted: null });
  assert.equal(cleared.location, null);
});

test("coordinates reject malformed, incomplete and out-of-range values", () => {
  assert.deepEqual(parseCoordinates("0, 0"), { lat: 0, lng: 0 });
  for (const value of ["1,2,3", "91,10", "10,181", "hello,2", "1,", "1", { lat: null, lng: 2 }, { lat: true, lng: 2 }]) {
    assert.equal(parseCoordinates(value), undefined, JSON.stringify(value));
  }
});

test("the configured delivery window remains one field and supplies the API's routing window", () => {
  const fields = [field("time_window", { default_value: "09:00 - 17:00" })];
  const values = getJobInitialValues(fields, null);
  const payload = buildJobFormPayload(fields, values, "pickup_delivery_job");
  assert.equal(payload.time_window, "09:00 - 17:00");
  assert.equal(payload.time_window_start, "09:00");
  assert.equal(payload.time_window_end, "17:00");
  assert.deepEqual(payload.custom_fields, { time_window: "09:00 - 17:00" });
  const edited = getJobInitialValues(fields, { pickup_delivery_detail: { time_window_start: "10:00:00", time_window_end: "18:00:00" } });
  assert.equal(edited.time_window[0].format("HH:mm"), "10:00");
  const cleared = buildJobFormPayload(fields, { time_window: undefined }, "pickup_delivery_job");
  assert.equal(cleared.time_window_start, null);
  assert.equal(cleared.time_window_end, null);
});

function renderJobForm(fields, config = {}) {
  const { default: JobForm } = loadSource("components/Jobs/JobForm.tsx", {
    "./jobForm.schema": schema,
    "@/hooks/useFieldConfig": { useFieldConfig: () => ({ customFields: fields, loading: false, error: null, reloadConfigs() {}, ...config }) },
    "@/store/jobs.store": { useJobsStore: () => ({ isLoading: false }) },
    "@/store/team.store": { useTeamStore: () => ({ teams: [] }) },
    "@/store/depots.store": { useDepotStore: () => ({ depots: [] }) },
    "@/store/location-mapping.store": { useLocationMappingStore: () => ({ locationMappings: [] }) },
    "@/store/index.store": { useIndexStore: select => select({ activeJobTemplate: "worker_shuttle" }) },
    "@/components/AddressAutocomplete": { default: () => React.createElement("input", { "data-address": true }), __esModule: true },
  });
  return renderToStaticMarkup(React.createElement(JobForm));
}

test("actual form renders exactly the configured optimization, additional and POD fields, each once", () => {
  const html = renderJobForm([field("start_hour", { id: 1, label: "My shift", group: "optimization", is_required: true }),
    field("badge", { id: 2, label: "Staff badge" }), field("pod_notes", { id: 3, label: "Proof note", group: "pod" }),
    field("hidden", { id: 4, label: "Should be hidden", surfaces: { disp: false } })]);
  assert.deepEqual([...html.matchAll(/<label[^>]*for="([^"]+)"/g)].map(match => match[1]), ["start_hour", "badge", "pod_notes"]);
  assert.match(html, /My shift/);
  assert.match(html, /ant-form-item-required/);
  assert.doesNotMatch(html, /Should be hidden|Assign Driver|Trip Type|Scheduled Date/);
});

test("empty and failed schemas do not fall back to hardcoded fields and disable submission", () => {
  for (const html of [renderJobForm([]), renderJobForm([], { error: "Unable to load field settings" })]) {
    assert.doesNotMatch(html, /<label/);
    assert.match(html, /<button[^>]*disabled/);
  }
});

test("template gallery visibly marks only the server-selected template", () => {
  const templates = [{ id: 1, name: "Parcels", fields: [], is_applied: false }, { id: 2, name: "Shuttle", fields: [], is_applied: true }];
  const { TemplateGalleryModal } = loadSource("components/CustomFields/TemplateGalleryModal.tsx", {
    react: { ...React, useState: initial => React.useState(Array.isArray(initial) ? templates : initial) },
    antd: { ...require("antd"), Modal: ({ children, title }) => React.createElement("section", null, title, children) },
    "@/apis/custom-fields.api": {}, "./ApplyTemplateModal": { ApplyTemplateModal: () => null },
  });
  const html = renderToStaticMarkup(React.createElement(TemplateGalleryModal, { open: true, entityType: "job", onClose() {}, onApplied() {} }));
  assert.equal((html.match(/Currently applied/g) || []).length, 1);
  assert.equal((html.match(/Reapply Template/g) || []).length, 1);
  assert.equal((html.match(/Use Template/g) || []).length, 1);
});

test("shuttle defaults include all four candidate fields and exclude the removed client fields", () => {
  const { TEMPLATE_BASE_FIELDS } = loadSource("components/CustomFields/custom-fields.constants.ts");
  const keys = TEMPLATE_BASE_FIELDS.worker_shuttle.map(field => field.field_key);
  for (const key of ["candidate_id", "candidate_name", "candidate_phone", "candidate_address"]) {
    assert.equal(keys.filter(value => value === key).length, 1);
  }
  assert.equal(keys.includes("client_id"), false);
  assert.equal(keys.includes("client_phone"), false);
  assert.equal(keys.includes("client_name"), true);
});

test("candidate controls render once and preserve values through editing and submission", () => {
  const keys = ["candidate_id", "candidate_name", "candidate_phone", "candidate_address"];
  const fields = keys.map((key, id) => field(key, { id, label: key.replaceAll("_", " ") }));
  const html = renderJobForm(fields);
  assert.deepEqual([...html.matchAll(/<label[^>]*for="([^"]+)"/g)].map(match => match[1]), keys);
  assert.equal(getJobFieldControl(fields[3]), "address");
  const initial = { template_type: "worker_shuttle", worker_shuttle_detail: {
    candidate_id: "EMP-42", candidate_name: "Test Passenger", candidate_phone: "+91-9000000042",
  }, custom_fields: { candidate_address: "Home address", client_id: "OLD", client_phone: "OLD" } };
  const values = getJobInitialValues(fields, initial);
  const payload = buildJobFormPayload(fields, values, "worker_shuttle", { candidate_address: { lat: 19.1, lng: 72.9 } });
  assert.deepEqual(payload.custom_fields, { candidate_id: "EMP-42", candidate_name: "Test Passenger", candidate_phone: "+91-9000000042", candidate_address: "Home address" });
  assert.deepEqual(payload.candidate_location, { lat: 19.1, lng: 72.9 });
  assert.equal(Object.hasOwn(payload, "client_id"), false);
  assert.equal(Object.hasOwn(payload, "client_phone"), false);
});
