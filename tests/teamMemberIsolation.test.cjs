const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');

function harness(kind = 'team') {
  const effects = [], saves = [], updates = [], forms = [];
  const Form = Object.assign(() => {}, { useForm: () => {
    let fields = {};
    const form = {
      resetFields: () => { fields = {}; },
      getFieldValue: (key) => fields[key],
      setFieldsValue: (values) => { fields = { ...fields, ...values }; },
      validateFields: async () => ({ ...fields }),
    };
    forms.push(form);
    return [form];
  } });
  const modules = {
    react: {
      useState: (v) => [v, () => {}], useRef: (v) => ({ current: v }),
      useEffect: (effect) => effects.push(effect), useMemo: (fn) => fn(),
    },
    'react/jsx-runtime': {
      jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }),
    },
    antd: { Form, Typography: {}, Radio: {}, message: { useMessage: () => [{ success() {}, error() {} }, null] } },
    '@/store/team.store': { useTeamStore: () => ({
      updateTeamAction: async (values) => updates.push(values),
    }) },
    '@/apis/custom-fields.api': { getCustomFields: async () => [] },
    '@/store/vehicle.store': { useVehicleStore: () => ({ vehicles: [],
      updateVehicleAction: async (values) => updates.push(values),
    }) },
    '@/store/location-mapping.store': { useLocationMappingStore: () => ({
      updateLocationMapping: async (id, values) => { updates.push({ ...values, id }); return true; },
    }) },
    '@/store/depots.store': { useDepotStore: () => ({ depots: [] }) },
    '@/apis/team.api': { saveDriverZones: async () => {} },
    '@/utils/form.utils': { isTextInput: () => true },
    './teamMemberForm.utils': {
      transformApiToForm: (team) => ({ ...team }),
      transformFormToApi: (values, skills, breaks, team) => ({ ...values, id: team.id }),
    },
    '@/hooks/useQueuedAutoSave': { useQueuedAutoSave: ({ save }) => ({
      scheduleAutoSave: () => saves.push(() => save('auto')),
      saveNow: () => save('manual'),
    }) },
  };
  const paths = { team: 'team/TeamMemberForm', vehicle: 'vehicle/VehicleForm', location: 'location-mapping/LocationMappingForm' };
  const [folder, file] = paths[kind].split('/');
  const compiled = ts.transpileModule(fs.readFileSync(
    `${__dirname}/../app/${folder}/_components/${file}.tsx`, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports = {};
  new Function('require', 'exports', 'setTimeout', compiled)(
    (name) => modules[name] || {}, exports, (fn) => fn());
  function render(team) {
    const tree = exports.default({ initialData: team, isInline: true });
    effects.splice(0).forEach((effect) => effect());
    const find = (node) => {
      if (!node || typeof node !== 'object') return;
      if (node.type === Form) return node;
      for (const child of [node.props?.children].flat()) {
        const found = find(child);
        if (found) return found;
      }
    };
    return find(tree);
  }
  return { render, saves, updates, forms };
}

test('pending cost save retains Samer identity when another editor opens', async () => {
    const { render, saves, updates, forms } = harness();
    const samer = render({ id: 117, name: 'samer tighdet', role_type: 'driver', cost: 10 });
    forms[0].setFieldsValue({ cost: 25 });
    samer.props.onValuesChange({ cost: 25 });
    // Render the next editor before the departing editor's deferred save runs.
    const vikas = render({ id: 116, name: 'Vikas Singh', role_type: 'driver', cost: 15 });
    assert.notEqual(samer.props.form, vikas.props.form);
    await saves[0]();
    assert.deepEqual(updates.map(({ id, name, cost }) => ({ id, name, cost })), [
      { id: 117, name: 'samer tighdet', cost: 25 },
    ]);
    assert.equal((await forms[1].validateFields()).name, 'Vikas Singh');
    assert.equal(samer.props.id, 'team-member-117');
  });

for (const kind of ['vehicle', 'location']) {
  test(`${kind}: a deferred edit saves only the departing record's fields`, async () => {
    const { render, saves, updates, forms } = harness(kind);
    const first = render({ id: 21, name: 'Original', license_plate: 'AAA', type: 'car', latitude: 45, longitude: -73 });
    forms[0].setFieldsValue({ name: 'Edited original' });
    first.props.onValuesChange({ name: 'Edited original' });
    const second = render({ id: 22, name: 'Other', license_plate: 'BBB', type: 'van', latitude: 46, longitude: -74 });
    assert.notEqual(first.props.form, second.props.form);
    await saves[0]();
    assert.equal(updates.length, 1);
    assert.equal(updates[0].id, 21);
    assert.equal(updates[0].name, 'Edited original');
    assert.equal((await forms[1].validateFields()).name, 'Other');
    if (kind === 'vehicle') assert.equal(updates[0].license_plate, 'AAA');
    else {
      assert.equal(updates[0].latitude, 45);
      assert.equal(updates[0].longitude, -73);
    }
  });
}

test('list screens never pass a shared form into record editors', () => {
  for (const [path, editor] of [
    ['team/_components/TeamList.tsx', 'TeamMemberForm'],
    ['vehicle/_components/VehicleList.tsx', 'VehicleForm'],
    ['location-mapping/_components/LocationMappingList.tsx', 'LocationMappingForm'],
    ['locations/_components/LocationsView.tsx', 'LocationMappingForm'],
  ]) {
    const source = ts.createSourceFile(path, fs.readFileSync(`${__dirname}/../app/${path}`, 'utf8'),
      ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    let count = 0;
    const visit = (node) => {
      if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(source) === editor) {
        count++;
        const attributes = node.attributes.properties.map(attr => attr.name?.getText(source));
        assert.ok(!attributes.includes('form'), `${path} must use the editor's own form`);
        assert.ok(attributes.includes('key'), `${path} must remount on record changes`);
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
    assert.equal(count, 1, `Expected one ${editor} in ${path}`);
  }
});
