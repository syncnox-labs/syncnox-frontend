const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

function load(file, imports = {}) {
  const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText;
  const exports = {};
  new Function('exports', 'require', code)(exports, name => name in imports ? imports[name] : require(name));
  return exports;
}

function handler(file, name, context) {
  const source = fs.readFileSync(path.join(__dirname, '../app/route/_components', file + '.tsx'), 'utf8');
  const tree = ts.createSourceFile(file + '.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let declaration;
  (function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(tree) === name) declaration = node.parent.parent.getText(tree);
    ts.forEachChild(node, visit);
  })(tree);
  assert.ok(declaration);
  const code = ts.transpileModule(declaration, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText;
  context = { require, exports: {}, ...context };
  return new Function(...Object.keys(context), code + `;return ${name};`)(...Object.values(context));
}

const { getDriverShareTarget } = load('app/route/_components/routeSharing.utils.ts');

test('Robin shares his real AM trip when the PM driver row starts with an empty placeholder', () => {
  const routes = [
    { team_member_id: 183, stops: [] },
    { team_member_id: 182, stops: [{ job_id: 10 }] },
    { team_member_id: 183, source_optimization_id: 259, stops: [{ job_id: 22 }] },
  ];
  assert.deepEqual(getDriverShareTarget(routes, 0, 261), { driverId: 183, optimizationId: 259 });
  const calls = [];
  handler('OptimizationView', 'handleShareDriver', {
    getDriverShareTarget, route: { id: 261, result: { routes } },
    handleShareToApp: (...args) => calls.push(args),
  })(0);
  assert.deepEqual(calls, [[183, 259]]);
});

test('a nonempty selected trip retains its source even when another plan has trips for that driver', () => {
  const routes = [
    { team_member_id: 183, stops: [{ job_id: 11 }] },
    { team_member_id: 183, source_optimization_id: 259, stops: [{ job_id: 22 }] },
  ];
  assert.deepEqual(getDriverShareTarget(routes, 0, 261), { driverId: 183, optimizationId: 261 });
  assert.deepEqual(getDriverShareTarget(routes, 1, 261), { driverId: 183, optimizationId: 259 });
});

test('placeholder selection prefers current-plan jobs and never selects another driver', () => {
  const routes = [
    { team_member_id: 183, stops: [{ job_id: null, stop_type: 'depot_start' }] },
    { team_member_id: 182, source_optimization_id: 250, stops: [{ job_id: 10 }] },
    { team_member_id: 183, source_optimization_id: 259, stops: [{ job_id: 22 }] },
    { team_member_id: 183, stops: [{ job_id: 33 }] },
  ];
  assert.deepEqual(getDriverShareTarget(routes, 0, 261), { driverId: 183, optimizationId: 261 });
  assert.equal(getDriverShareTarget(routes, 99, 261), null);
});

test('an empty driver still targets the current plan so an old share can be revoked', () => {
  assert.deepEqual(getDriverShareTarget([{ team_member_id: 183, stops: [] }], 0, 261),
    { driverId: 183, optimizationId: 261 });
});

test('share API scopes a driver by ID and leaves bulk sharing unfiltered', async () => {
  const calls = [];
  const api = load('apis/routes.api.ts', { '@/config/apiClient.config': {
    post: async (...args) => { calls.push(args); return { data: { shared_count: 1 } }; },
  } });
  await api.shareOptimizationRoutes(131);
  await api.shareOptimizationRoutes(131, 42);
  assert.deepEqual(calls, [
    ['optimization/131/share', undefined, undefined],
    ['optimization/131/share', undefined, { params: { driver_id: 42 } }],
  ]);
});

