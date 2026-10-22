const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
const compiled = ts.transpileModule(fs.readFileSync(`${__dirname}/../app/route/_components/FloatingUnassignedPanel.tsx`, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
}).outputText;

function setup() {
  const hooks = [];
  let cursor = 0, resized;
  const viewport = { innerWidth: 1000, innerHeight: 800, addEventListener: () => {}, removeEventListener: () => {} };
  const rect = { width: 280, height: 44 };
  const react = {
    useRef: initial => { const index = cursor++; return hooks[index] ||= { current: initial }; },
    useState: initial => {
      const index = cursor++;
      if (!(index in hooks)) hooks[index] = initial;
      return [hooks[index], next => { hooks[index] = typeof next === "function" ? next(hooks[index]) : next; }];
    },
    useEffect: callback => { const index = cursor++; if (!hooks[index]) { hooks[index] = true; callback(); } },
  };
  const exports = {};
  new Function("exports", "require", "window", "ResizeObserver", compiled)(exports, name => {
    if (name === "react") return react;
    if (name === "react/jsx-runtime") return { jsx: (type, props) => ({ type, props }) };
    throw new Error(name);
  }, viewport, class { constructor(callback) { resized = callback; } observe() {} disconnect() {} });
  const render = expanded => {
    cursor = 0;
    const view = exports.default({ expanded, children: "panel content" });
    view.props.ref.current = { getBoundingClientRect: () => rect };
    return view.props;
  };
  let captured = false;
  const handle = {
    closest: selector => selector === "[data-panel-drag-handle]" || selector === "button" ? handle : null,
    setPointerCapture: () => { captured = true; }, hasPointerCapture: () => captured,
    releasePointerCapture: () => { captured = false; },
  };
  const event = (x, y, type = "pointermove") => ({
    target: handle, pointerId: 1, isPrimary: true, button: 0, clientX: x, clientY: y, type, preventDefault() {},
  });
  return { render, event, rect, viewport, resize: () => resized() };
}

test("dragging moves the pill and suppresses the click that would open it", () => {
  const ctx = setup();
  let panel = ctx.render(false);
  panel.onPointerDown(ctx.event(900, 700, "pointerdown"));
  panel.onPointerMove(ctx.event(800, 600));
  panel.onPointerUp(ctx.event(800, 600, "pointerup"));
  panel = ctx.render(false);
  assert.deepEqual(panel.style, { right: 116, bottom: 116 });
  let stopped = false;
  panel.onClickCapture({ preventDefault() {}, stopPropagation() { stopped = true; } });
  assert.equal(stopped, true);
  stopped = false;
  panel.onClickCapture({ preventDefault() {}, stopPropagation() { stopped = true; } });
  assert.equal(stopped, false, "A later intentional click must still open the panel");
});

test("a small pointer movement remains a normal click", () => {
  const ctx = setup();
  const panel = ctx.render(false);
  panel.onPointerDown(ctx.event(900, 700, "pointerdown"));
  panel.onPointerMove(ctx.event(902, 702));
  panel.onPointerUp(ctx.event(902, 702, "pointerup"));
  panel.onClickCapture({ preventDefault() { assert.fail("Should remain a click"); }, stopPropagation() {} });
  assert.deepEqual(ctx.render(false).style, { right: 16, bottom: 16 });
});

test("drag bounds and expansion keep the panel visible", () => {
  const ctx = setup();
  const panel = ctx.render(false);
  panel.onPointerDown(ctx.event(900, 700, "pointerdown"));
  panel.onPointerMove(ctx.event(-900, -700));
  panel.onPointerUp(ctx.event(-900, -700, "pointerup"));
  assert.deepEqual(ctx.render(false).style, { right: 712, bottom: 748 });
  ctx.rect.width = 410;
  ctx.rect.height = 600;
  ctx.render(true);
  ctx.resize();
  assert.deepEqual(ctx.render(true).style, { right: 582, bottom: 192 });
  ctx.viewport.innerWidth = 500;
  ctx.viewport.innerHeight = 650;
  ctx.resize();
  assert.deepEqual(ctx.render(true).style, { right: 82, bottom: 42 });
});

test("cancelling a drag restores its position", () => {
  const ctx = setup();
  const panel = ctx.render(false);
  panel.onPointerDown(ctx.event(900, 700, "pointerdown"));
  panel.onPointerMove(ctx.event(800, 600));
  panel.onPointerCancel(ctx.event(800, 600, "pointercancel"));
  assert.deepEqual(ctx.render(false).style, { right: 16, bottom: 16 });
});

test("dragging a job card does not move its panel", () => {
  const ctx = setup();
  const panel = ctx.render(true);
  panel.onPointerDown({ ...ctx.event(900, 700, "pointerdown"), target: { closest: () => null } });
  panel.onPointerMove(ctx.event(800, 600));
  assert.deepEqual(ctx.render(true).style, { right: 16, bottom: 16 });
});
