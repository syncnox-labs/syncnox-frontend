const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

function harness() {
  const slots = [], pending = [], requests = [];
  let cursor = 0, tenant = 'one', writes = 0;
  const same = (a, b) => a && b && a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
  const react = {
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = { value: typeof initial === 'function' ? initial() : initial };
      return [slots[index].value, next => { writes++; slots[index].value = typeof next === 'function' ? next(slots[index].value) : next; }];
    },
    useRef(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = { value: { current: initial } };
      return slots[index].value;
    },
    useCallback(fn, deps) {
      const index = cursor++;
      if (!same(slots[index]?.deps, deps)) slots[index] = { value: fn, deps };
      return slots[index].value;
    },
    useEffect(effect, deps) {
      const index = cursor++;
      if (!same(slots[index]?.deps, deps)) {
        const previous = slots[index];
        slots[index] = { deps, cleanup: previous?.cleanup };
        pending.push(() => { slots[index].cleanup?.(); slots[index].cleanup = effect(); });
      }
    },
  };
  const window = new EventTarget();
  window.localStorage = { getItem: () => null };
  const imports = {
    react,
    '@/store/index.store': { useIndexStore: selector => selector({ user: { tenant_id: tenant } }) },
    '@/apis/custom-fields.api': {
      CUSTOM_FIELDS_CHANGED_EVENT: 'fields-changed',
      getCustomFields: entity => new Promise((resolve, reject) => requests.push({ entity, resolve, reject })),
    },
    '@/utils/settingsTable.columns': { readSettingsFieldPreferences: () => ({ hiddenFields: [], surfaceOverrides: {} }) },
  };
  const exports = {};
  new Function('exports', 'require', 'window', ts.transpileModule(fs.readFileSync(path.join(__dirname, '../hooks/useEntityTableFields.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText)(exports, name => imports[name] || require(name), window);
  return {
    requests,
    setTenant(value) { tenant = value; },
    render(entity = 'team_member', enabled = true) {
      cursor = 0;
      const value = exports.useEntityTableFields(entity, enabled);
      while (pending.length) pending.shift()();
      return value;
    },
    emit(type, detail) {
      const event = new Event(type);
      if (type === 'storage') Object.defineProperty(event, 'key', { value: detail });
      else Object.defineProperty(event, 'detail', { value: detail });
      window.dispatchEvent(event);
    },
    unmount() { for (const slot of slots) slot?.cleanup?.(); },
    get writes() { return writes; },
  };
}
const tick = () => new Promise(resolve => setImmediate(resolve));

test('field requests are lazy and ignore changes to other entities', async () => {
  const h = harness();
  h.render('team_member', false);
  assert.equal(h.requests.length, 0);
  h.render();
  assert.equal(h.requests.length, 1);
  h.requests[0].resolve([{ field_key: 'badge' }]); await tick();
  assert.equal(h.render().fields[0].field_key, 'badge');
  h.emit('fields-changed', { entityType: 'vehicle' });
  h.emit('storage', 'unrelated');
  assert.equal(h.requests.length, 1);
  h.emit('fields-changed', { entityType: 'team_member' });
  assert.equal(h.requests.length, 2);
  h.unmount();
});

test('late field responses cannot overwrite newer template changes', async () => {
  const h = harness();
  h.render();
  h.emit('fields-changed', { entityType: 'team_member' });
  h.requests[1].resolve([{ field_key: 'latest' }]); await tick();
  h.requests[0].resolve([{ field_key: 'stale' }]); await tick();
  assert.deepEqual(h.render().fields, [{ field_key: 'latest' }]);
  h.unmount();
});

test('switching tenants immediately masks the prior schema and rejects stale results', async () => {
  const h = harness();
  h.render(); h.requests[0].resolve([{ field_key: 'tenant_one' }]); await tick();
  h.render(); h.emit('fields-changed', { entityType: 'team_member' });
  h.setTenant('two');
  const transition = h.render();
  assert.deepEqual(transition.fields, []);
  assert.equal(transition.ready, false);
  h.requests[1].resolve([{ field_key: 'old_tenant_response' }]); await tick();
  h.requests[2].resolve([{ field_key: 'tenant_two' }]); await tick();
  assert.deepEqual(h.render().fields, [{ field_key: 'tenant_two' }]);
  h.unmount();
});

test('refresh errors preserve the last schema, allow retry, and stop updates after unmount', async () => {
  const h = harness();
  h.render(); h.requests[0].resolve([{ field_key: 'known' }]); await tick();
  h.render(); h.emit('focus'); h.requests[1].reject(Error('Offline')); await tick();
  const failed = h.render();
  assert.equal(failed.error, true);
  assert.equal(failed.ready, true);
  assert.deepEqual(failed.fields, [{ field_key: 'known' }]);
  void failed.reload(); h.requests[2].resolve([{ field_key: 'recovered' }]); await tick();
  assert.equal(h.render().error, false);
  h.emit('fields-changed');
  h.unmount(); const writes = h.writes;
  h.requests[3].resolve([{ field_key: 'after_unmount' }]); await tick();
  assert.equal(h.writes, writes);
  h.emit('focus'); assert.equal(h.requests.length, 4);
});
