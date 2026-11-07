const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

const source = fs.readFileSync(path.join(__dirname, "../app/route/_components/TimelineStopArrow.tsx"), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
}).outputText;
const loaded = {};
new Function("exports", "require", compiled)(loaded, require);

const props = { isPickup: true, displayIndex: 3, routeColor: "#5544aa", left: 100 };

test("a mixed visit uses one numbered SVG with both arrowheads", () => {
  const html = renderToStaticMarkup(React.createElement(loaded.default, { ...props, isMixed: true }));
  assert.equal((html.match(/<svg/g) || []).length, 1);
  assert.equal((html.match(/<path/g) || []).length, 1);
  assert.equal((html.match(/<text/g) || []).length, 1);
  assert.match(html, />3<\/text>/);
  assert.match(html, /d="M 16 2 .* L 16 36 /, "one outline contains the top and bottom tips");
  assert.match(html, /fill="#ffffff" stroke="#5544aa"/);
  assert.doesNotMatch(html, /isMixed=/, "presentation props do not leak onto the DOM");
});

test("single-activity arrows retain their shapes and mixed visits retain editing styles", () => {
  const pickup = renderToStaticMarkup(React.createElement(loaded.default, props));
  const dropoff = renderToStaticMarkup(React.createElement(loaded.default, { ...props, isPickup: false }));
  assert.match(pickup, /d="M 16 2 /);
  assert.doesNotMatch(pickup, / L 16 36 /);
  assert.match(dropoff, /d="M 6 2 .* L 16 36 /);
  const selected = renderToStaticMarkup(React.createElement(loaded.StopArrowSvg, {
    ...props, isMixed: true, fill: "white", stroke: "#5544aa", textColor: "#5544aa", strokeWidth: 2.5,
  }));
  assert.match(selected, /stroke-width="2.5"/);
  const pending = renderToStaticMarkup(React.createElement(loaded.default, {
    ...props, isMixed: true, isGroupPendingDelete: true,
  }));
  assert.match(pending, /fill="#fee2e2" stroke="#ef4444"/);
  assert.match(pending, /stroke-dasharray="3 3"/);
});
