const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

function load(file, imports = {}) {
  const compiled = ts.transpileModule(fs.readFileSync(path.join(__dirname, "..", file), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const exports = {};
  new Function("exports", "require", compiled)(exports, name => name in imports ? imports[name] : require(name));
  return exports;
}

const locationError = "Unresolved location: RETURN drop-off 'Candidate\u0027s house'. Correct the address before importing.";
const coordinate = { lat: 45.5, lng: -73.5 };
const row = errors => ({
  original_data: { pickup_type: "return_only", client_address: "Client address",
    candidate_address: "Home address", return_dropoff_point: "Candidate's house", return_dropoff_location: null },
  geocode_result: { address: "Client address", ...coordinate, error: null },
  validation_errors: errors, is_duplicate: false,
});

function preview(rows, resolution = {}) {
  let grid;
  let importButton;
  const imports = [];
  const state = { geocodedData: rows, columnMapping: {}, templateType: "worker_shuttle",
    updateGeocodedRow: (index, patch) => { state.geocodedData[index] = { ...state.geocodedData[index], ...patch }; } };
  const useBulkUploadStore = Object.assign(() => state, { getState: () => state });
  const useJobsStore = Object.assign(() => ({ refreshDraftJobs: async () => {} }), {
    getState: () => ({ setSelectedDate() {} }),
  });
  const childrenOnly = ({ children }) => React.createElement(React.Fragment, null, children);
  const component = load("components/bulk-upload/DataPreviewStep.tsx", {
    "ag-grid-react": { AgGridReact: props => { grid = props; return null; } },
    antd: { Button: props => { if (props.type === "primary") importButton = props; return null; },
      Tooltip: childrenOnly, Alert: () => null, message: { warning() {}, error() {}, success() {} } },
    "@/store/bulkUpload.store": { useBulkUploadStore },
    "@/store/jobs.store": { useJobsStore },
    "@/store/index.store": { useIndexStore: { getState: () => ({ activeJobTemplate: "worker_shuttle" }) } },
    "@/apis/bulk-upload.api": {
      importBulkJobs: async payload => { imports.push(payload); return { created: payload.jobs.length, failed: 0 }; },
      resolveBulkRow: async () => resolution,
    },
    "./AddressCellEditor": () => null,
    "@/utils/tripValidation": load("utils/tripValidation.ts"),
  }).default;
  renderToStaticMarkup(React.createElement(component, { onFinish() {} }));
  return { grid, importButton, imports, state };
}

test("an unresolved passenger endpoint is flagged and excluded while valid rows can import", async () => {
  const failed = row([locationError]);
  const valid = row([]);
  valid.original_data.return_dropoff_location = coordinate;
  const view = preview([failed, valid]);
  assert.equal(view.grid.rowData[0].status, "validation_error");
  assert.equal(view.grid.rowData[0].statusMessage, locationError);
  assert.equal(view.grid.rowData[1].status, "success");
  await view.importButton.onClick();
  assert.equal(view.imports[0].jobs.length, 1);
  assert.deepEqual(view.imports[0].jobs[0].return_dropoff_location, coordinate);
  assert.equal(preview([failed]).importButton.disabled, true);
});

test("a corrected endpoint clears its location error and preserves unrelated field errors", async () => {
  const failed = row([locationError, "Email is invalid"]);
  const view = preview([failed], { resolved_fields: { return_dropoff_location: coordinate, drop_off_location: coordinate },
    geocode_result: failed.geocode_result, warnings: [], location_errors: [] });
  view.grid.onCellValueChanged({ data: { id: 0 }, colDef: { field: "return_dropoff_point" },
    newValue: "Resolved address", oldValue: "Candidate's house" });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(view.state.geocodedData[0].validation_errors, ["Email is invalid"]);
  assert.deepEqual(view.state.geocodedData[0].original_data.return_dropoff_location, coordinate);
  assert.equal(view.state.geocodedData[0].original_data.return_dropoff_point, "Resolved address");
});

test("an address edit that cannot resolve keeps the row blocked", async () => {
  const entry = row([]);
  const view = preview([entry], { resolved_fields: {}, geocode_result: entry.geocode_result,
    warnings: ["Could not resolve the address"], location_errors: [locationError] });
  view.grid.onCellValueChanged({ data: { id: 0 }, colDef: { field: "return_dropoff_point" },
    newValue: "Unresolved address", oldValue: "Candidate's house" });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(view.state.geocodedData[0].validation_errors, [locationError]);
  assert.equal(view.state.geocodedData[0].original_data.return_dropoff_location, null);
  assert.equal(preview(view.state.geocodedData).importButton.disabled, true);
});
