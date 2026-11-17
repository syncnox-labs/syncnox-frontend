const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const ts = require("typescript");

const source = fs.readFileSync(path.join(__dirname, "../app/route/_components/timelineDriverOrder.utils.ts"), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const exported = {};
new Function("exports", compiled)(exported);
const { orderDrivers, moveVisibleDriver } = exported;

test("saved order preserves driver groups and appends newly available drivers", () => {
  const groups = [
    { driverKey: "a", routes: [{ originalIndex: 4 }, { originalIndex: 1 }] },
    { driverKey: "b", routes: [{ originalIndex: 0 }] },
    { driverKey: "c", routes: [{ originalIndex: 8 }] },
  ];
  const ordered = orderDrivers(groups, ["b", "missing", "b", "a"]);
  assert.deepEqual(ordered.map(group => group.driverKey), ["b", "a", "c"]);
  assert.deepEqual(ordered[1].routes.map(route => route.originalIndex), [4, 1]);
  assert.deepEqual(groups.map(group => group.driverKey), ["a", "b", "c"]);
});

test("drivers can be moved before or after another driver", () => {
  const keys = ["a", "b", "c", "d"];
  assert.deepEqual(moveVisibleDriver(keys, keys, "d", "b", "before"), ["a", "d", "b", "c"]);
  assert.deepEqual(moveVisibleDriver(keys, keys, "a", "c", "after"), ["b", "c", "a", "d"]);
  assert.deepEqual(moveVisibleDriver(keys, keys, "b", "b", "before"), keys);
});

test("reordering filtered drivers keeps hidden drivers in their slots", () => {
  const keys = ["a", "hidden1", "b", "hidden2", "c"];
  assert.deepEqual(moveVisibleDriver(keys, ["a", "b", "c"], "c", "a", "before"),
    ["c", "hidden1", "a", "hidden2", "b"]);
  assert.deepEqual(moveVisibleDriver(keys, ["a", "b", "c"], "a", "missing", "before"), keys);
});
