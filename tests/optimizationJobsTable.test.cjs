const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const source = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../app/route/_components/AssignedJobsTable.tsx'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
}).outputText;

for (const filter of ['assigned', 'unassigned']) test(`optimization table shows ${filter} rows and accurate assignment labels`, () => {
  let tableProps;
  const exports = {};
  new Function('exports', 'require', source)(exports, name => {
    if (name === 'react') return { ...React, useState: initial => React.useState(initial === 'assigned' ? filter : initial) };
    if (name === '@/apis/custom-fields.api') return {};
    if (name === '@/utils/jobs.utils') return { STANDARD_JOB_FIELD_KEYS: new Set(), createJobTableColumns: () => [{ field: 'status' }] };
    if (name === '@/components/Table/BaseTable') return { __esModule: true, default: props => { tableProps = props; return null; } };
    return require(name);
  });
  const html = renderToStaticMarkup(React.createElement(exports.default, {
    jobs: [{ id: 1, status: 'assigned' }], unassignedJobs: [{ id: 2, status: 'draft' }],
    loading: false, error: null, templateType: 'worker_shuttle', teamsMap: {}, onOpenJob() {}, driverFilter: '', onClearDriverFilter() {},
  }));
  assert.deepEqual(tableProps.rowData.map(row => row.id), filter === 'assigned' ? [1] : [2]);
  for (const label of ['Assigned (1)', 'Unassigned (1)']) assert.ok(html.includes(label));
  assert.doesNotMatch(html, /All \(/);
  assert.match(html, /ant-radio-button-wrapper/);
  assert.match(html, /ant-radio-group-solid/);
  const status = tableProps.columnDefs[0];
  assert.equal(status.headerName, 'Assignment');
  assert.equal(status.valueGetter({ data: { id: 1 } }), 'Assigned');
  assert.equal(status.valueGetter({ data: { id: 2 } }), 'Unassigned');
  assert.match(renderToStaticMarkup(status.cellRenderer({ data: { id: 2 } })), /Unassigned/);
});
