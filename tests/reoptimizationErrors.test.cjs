const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");

const source = fs.readFileSync(`${__dirname}/../app/route/_components/OptimizationView.tsx`, "utf8");
const tree = ts.createSourceFile("view.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const declarations = new Map();
(function visit(node) {
  if (ts.isVariableDeclaration(node) && ["handleReOptimize", "handleSaveAndReOptimize"].includes(node.name.getText(tree))) {
    declarations.set(node.name.getText(tree), node.parent.parent.getText(tree));
  }
  ts.forEachChild(node, visit);
})(tree);

for (const name of ["handleReOptimize", "handleSaveAndReOptimize"]) {
  function setup({ error, enqueueError, status = "completed", currentId = 47 }) {
    let confirmation;
    const updates = [], notices = [];
    const context = {
      useCallback: fn => fn,
      route: { id: 47, result: { routes: [{ team_member_name: "Driver" }] } },
      pendingDeletedJobIds: new Set(), applyStagedRemovals: async () => {},
      reorderRouteStops: async () => ({ success: true }),
      reOptimizeRoute: async () => { if (enqueueError) throw enqueueError; return { success: true }; },
      setPendingDeletedJobIds: () => {},
      waitUntilComplete: async () => { throw error; },
      fetchOptimization: async () => {},
      setOptimizationResult: (...args) => updates.push(args),
      useOptimizationStore: { getState: () => ({ currentOptimization: { id: currentId, status } }) },
      Modal: { confirm: options => { confirmation = options; } },
      message: Object.fromEntries(["loading", "success", "error"].map(kind => [kind, value => notices.push([kind, value])])),
    };
    assert.ok(declarations.has(name));
    const compiled = ts.transpileModule(declarations.get(name), { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
    const fn = new Function(...Object.keys(context), compiled + `; return ${name};`)(...Object.values(context));
    return { updates, notices, run: async () => { await fn(0, [1]); if (confirmation) await confirmation.onOk(); } };
  }

  test(`${name} preserves the worker's detailed conflict in the banner and toast`, async () => {
    const detail = "Job #12548: Conflicts with job #12692: both drop-offs must be 05:10–05:20, but travel between them needs at least 40m 23s. Use another driver or change a job time. Assignments kept.";
    const ctx = setup({ error: new Error(detail) });
    await ctx.run();
    assert.deepEqual(ctx.updates.at(-1), ["completed", undefined, detail]);
    assert.equal(ctx.notices.find(([kind]) => kind === "error")[1].content, detail);
  });

  test(`${name} displays API error details when enqueueing fails`, async () => {
    for (const enqueueError of [{ detail: "Optimization is already running" }, { response: { data: { detail: "Optimization is already running" } } }]) {
      const ctx = setup({ enqueueError, status: "processing" });
      await ctx.run();
      assert.deepEqual(ctx.updates.at(-1), ["failed", undefined, "Optimization is already running"]);
    }
  });

  test(`${name} does not put an old route's error on a newly opened route`, async () => {
    const ctx = setup({ error: new Error("Old route conflict"), currentId: 48 });
    await ctx.run();
    assert.equal(ctx.updates.filter(([status]) => status !== "processing").length, 0);
  });
}
