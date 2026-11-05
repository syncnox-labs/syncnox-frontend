const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");

function handler(file, name, context) {
  context = { require, exports: {}, ...context };
  const source = fs.readFileSync(`${__dirname}/../app/route/_components/${file}.tsx`, "utf8");
  const tree = ts.createSourceFile("view.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let declaration;
  (function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(tree) === name) declaration = node.parent.parent.getText(tree);
    ts.forEachChild(node, visit);
  })(tree);
  assert.ok(declaration);
  const compiled = ts.transpileModule(declaration, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  return new Function(...Object.keys(context), compiled + `;return ${name};`)(...Object.values(context));
}

for (const axiosStyle of [false, true]) test(`move error keeps the complete ${axiosStyle ? "Axios" : "API"} conflict details in a dismissible dialog`, async () => {
  const detail = 'VEHICULE 2 already has a trip during this time.\nConflicting trip: Alliance Driver 14 using VEHICULE 2, plan "route - 48" (#235).\nBooked: Tue 29 Sep 2026, 09:31:09 PM – 10:45:18 PM.';
  const failure = axiosStyle ? { response: { data: { detail } } } : { detail };
  let dialog;
  const states = [], busy = [], errors = [];
  const context = {
    require,
    request: { optimizationId: 235, routeIndex: 0, payload: { expected_target_vehicle_id: null } },
    optimizationId: 235, saving: false, selectedId: 30, available: [{ id: 30 }],
    Modal: { error: options => { dialog = options; } },
    useOptimizationStore: { getState: () => ({ currentOptimization: { id: 235 } }) },
    setSaving: value => states.push(value), onBusyChange: value => busy.push(value), setError: error => errors.push(error),
    message: { success: () => assert.fail("Rejected move must not succeed") },
    moveRouteTrip: async () => { throw failure; },
    errorText: error => axiosStyle ? error.response.data.detail : error.detail,
    onSuccess: () => assert.fail("Rejected move must not modify the plan"),
    onClose: () => assert.fail("Keep vehicle selection open after a rejected move"),
  };
  await handler("MoveTripModal", "save", context)();
  assert.equal(dialog.title, "Trip could not be moved");
  assert.equal(dialog.content.props.children, detail);
  assert.match(dialog.content.props.className, /whitespace-pre-line/);
  assert.equal(dialog.okText, "Got it");
  assert.equal(dialog.okButtonProps.style.backgroundColor, "#003220");
  assert.deepEqual(errors, [null, detail]);
  assert.deepEqual(states, [true, false]);
  assert.deepEqual(busy, [true, false]);
});

test("dropping a complete trip onto a driver with no vehicle opens the vehicle selector", () => {
  const moves = [];
  const selection = { sourceRouteIndex: 0, sourceDriverId: 14 };
  const context = {
    useCallback: fn => fn, tripMoveInProgress: { current: false },
    route: { result: { routes: [{ team_member_id: 14, vehicle_id: 54 }, { team_member_id: 177, vehicle_id: null, stops: [] }] } },
    setTripMoveTarget: move => moves.push(move),
  };
  handler("OptimizationView", "handleMoveTrip", context)(selection, 1);
  assert.deepEqual(moves, [{ selection, targetIndex: 1 }]);
  assert.equal(context.tripMoveInProgress.current, true);
});

test("saving a selected fleet vehicle sends a nullable target guard and refreshes before closing", async () => {
  const calls = [];
  const context = {
    request: { optimizationId: 251, routeIndex: 5, payload: { expected_target_vehicle_id: null } },
    optimizationId: 252, saving: false, selectedId: 30, available: [{ id: 30 }],
    useOptimizationStore: { getState: () => ({ currentOptimization: { id: 252 } }) },
    setSaving() {}, onBusyChange() {}, setError() {},
    message: { success: message => calls.push(message) },
    moveRouteTrip: async (...args) => { calls.push(args); return { success: true, message: "Moved" }; },
    onSuccess: async () => calls.push("refresh"), onClose: () => calls.push("close"),
  };
  await handler("MoveTripModal", "save", context)();
  assert.deepEqual(calls, [[251, 5, { expected_target_vehicle_id: null, vehicle_id: 30 }], "Moved", "refresh", "close"]);
});

test("a changed open plan prevents a pending vehicle selection from being applied", async () => {
  const errors = [];
  const context = {
    request: {}, optimizationId: 252, saving: false, selectedId: 30, available: [{ id: 30 }],
    useOptimizationStore: { getState: () => ({ currentOptimization: { id: 999 } }) },
    setError: message => errors.push(message), moveRouteTrip: () => assert.fail("Do not submit a stale plan"),
  };
  await handler("MoveTripModal", "save", context)();
  assert.match(errors[0], /plan changed/);
});
