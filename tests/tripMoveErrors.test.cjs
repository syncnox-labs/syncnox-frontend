const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
const source = fs.readFileSync(`${__dirname}/../app/route/_components/OptimizationView.tsx`, "utf8");
const tree = ts.createSourceFile("view.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let declaration;
(function visit(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(tree) === "handleMoveTrip") declaration = node.parent.parent.getText(tree);
  ts.forEachChild(node, visit);
})(tree);
assert.ok(declaration);
const compiled = ts.transpileModule(declaration, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;

for (const axiosStyle of [false, true]) test(`move error keeps the complete ${axiosStyle ? "Axios" : "API"} conflict details in a dismissible dialog`, async () => {
  const detail = 'VEHICULE 2 already has a trip during this time.\nConflicting trip: Alliance Driver 14 using VEHICULE 2, plan "route - 48" (#235).\nBooked: Tue 29 Sep 2026, 09:31:09 PM – 10:45:18 PM.';
  const failure = axiosStyle ? { response: { data: { detail } } } : { detail };
  let confirmation, dialog;
  const states = [], destroyed = [];
  const context = {
    require, exports: {},
    useCallback: fn => fn,
    tripMoveInProgress: { current: false },
    route: { id: 235, result: { routes: [{ team_member_id: 14, team_member_name: "Alliance Driver 14" },
      { team_member_id: 2, team_member_name: "Alliance Driver 2", vehicle_id: 13, vehicle_name: "VEHICULE 2" }] } },
    vehicles: [], dayjs: require("dayjs"),
    Modal: { confirm: options => { confirmation = options; }, error: options => { dialog = options; } },
    useOptimizationStore: { getState: () => ({ currentOptimization: { id: 235 } }) },
    setIsMovingTrip: value => states.push(value),
    message: { loading() {}, destroy: key => destroyed.push(key), error: () => assert.fail("Details must remain in a dialog") },
    moveRouteTrip: async () => { throw failure; },
    isAxiosError: () => axiosStyle,
    setOptimizationResult: () => assert.fail("Rejected move must not modify the plan"),
    fetchJobsByIds() {}, refreshUndoHistory() {},
  };
  const fn = new Function(...Object.keys(context), compiled + ";return handleMoveTrip;")(...Object.values(context));
  fn({ sourceRouteIndex: 0, startStopIndex: 0, sourceDriverId: 14, sourceLeg: "RETURN", stops: [
    { arrival_time: "2026-09-29T21:31:09" }, { arrival_time: "2026-09-29T22:45:18" },
  ] }, 1);
  await confirmation.onOk();
  assert.equal(dialog.title, "Trip could not be moved");
  assert.equal(dialog.content.props.children, detail);
  assert.match(dialog.content.props.className, /whitespace-pre-line/);
  assert.equal(dialog.okText, "Got it");
  assert.equal(dialog.okButtonProps.style.backgroundColor, "#003220");
  assert.deepEqual(destroyed, ["move_trip"]);
  assert.deepEqual(states, [true, false]);
});
