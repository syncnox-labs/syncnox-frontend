const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const exportsObj = {};
new Function('exports', ts.transpileModule(fs.readFileSync(path.join(__dirname, '../utils/settingsTable.columns.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText)(exportsObj);
const { matchSettingsArrayFilter, resolveSettingsColumns, readSettingsFieldPreferences, reconcileSettingsFilters, parseSettingsDate, createTeamSettingsColumns, createVehicleSettingsColumns, createDepotSettingsColumns,
  createLocationSettingsColumns, createSettingsCustomColumns, formatSettingsValue } = exportsObj;
const value = (columns, id, data) => columns.find(column => column.colId === id).valueGetter({ data });

test('standard text-filter options match whole skill values and handle commas without substring collisions', () => {
  const skills = JSON.stringify([' Heavy Truck ', 'First Aid', 'Class 1, restricted']);
  const match = (filterOption, filterText) => matchSettingsArrayFilter({ value: skills, filterOption, filterText });
  assert.equal(match('equals', 'heavy truck'), true);
  assert.equal(match('equals', 'Truck'), false);
  assert.equal(match('equals', 'Class 1, restricted'), true);
  assert.equal(match('contains', 'Truck'), true);
  assert.equal(match('notEqual', 'truck'), true);
  assert.equal(match('notContains', 'aid'), false);
  assert.equal(match('startsWith', 'first'), true);
  assert.equal(match('endsWith', 'restricted'), true);
});

test('team columns show related vehicles, working days, skills and zero-valued costs', () => {
  const columns = createTeamSettingsColumns([{ id: 7, name: 'Van 7' }]);
  const team = { id: 1, name: 'Sam', skills: ['First Aid', 'Heavy Truck'], vehicle_id: 7, cost_per_km: 0,
    allowed_overtime: false, day_schedules: { mon: { enabled: true, start_time: '08:00', end_time: '16:00' }, tue: { enabled: false } } };
  assert.equal(value(columns, 'vehicle', team), 'Van 7');
  assert.equal(value(columns, 'skills', team), 'First Aid, Heavy Truck');
  assert.equal(value(columns, 'cost_per_km', team), 0);
  assert.equal(value(columns, 'allowed_overtime', team), 'No');
  assert.match(value(columns, 'day_schedules', team), /Mon: 08:00–16:00; Tue: Off/);
});

test('vehicle numeric filters keep different capacity units and custom constraints separate', () => {
  const rows = [
    { id: 1, name: 'A', team_member_id: 4, load_constraints: [{ constraint_type: 'capacity', max_value: 8, unit: 'seats' }, { constraint_type: 'weight', max_value: 0, unit: 'kg' }] },
    { id: 2, name: 'B', load_constraints: [{ constraint_type: 'weight', max_value: 500, unit: 'lb' }, { constraint_type: 'custom', label: 'Crates', max_value: 12, unit: 'items' }] },
  ];
  const columns = createVehicleSettingsColumns(rows, [{ id: 4, name: 'Sam' }]);
  const capacity = columns.find(column => column.headerName === 'Capacity (seats)');
  const kg = columns.find(column => column.headerName === 'Weight (kg)');
  const pounds = columns.find(column => column.headerName === 'Weight (lb)');
  assert.equal(capacity.filter, 'agNumberColumnFilter');
  assert.equal(capacity.valueGetter({ data: rows[0] }), 8);
  assert.equal(kg.valueGetter({ data: rows[0] }), 0);
  assert.equal(kg.valueGetter({ data: rows[1] }), null);
  assert.equal(pounds.valueGetter({ data: rows[1] }), 500);
  assert.equal(value(columns, 'team_member', rows[0]), 'Sam');
  assert.ok(columns.some(column => column.headerName === 'Crates (items)'));
});

test('depot and additional location columns handle partial addresses, zero coordinates and custom type labels', () => {
  const depots = createDepotSettingsColumns();
  assert.equal(value(depots, 'latitude', { location: { lat: 0, lng: 0 } }), 0);
  assert.equal(value(depots, 'city', { address: { formatted_address: 'Depot' } }), '');
  const locations = createLocationSettingsColumns([{ value: 'customer_site', label: 'Customer site' }]);
  assert.equal(value(locations, 'type', { location_type: 'Customer Site' }), 'Customer site');
  assert.equal(value(locations, 'is_active', { is_active: false }), 'Inactive');
  assert.equal(value(locations, 'aliases', { aliases: ['Gate A', 'East entrance'] }), 'Gate A, East entrance');
});

test('custom columns respect visibility, preserve numeric zeros and reject invalid numbers', () => {
  const fields = [
    { field_key: 'capacity', label: 'Extra capacity', data_type: 'number', is_visible_in_list: true, display_order: 2 },
    { field_key: 'certified', label: 'Certified', data_type: 'boolean', is_visible_in_list: true, display_order: 1 },
    { field_key: 'hidden', label: 'Hidden', data_type: 'string', is_visible_in_list: false, display_order: 3 },
    { field_key: 'private', label: 'Private', data_type: 'string', is_visible_in_list: true, surfaces: { disp: false }, display_order: 4 },
  ];
  const columns = createSettingsCustomColumns(fields);
  assert.deepEqual(columns.map(column => column.headerName), ['Certified', 'Extra capacity']);
  assert.equal(value(columns, 'custom:capacity', { custom_fields: { capacity: 0 } }), 0);
  assert.equal(value(columns, 'custom:capacity', { custom_fields: { capacity: 'bad' } }), null);
  assert.equal(value(columns, 'custom:certified', { custom_fields: { certified: false } }), 'No');
  assert.equal(formatSettingsValue([0, false]), '0, No');
});

const field = (field_key, extra = {}) => ({ id: 1, entity_type: 'team_member', field_key, label: field_key,
  data_type: 'string', display_order: 0, is_visible_in_list: true, surfaces: { disp: true }, ...extra });

test('schema overlays update native labels, visibility and order without duplicating native fields', () => {
  const schema = [
    field('name', { id: 1, label: 'Driver name', display_order: 3 }),
    field('email', { id: 2, label: 'Contact email', display_order: 1 }),
    field('phone_number', { id: 3, is_visible_in_list: false }),
    field('skills', { id: 4, data_type: 'select', label: 'Qualifications', display_order: 2 }),
    field('badge', { id: 5, label: 'Badge number', display_order: 4 }),
    field('badge', { id: 6, label: 'Duplicate', display_order: 5 }),
  ];
  const columns = resolveSettingsColumns(createTeamSettingsColumns(), schema);
  assert.equal(columns.filter(column => column.colId === 'name').length, 1);
  assert.equal(columns.find(column => column.colId === 'name').headerName, 'Driver name');
  assert.equal(columns.find(column => column.colId === 'skills').headerName, 'Qualifications');
  assert.equal(columns.filter(column => column.colId === 'custom:badge').length, 1);
  assert.equal(columns.some(column => column.colId === 'phone_number'), false);
  assert.ok(columns.findIndex(column => column.colId === 'email') < columns.findIndex(column => column.colId === 'name'));
  const skillColumn = columns.find(column => column.colId === 'skills');
  assert.equal(skillColumn.filterParams.textMatcher({ value: skillColumn.filterValueGetter({ data: { skills: ['Class 10'] } }), filterOption: 'equals', filterText: 'Class 1' }), false);
});

test('new template fields replace removed custom columns and expose type-appropriate filters', () => {
  const base = createTeamSettingsColumns();
  const first = resolveSettingsColumns(base, [field('badge')]);
  assert.ok(first.some(column => column.colId === 'custom:badge'));
  const second = resolveSettingsColumns(base, [field('expiry', { data_type: 'date' }), field('rating', { id: 2, data_type: 'number', display_order: 1 })]);
  assert.equal(second.some(column => column.colId === 'custom:badge'), false);
  assert.equal(second.find(column => column.colId === 'custom:expiry').filter, 'agDateColumnFilter');
  assert.equal(second.find(column => column.colId === 'custom:rating').filter, 'agNumberColumnFilter');
  assert.equal(value(second, 'custom:rating', { custom_fields: { rating: '0' } }), 0);
  assert.ok(value(second, 'custom:expiry', { custom_fields: { expiry: '2026-12-01' } }) instanceof Date);
});

test('native fields keep their real values while scalar type changes update the filter', () => {
  const columns = resolveSettingsColumns(createTeamSettingsColumns(), [field('external_identifier', { data_type: 'number' })]);
  assert.equal(columns.find(column => column.colId === 'external_identifier').filter, 'agNumberColumnFilter');
  assert.equal(value(columns, 'external_identifier', { external_identifier: '123', custom_fields: { external_identifier: 999 } }), 123);
  const custom = createSettingsCustomColumns([field('zero', { data_type: 'number' }), field('enabled', { id: 2, data_type: 'boolean' })]);
  assert.equal(value(custom, 'custom:zero', { zero: 0, custom_fields: { zero: 9 } }), 0);
  assert.equal(value(custom, 'custom:enabled', { custom_fields: { enabled: 'false' } }), 'No');
});

test('hiding structured base fields also hides their derived columns and respects local base preferences', () => {
  const vehicles = [{ id: 1, name: 'Van', load_constraints: [{ constraint_type: 'capacity', max_value: 8, unit: 'seats' }] }];
  const columns = resolveSettingsColumns(createVehicleSettingsColumns(vehicles), [field('load_constraints', { surfaces: { disp: false }, data_type: 'number' })]);
  assert.equal(columns.some(column => column.colId === 'load_constraints' || column.colId.startsWith('constraint:')), false);
  const depots = resolveSettingsColumns(createDepotSettingsColumns(), [field('address')], { hiddenFields: ['address'], surfaceOverrides: {} });
  assert.equal(depots.some(column => ['address', 'city', 'street', 'country', 'state', 'zip_code'].includes(column.colId)), false);
  const privateColumns = resolveSettingsColumns(createTeamSettingsColumns(), [field('private', { surfaces: { disp: false } })], { hiddenFields: [], surfaceOverrides: { private: { disp: true } } });
  assert.equal(privateColumns.some(column => column.colId === 'custom:private'), false);
});

test('date filters reject invalid calendar dates and retain local dates without timezone drift', () => {
  assert.equal(parseSettingsDate('2026-02-30'), null);
  assert.equal(parseSettingsDate('not a date'), null);
  assert.equal(parseSettingsDate(null), null);
  const date = parseSettingsDate('2028-02-29');
  assert.equal(date.getFullYear(), 2028);
  assert.equal(date.getMonth(), 1);
  assert.equal(date.getDate(), 29);
});

test('only removed or type-incompatible filters are cleared on schema refresh', () => {
  const columns = resolveSettingsColumns(createTeamSettingsColumns(), [field('rating', { data_type: 'number' })]);
  const filters = {
    name: { filterType: 'text', type: 'contains', filter: 'Sam' },
    'custom:rating': { filterType: 'text', type: 'equals', filter: '5' },
    'custom:removed': { filterType: 'number', type: 'greaterThan', filter: 10 },
  };
  assert.deepEqual(reconcileSettingsFilters(filters, columns), { name: filters.name });
  assert.equal(Object.keys(filters).length, 3);
});

test('browser preference parsing tolerates blocked or corrupt storage', () => {
  assert.deepEqual(readSettingsFieldPreferences({ getItem() { throw Error('Blocked'); } }, 'team_member'), { hiddenFields: [], surfaceOverrides: {} });
  assert.deepEqual(readSettingsFieldPreferences({ getItem() { return '{bad'; } }, 'team_member'), { hiddenFields: [], surfaceOverrides: {} });
  const preferences = readSettingsFieldPreferences({ getItem(key) { return key.includes('hidden') ? '["email",4]' : '{"phone_number":{"surfaces":{"disp":false}},"name":{"surfaces":{"disp":"bad"}}}'; } }, 'team_member');
  assert.deepEqual(preferences, { hiddenFields: ['email'], surfaceOverrides: { phone_number: { disp: false } } });
});