function sharingContext(overrides = {}) {
  const calls = [], results = [], busy = [], driverBusy = [], states = [], errors = [];
  const response = { shared_count: 1, driver_ids: [42], online_drivers: [],
    last_shared_at: '2026-11-11T00:00:00Z', sharing_status: 'pending_share',
    skipped_drivers: [{ driver_id: 43, driver_name: 'Blocked Driver', reason: 'Missing travel distance' }] };
  const context = {
    shareInFlight: { current: false }, route: { id: 131 },
    setIsSharing: value => busy.push(value), setSharingDriverId: value => driverBusy.push(value),
    shareOptimizationRoutes: async (...args) => { calls.push(args); return response; },
    setSharingState: value => states.push(value), setShareResult: value => results.push(value),
    message: { error: value => errors.push(value) }, ...overrides,
  };
  return { context, calls, results, busy, driverBusy, states, errors, response,
    run: handler('OptimizationView', 'handleShareToApp', context) };
}

test('partial sharing displays skipped reasons and keeps the plan pending', async () => {
  const ctx = sharingContext();
  await ctx.run();
  assert.deepEqual(ctx.calls, [[131, undefined]]);
  assert.equal(ctx.results[0], ctx.response);
  assert.deepEqual(ctx.states, [{ last_shared_at: ctx.response.last_shared_at, sharing_status: 'pending_share' }]);
  assert.deepEqual(ctx.busy, [true, false]);
});

test('driver sharing sends only the selected driver and clears its loading state', async () => {
  const ctx = sharingContext();
  await ctx.run(42);
  assert.deepEqual(ctx.calls, [[131, 42]]);
  assert.deepEqual(ctx.driverBusy, [42, null]);
  assert.equal(ctx.context.shareInFlight.current, false);
});

test('a route from another visible plan shares from its source without changing the current plan status', async () => {
  const ctx = sharingContext();
  await ctx.run(42, 130);
  assert.deepEqual(ctx.calls, [[130, 42]]);
  assert.deepEqual(ctx.states, []);
  assert.equal(ctx.results[0], ctx.response);
});

test('concurrent share clicks cannot issue duplicate publications', async () => {
  let finish, calls = 0;
  const ctx = sharingContext({ shareOptimizationRoutes: () => {
    calls++;
    return new Promise(resolve => { finish = resolve; });
  } });
  const first = ctx.run(42);
  await ctx.run(43);
  assert.equal(calls, 1);
  finish(ctx.response);
  await first;
});

for (const axiosStyle of [false, true]) test(`blocked driver shows ${axiosStyle ? 'Axios' : 'API'} reason without showing success`, async () => {
  const reason = 'Selected Driver: Shuttle travel distance is missing';
  const ctx = sharingContext({ shareOptimizationRoutes: async () => {
    throw axiosStyle ? { response: { data: { detail: reason } } } : { detail: reason };
  } });
  await ctx.run(42);
  assert.deepEqual(ctx.errors, [reason]);
  assert.deepEqual(ctx.results, []);
  assert.deepEqual(ctx.driverBusy, [42, null]);
});

test('driver menu replaces route editing with Share and disables it while sharing', () => {
  const calls = [];
  const Icon = () => null;
  const context = {
    routes: [{ team_member_id: 42 }, { team_member_id: 43 }], onShareDriver: index => calls.push(index),
    sharingDisabled: false, sharingDriverId: null, onMergeRoutes: null, onEditWaiting: null,
    isWorkerShuttle: false, LoadingOutlined: Icon, ShareAltOutlined: Icon,
    PlusOutlined: Icon, SwapOutlined: Icon, MenuOutlined: Icon, ThunderboltOutlined: Icon,
  };
  const menu = handler('TimelineView', 'getRouteMenuItems', context)(1);
  assert.equal(menu[0].label, 'Share');
  assert.equal(menu[0].disabled, false);
  menu[0].onClick();
  assert.deepEqual(calls, [1]);
  assert.ok(menu.every(item => item.key !== 'edit-route'));
  const pending = handler('TimelineView', 'getRouteMenuItems', {
    ...context, sharingDisabled: true, sharingDriverId: 43,
  })(1);
  assert.equal(pending[0].label, 'Sharing…');
  assert.equal(pending[0].disabled, true);
});
