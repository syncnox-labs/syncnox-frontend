const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

const layer = {};
let tooltipProps;
let layerProps;
const jsxRuntime = require("react/jsx-runtime");
function jsx(factory, type, props, key) {
  if (props?.["data-timeline-tooltip-layer"]) layerProps = props;
  return factory(type, props, key);
}
const compiled = ts.transpileModule(fs.readFileSync(path.join(__dirname,
  "../app/route/_components/TimelineTooltip.tsx"), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
}).outputText;
const component = {};
new Function("exports", "require", compiled)(component, name => {
  if (name === "react") return { ...React, useRef: () => ({ current: layer }) };
  if (name === "react/jsx-runtime") return { ...jsxRuntime,
    jsx: (...args) => jsx(jsxRuntime.jsx, ...args), jsxs: (...args) => jsx(jsxRuntime.jsxs, ...args) };
  if (name === "antd") return { Tooltip: props => { tooltipProps = props; return props.children; } };
  return require(name);
});

function render(props = {}) {
  renderToStaticMarkup(React.createElement(component.TimelineTooltipProvider, { leftInset: 265, topInset: 40 },
    React.createElement(component.default, { title: "Working at client · 522 min", ...props }, React.createElement("div"))));
  return tooltipProps;
}

test("popups use a viewport layer excluding the driver column and timeline header", () => {
  const props = render();
  assert.equal(props.getPopupContainer({}), layer);
  assert.equal(layerProps.style.left, 265);
  assert.equal(layerProps.style.top, 40);
  assert.equal(layerProps.style.right, 0);
  assert.equal(layerProps.style.bottom, 0);
  assert.equal(layerProps.style.overflow, "hidden");
  assert.equal(layerProps.style.containerType, "size");
  assert.equal(layerProps.style.pointerEvents, "none");
  assert.equal(props.align.htmlRegion, "visible");
  assert.deepEqual(props.align.overflow, { adjustX: true, adjustY: true, shiftX: true, shiftY: true });
});

test("large stop popups scroll within the viewport and retain their content and controlled state", () => {
  const onOpenChange = () => {};
  const props = render({ open: true, onOpenChange, overlayStyle: { maxWidth: "none" },
    overlayInnerStyle: { padding: 10, pointerEvents: "auto" },
    styles: () => ({ container: { color: "blue", maxHeight: "none" } }) });
  const styles = props.styles({});
  assert.equal(props.open, true);
  assert.equal(props.onOpenChange, onOpenChange);
  assert.equal(styles.root.maxWidth, "min(350px, calc(100cqw - 16px))");
  assert.equal(styles.container.maxHeight, "calc(100cqh - 32px)");
  assert.equal(styles.container.overflow, "auto");
  assert.equal(styles.container.color, "blue");
  assert.equal(styles.container.padding, 10);
  assert.equal(styles.root.pointerEvents, "auto");
});

