const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
const path = require("node:path");
const source = fs.readFileSync(path.join(__dirname, "../app/route/_components/TimelineView.tsx"), "utf8");
const tree = ts.createSourceFile("timeline.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const declarations = new Map();
(function visit(node) {
  if (ts.isVariableDeclaration(node) && ["handleTimelineStopDragStart", "handleTimelineTrackDragOver", "handleTimelineDrop"].includes(node.name.getText(tree))) declarations.set(node.name.getText(tree), node.parent.parent.getText(tree));
  ts.forEachChild(node, visit);
})(tree);
function handler(name, context) {
  const compiled = ts.transpileModule(declarations.get(name), { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
  return new Function(...Object.keys(context), compiled + `; return ${name};`)(...Object.values(context));
}
const stops = [{ job_id: null, stop_type: "depot_start", arrival_time: "2026-09-29T22:30:00" },
  { job_id: 1, stop_type: "pickup", arrival_time: "2026-09-29T22:40:00" },
  { job_id: 1, stop_type: "dropoff", arrival_time: "2026-09-29T23:10:00" },
  { job_id: null, stop_type: "depot_end", arrival_time: "2026-09-29T23:20:00" }];

for (const selectedJobIds of [[], [1, 3]]) test(`dragging a stop captures its booking pair and fixed source snapshot (${selectedJobIds.length ? "selection" : "single"})`, async () => {
  let dragged;
  const data = {}, moved = [], hover = [];
  const context = { routes: [{ team_member_id: 7, leg: "RETURN", stops }, { team_member_id: 2 }],
    selectedStopJobIds: new Set(selectedJobIds), selectionSourceRouteIndex: 0,
    dragOverSlotRef: { current: null }, onMoveStops: (...args) => moved.push(args),
    snapshotMoveStops: route => route.stops.map(stop => ({ ...stop })),
    setDraggedStopInfo: value => { dragged = value; }, setTripDropRouteIndex: index => hover.push(index),
    setDragOverStopInfo() {}, setSelectedStopJobIds() {}, setSelectionSourceRouteIndex() {}, message: { error: () => assert.fail("Valid booking payload") },
  };
  const event = { preventDefault() {}, stopPropagation() {}, dataTransfer: {
    setData: (key, value) => { data[key] = value; }, getData: key => data[key], types: ["application/x-syncnox-booking"],
  } };
  handler("handleTimelineStopDragStart", context)(event, 0, 1, [1], 1, 1);
  assert.equal(dragged.moveSelection.sourceDriverId, 7);
  assert.deepEqual(dragged.moveSelection.jobIds, selectedJobIds.length ? selectedJobIds : [1]);
  assert.deepEqual(dragged.moveSelection.sourceStops, stops);
  const snapshot = JSON.parse(data["application/x-syncnox-booking"]);
  context.draggedTrip = null;
  context.draggedStopInfo = dragged;
  handler("handleTimelineTrackDragOver", context)(event, 1);
  assert.equal(event.dataTransfer.dropEffect, "move");
  assert.equal(hover.at(-1), 1);
  await handler("handleTimelineDrop", context)(event, 1);
  assert.deepEqual(moved, [[snapshot, 1]]);
  assert.equal(dragged, null);
  assert.equal(hover.at(-1), null);
  await handler("handleTimelineDrop", context)(event, 0);
  assert.equal(moved.length, 1, "Same-driver drops keep the original schedule without reordering");
});

test("dragging a stop within the same route calculates target slot and calls onReorderStops on drop", async () => {
  let dragged, overInfo;
  const data = {}, reordered = [], hover = [];
  const routeStops = [
    { job_id: null, stop_type: "depot_start", arrival_time: "2026-09-29T06:00:00" },
    { job_id: 1, stop_type: "pickup", arrival_time: "2026-09-29T06:10:00", candidate_name: "Alice" },
    { job_id: 2, stop_type: "pickup", arrival_time: "2026-09-29T06:20:00", candidate_name: "Bob" },
    { job_id: 1, stop_type: "dropoff", arrival_time: "2026-09-29T06:40:00", candidate_name: "Alice" },
    { job_id: 2, stop_type: "dropoff", arrival_time: "2026-09-29T06:50:00", candidate_name: "Bob" },
    { job_id: null, stop_type: "depot_end", arrival_time: "2026-09-29T07:00:00" },
  ];
  const nonDepotGroups = [
    { representative: routeStops[1], rawStops: [routeStops[1]], firstRawIndex: 1 },
    { representative: routeStops[2], rawStops: [routeStops[2]], firstRawIndex: 2 },
    { representative: routeStops[3], rawStops: [routeStops[3]], firstRawIndex: 3 },
    { representative: routeStops[4], rawStops: [routeStops[4]], firstRawIndex: 4 },
  ];
  const context = {
    routes: [{ team_member_id: 7, leg: "GO", stops: routeStops }, { team_member_id: 2 }],
    selectedStopJobIds: new Set(),
    selectionSourceRouteIndex: null,
    dragOverSlotRef: { current: null },
    isReordering: false,
    setIsReordering() {},
    onMoveStops: () => assert.fail("Same-route reorder must not call onMoveStops"),
    onReorderStops: (...args) => reordered.push(args),
    snapshotMoveStops: route => route.stops.map(stop => ({ ...stop })),
    setDraggedStopInfo: value => { dragged = value; },
    setTripDropRouteIndex: index => hover.push(index),
    setDragOverStopInfo: value => { overInfo = value; },
    setSelectedStopJobIds() {},
    setSelectionSourceRouteIndex() {},
    routeDataMap: new Map([[0, { groupedStops: nonDepotGroups, nonDepotGroups }]]),
    getPosition: (iso) => (iso.includes("06:10") ? 50 : iso.includes("06:20") ? 150 : iso.includes("06:40") ? 250 : 350),
    startTime: { toISOString: () => "2026-09-29T06:00:00" },
    pixelsPerMinute: 5,
    getCandidateName: s => s.candidate_name,
    message: { warning: () => assert.fail("Valid reorder"), error: () => assert.fail("Valid reorder") },
  };
  const event = {
    preventDefault() {},
    stopPropagation() {},
    clientX: 180,
    currentTarget: { getBoundingClientRect: () => ({ left: 0 }) },
    dataTransfer: {
      setData: (key, value) => { data[key] = value; },
      getData: key => data[key],
      types: ["application/x-syncnox-booking", "application/json"],
    },
  };
  handler("handleTimelineStopDragStart", context)(event, 0, 1, [1], 1, 1);
  context.draggedTrip = null;
  context.draggedStopInfo = dragged;
  handler("handleTimelineTrackDragOver", context)(event, 0);
  assert.ok(context.dragOverSlotRef.current, "dragOverSlotRef must be populated when dragging over same route");
  assert.equal(context.dragOverSlotRef.current.targetFirstRawIndex, 2);
  assert.equal(context.dragOverSlotRef.current.side, "after");
  assert.equal(overInfo.targetFirstRawIndex, 2);
  await handler("handleTimelineDrop", context)(event, 0);
  assert.equal(reordered.length, 1);
  assert.equal(reordered[0][0], 0);
  assert.deepEqual(reordered[0][1], [2, 1, 1, 2]);
  assert.deepEqual(reordered[0][2], [2, 1, 3, 4]);
});

const viewSource = fs.readFileSync(path.join(__dirname, "../app/route/_components/OptimizationView.tsx"), "utf8");
const viewTree = ts.createSourceFile("view.tsx", viewSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let moveDeclaration;
(function visit(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(viewTree) === "handleMoveStops") moveDeclaration = node.parent.parent.getText(viewTree);
  ts.forEachChild(node, visit);
})(viewTree);
const moveCompiled = ts.transpileModule(moveDeclaration, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;

for (const fail of [false, true]) test(`fixed-time booking action ${fail ? "keeps rejection details visible" : "updates from the synchronous result without optimization"}`, async () => {
  let confirm, errorDialog;
  const calls = [], results = [];
  const selected = { sourceRouteIndex: 0, sourceDriverId: 7, sourceLeg: "GO", jobIds: [1], sourceStops: stops };
  const detail = "Driver 2 cannot keep these pickup times.\nRoad travel needs 6m; available gap is 2m.";
  const context = {
    require, exports: {}, useCallback: fn => fn,
    tripMoveInProgress: { current: false },
    route: { id: 235, job_ids: [1, 2], result: { routes: [{ team_member_id: 7 }, { team_member_id: 2, team_member_name: "Driver 2", vehicle_id: 20, vehicle_name: "Van", stops }] } },
    vehicles: [], snapshotMoveStops: route => route.stops,
    Modal: { confirm: options => { confirm = options; }, error: options => { errorDialog = options; } },
    useOptimizationStore: { getState: () => ({ currentOptimization: { id: 235 } }) },
    setIsMovingTrip() {}, setFocusedRouteIndex() {}, setSelectedMarkerId() {},
    message: { loading() {}, success() {}, warning() {}, error() {}, destroy() {} },
    moveRouteStops: async (...args) => { calls.push(args); if (fail) throw { detail }; return { success: true, message: "Moved", result: { routes: [] } }; },
    isAxiosError: () => false,
    setOptimizationResult: (...args) => results.push(args),
    fetchJobsByIds: async () => {}, refreshUndoHistory: async () => {},
  };
  const fn = new Function(...Object.keys(context), moveCompiled + ";return handleMoveStops;")(...Object.values(context));
  fn(selected, 1);
  assert.equal(confirm.okButtonProps.style.backgroundColor, "#003220");
  await confirm.onOk();
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].slice(0, 2), [235, 0]);
  assert.deepEqual(calls[0][2].expected_source_stops, stops);
  assert.deepEqual(calls[0][2].job_ids, [1]);
  assert.ok(!("reoptimize" in calls[0][2]));
  if (fail) {
    assert.equal(results.length, 0);
    assert.equal(errorDialog.title, "Could not move Job #1 to Driver 2");
    assert.equal(errorDialog.content.props.children, detail);
  } else {
    assert.deepEqual(results, [["completed", { routes: [] }]]);
  }
});
