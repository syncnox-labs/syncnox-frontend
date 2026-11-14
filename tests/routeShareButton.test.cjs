const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const { Dropdown, Tooltip } = require("antd");

const source = fs.readFileSync(path.join(__dirname, "../app/route/_components/RouteShareButton.tsx"), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
} }).outputText;
const loaded = {};
new Function("exports", "require", compiled)(loaded, require);

test("share menu opens by hover or click and runs only the selected action", () => {
  const calls = [];
  const props = { showWhatsApp: true, isSharing: false, shareDisabled: false, shareLabel: "Share again",
    onShare: () => calls.push("drivers"), onWhatsApp: () => calls.push("whatsapp") };
  const dropdown = loaded.default(props);
  assert.equal(dropdown.type, Dropdown);
  assert.deepEqual(dropdown.props.trigger, ["hover", "click"]);
  const [drivers, whatsapp] = dropdown.props.menu.items;
  assert.equal(drivers.label, "Share to drivers");
  assert.equal(whatsapp.label, "Send WhatsApp");
  assert.deepEqual(calls, []);
  whatsapp.onClick(); drivers.onClick();
  assert.deepEqual(calls, ["whatsapp", "drivers"]);
  const busy = loaded.default({ ...props, isSharing: true });
  assert.equal(busy.props.menu.items[0].disabled, true);
  assert.notEqual(busy.props.menu.items[1].disabled, true);
  assert.equal(loaded.default({ ...props, shareDisabled: true }).props.menu.items[0].disabled, true);
});

test("plans without WhatsApp retain the direct driver share button", () => {
  let calls = 0;
  const tooltip = loaded.default({ showWhatsApp: false, isSharing: false, shareDisabled: false,
    shareLabel: "Share changes", onShare: () => calls++, onWhatsApp: () => assert.fail("WhatsApp unavailable") });
  assert.equal(tooltip.type, Tooltip);
  assert.equal(tooltip.props.children.props.children.props.children, "Share changes");
  tooltip.props.children.props.onClick();
  assert.equal(calls, 1);
});