// Exercise the installed popup alignment engine with measured DOM rectangles,
// including a long bar whose midpoint is outside the visible timeline.
async function alignPopup(targetRect, bounds, align) {
  const originalBody = global.HTMLBodyElement;
  const originalHtml = global.HTMLHtmlElement;
  global.HTMLBodyElement = class {};
  global.HTMLHtmlElement = class {};
  try {
    let result;
    const rect = (x, y, width, height) => ({ x, y, left: x, top: y, right: x + width, bottom: y + height, width, height });
    const doc = { documentElement: { clientWidth: 1920, clientHeight: 900,
      scrollWidth: 1920, scrollHeight: 900, scrollLeft: 0, scrollTop: 0 }, createElement: () => ({ style: {} }) };
    const host = { ownerDocument: doc, parentElement: null, appendChild() {}, removeChild() {},
      offsetWidth: bounds.width, clientWidth: bounds.width, offsetHeight: bounds.height, clientHeight: bounds.height,
      getBoundingClientRect: () => bounds };
    const popup = { ownerDocument: doc, parentElement: host, style: {}, offsetLeft: 0, offsetTop: 0,
      offsetWidth: 300, offsetHeight: 80,
      getBoundingClientRect: () => rect(popup.style.right === "0" ? bounds.right - 300 : bounds.left,
        popup.style.bottom === "0" ? bounds.bottom - 80 : bounds.top, 300, 80) };
    doc.defaultView = { getComputedStyle: element => element === popup
      ? { position: "absolute", width: "300px", height: "80px" }
      : { overflow: "hidden", borderTopWidth: "0", borderBottomWidth: "0", borderLeftWidth: "0", borderRightWidth: "0" } };
    const hookPath = require.resolve("@rc-component/trigger/lib/hooks/useAlign");
    const hooks = {};
    new Function("exports", "require", fs.readFileSync(hookPath, "utf8"))(hooks, name => {
      if (name === "react") return { useRef: value => ({ current: value }), useMemo: fn => fn(),
        useState: value => [value, next => { result = next; }] };
      if (name.endsWith("/useEvent")) return fn => fn;
      if (name.endsWith("/useLayoutEffect")) return () => {};
      if (name.endsWith("/findDOMNode")) return { isDOM: () => false };
      if (name.endsWith("/isVisible")) return () => true;
      if (name === "../util") return require("@rc-component/trigger/lib/util");
      return require(name);
    });
    const target = { getBoundingClientRect: () => targetRect };
    const values = hooks.default(true, popup, target, "top", { top: { points: ["bc", "tc"], offset: [0, -8] } }, align);
    values[10]();
    await Promise.resolve();
    assert.ok(result?.ready);
    return rect(bounds.left + result.offsetX, bounds.top + result.offsetY, 300, 80);
  } finally {
    global.HTMLBodyElement = originalBody;
    global.HTMLHtmlElement = originalHtml;
  }
}

test("long working bars and edge stops align fully inside the visible timeline", async () => {
  const { align } = render();
  const bounds = { x: 570, y: 450, left: 570, top: 450, right: 1905, bottom: 875, width: 1335, height: 425 };
  for (const target of [
    { x: -3000, y: 680, width: 5000, height: 8 },
    { x: 575, y: 452, width: 32, height: 38 },
    { x: 1870, y: 830, width: 32, height: 38 },
  ]) {
    const popup = await alignPopup(target, bounds, align);
    assert.ok(popup.left >= bounds.left && popup.right <= bounds.right, JSON.stringify(popup));
    assert.ok(popup.top >= bounds.top && popup.bottom <= bounds.bottom, JSON.stringify(popup));
  }
});

test("a short timeline still keeps a popup inside its vertical bounds", async () => {
  const { align } = render();
  const bounds = { x: 570, y: 450, left: 570, top: 450, right: 1905, bottom: 560, width: 1335, height: 110 };
  const popup = await alignPopup({ x: 1000, y: 490, width: 32, height: 10 }, bounds, align);
  assert.ok(popup.top >= bounds.top && popup.bottom <= bounds.bottom, JSON.stringify(popup));
});

test("stop cards escape the timeline layer and use browser bounds above map and timeline", () => {
  const props = render({ popupScope: "viewport", open: true, overlayInnerStyle: { padding: 10 } });
  const body = {};
  assert.equal(props.getPopupContainer({ ownerDocument: { body } }), body);
  assert.equal(props.placement, "top");
  assert.equal(props.zIndex, 1000);
  assert.equal(props.open, true);
  const styles = props.styles({});
  assert.equal(styles.root.maxWidth, "min(400px, calc(100vw - 16px))");
  assert.equal(styles.container.maxHeight, "calc(100dvh - 32px)");
  assert.equal(styles.container.overflow, "auto");
  assert.equal(styles.container.padding, 10);
  assert.equal(styles.root.pointerEvents, "auto");
});
