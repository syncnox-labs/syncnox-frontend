const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
const root = `${__dirname}/../app/route/_components/`;
const compiled = ts.transpileModule(fs.readFileSync(`${root}jobMapLocation.utils.ts`, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;
const helpers = {};
new Function("exports", compiled)(helpers);

test("unassigned jobs use the pickup location across supported job shapes", () => {
  const pickup = { lat: 45.5, lng: -73.6 };
  for (const job of [
    { pick_up_location: pickup, drop_off_location: { lat: 46, lng: -74 } },
    { worker_shuttle_detail: { pick_up_location: pickup } },
    { custom_fields: { pick_up_location: pickup } },
    { location: pickup }, { pickup_delivery_detail: { location: pickup } },
  ]) assert.deepEqual(helpers.getJobMapLocation(job), pickup);
  assert.deepEqual(helpers.getJobMapLocation({ location: { lat: 0, lng: 0 } }), { lat: 0, lng: 0 });
});

test("missing and invalid coordinates do not move the map to an unrelated location", () => {
  for (const location of [undefined, null, {}, { lat: NaN, lng: 1 }, { lat: 1, lng: Infinity },
    { lat: 91, lng: 0 }, { lat: 0, lng: -181 }, { lat: "", lng: "" }]) {
    assert.equal(helpers.getJobMapLocation({ pick_up_location: location }), null);
  }
  assert.deepEqual(helpers.getJobMapLocation({ pick_up_location: { lat: 100, lng: 0 },
    worker_shuttle_detail: { pick_up_location: { lat: 45, lng: -73 } } }), { lat: 45, lng: -73 });
});

const view = fs.readFileSync(`${root}OptimizationView.tsx`, "utf8");
const tree = ts.createSourceFile("view.tsx", view, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const declarations = {};
const requestedEffects = [];
let closeDetails;
(function visit(node) {
  if (ts.isVariableDeclaration(node) && ["handleOpenUnassignedJob", "handleOpenTableJob", "unassignedJobMarker", "markers", "handleMarkerSelect"].includes(node.name.getText(tree))) {
    declarations[node.name.getText(tree)] = node.parent.parent.getText(tree);
  }
  if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(tree) === "JobDetailsCard") {
    closeDetails = node.attributes.properties.find(prop => prop.name?.getText(tree) === "onClose").initializer.expression.getText(tree);
  }
  if (ts.isCallExpression(node) && node.expression.getText(tree) === "useEffect"
      && node.arguments[0]?.getText(tree).includes("requestedJobDetailsId")) requestedEffects.push(node.getText(tree));
  ts.forEachChild(node, visit);
})(tree);
function run(code, context, result = "") {
  const js = ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
  return new Function(...Object.keys(context), js + (result ? `; return ${result};` : ""))(...Object.values(context));
}

test("panel selection opens details AND recenters, including a repeated click", () => {
  const centers = [], drawers = [], markers = [];
  const job = { id: 12769, worker_shuttle_detail: { pick_up_location: { lat: 45.5, lng: -73.6 } } };
  const handler = run(declarations.handleOpenUnassignedJob, {
    useCallback: fn => fn, getJobMapLocation: helpers.getJobMapLocation,
    setCenter: center => centers.push(center), setSelectedMarkerId: id => markers.push(id),
    setSelectedDrawerJob: drawer => drawers.push(drawer),
    setTimeout: callback => callback(),
  }, "handleOpenUnassignedJob");
  assert.equal(requestedEffects.length, 1);
  for (let i = 0; i < 2; i++) run(requestedEffects[0], {
    useEffect: fn => fn(), jobs: [job], requestedJobDetailsId: job.id,
    handleOpenUnassignedJob: handler, onRequestedJobDetailsOpened: () => {},
  });
  assert.deepEqual(centers, [{ lat: 45.5, lng: -73.6 }, { lat: 45.5, lng: -73.6 }]);
  assert.deepEqual(markers, [null, "unassigned-job-12769", null, "unassigned-job-12769"]);
  assert.equal(drawers[0].job, job);
  assert.equal(drawers[0].isUnassigned, true);
  handler({ id: 2 });
  assert.equal(centers.length, 2);
  assert.equal(drawers.at(-1).job.id, 2, "Jobs without coordinates must still open normally");
});

test("unassigned table rows share map selection; assigned rows keep their existing behavior", () => {
  const opened = [], assigned = [];
  const handler = run(declarations.handleOpenTableJob, {
    useCallback: fn => fn, unassignedTableJobs: [{ id: 1 }],
    handleOpenUnassignedJob: job => opened.push(job.id),
    candidateIndex: [{ jobId: "2", routeIndex: 0 }], focusedRouteIndex: null, allowedRouteIndices: null,
    handleSelectCandidate: candidate => assigned.push(candidate.jobId),
  }, "handleOpenTableJob");
  handler({ id: 1 }); handler({ id: 2 });
  assert.deepEqual(opened, [1]);
  assert.deepEqual(assigned, ["2"]);
});

test("red pin follows the open unassigned job, survives route focus, and disappears on close", () => {
  const job = { id: 12769, pick_up_location: { lat: 45.5, lng: -73.6 } };
  const base = [{ id: "0-1", routeIndex: 0 }, { id: "1-1", routeIndex: 1 }];
  let drawer = { isUnassigned: true, job };
  const renderMarkers = () => {
    const pin = run(declarations.unassignedJobMarker, {
      useMemo: fn => fn(), selectedDrawerJob: drawer, getUnassignedJobMarker: helpers.getUnassignedJobMarker,
    }, "unassignedJobMarker");
    return run(declarations.markers, { useMemo: fn => fn(), unassignedJobMarker: pin,
      focusedRouteIndex: 0, allMarkers: base }, "markers");
  };
  let markers = renderMarkers();
  assert.equal(markers.length, 2);
  assert.equal(markers[0].id, "0-1");
  assert.equal(markers[1].id, "unassigned-job-12769");
  assert.equal(markers[1].color, "#ef4444");
  assert.equal(markers[1].iconLabel, "!");
  assert.deepEqual(markers[1].position, job.pick_up_location);
  drawer = { isUnassigned: true, job: { id: 2, location: { lat: 46, lng: -74 } } };
  assert.equal(renderMarkers()[1].id, "unassigned-job-2", "A new selection replaces the previous pin");
  assert.ok(closeDetails);
  run(`const close = ${closeDetails}`, {
    setSelectedDrawerJob: value => { drawer = value; }, setSelectedMarkerId: () => {},
  }, "close")();
  assert.deepEqual(renderMarkers(), [base[0]]);
  drawer = { isUnassigned: false, job };
  assert.deepEqual(renderMarkers(), [base[0]]);
  assert.equal(helpers.getUnassignedJobMarker({ id: 3 }), null);
});

test("clicking the temporary marker keeps the unassigned details open", () => {
  const selected = [];
  const select = run(declarations.handleMarkerSelect, {
    setSelectedMarkerId: id => selected.push(id),
    setSelectedDrawerJob: () => assert.fail("Clicking this pin must not close or replace the job modal"),
  }, "handleMarkerSelect");
  select("unassigned-job-12769");
  assert.deepEqual(selected, ["unassigned-job-12769"]);
});

test("unassigned marker hover shows the address of the displayed location", () => {
  const location = { lat: 45.5, lng: -73.6 };
  for (const fields of [
    { pick_up_location: location, pick_up_address: "Pickup address" },
    { worker_shuttle_detail: { pick_up_location: location, pick_up_address: "Pickup address" } },
    { custom_fields: { pick_up_location: location, pick_up_address: "Pickup address" } },
    { location, address_formatted: "Pickup address" },
    { pickup_delivery_detail: { location, address_formatted: "Pickup address" } },
    { custom_fields: { location, address_formatted: "Pickup address" } },
  ]) {
    const marker = helpers.getUnassignedJobMarker({ id: 1, ...fields });
    assert.equal(marker.title, "Pickup address");
    assert.equal(marker.description, "Pickup address");
  }
  const marker = helpers.getUnassignedJobMarker({ id: 2,
    pick_up_location: { lat: 100, lng: 0 }, pick_up_address: "Invalid pickup",
    drop_off_location: location, drop_off_address: "Dropoff address",
  });
  assert.equal(marker.title, "Dropoff address");
  assert.equal(helpers.getUnassignedJobMarker({ id: 3, location }).title, "Unassigned Job #3");
});
