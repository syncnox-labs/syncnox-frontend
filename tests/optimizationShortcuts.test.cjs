const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const source = fs.readFileSync(path.join(__dirname, "../app/route/_components/optimizationShortcuts.utils.ts"), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const helpers = {};
new Function("exports", compiled)(helpers);
const { installMapSearchShortcut, nextTimelineInterval, timelineZoomAnchor, timelineZoomScrollLeft } = helpers;

class FakeElement {
  constructor({ editable = false, visible = true } = {}) {
    this.editable = editable;
    this.visible = visible;
  }
  closest() { return this.editable ? this : null; }
  getClientRects() { return this.visible ? [{}] : []; }
}
global.Element = FakeElement;

function shortcutSetup() {
  let listener;
  let opened = 0;
  const input = new FakeElement({ editable: true });
  const doc = {
    dialogs: [],
    querySelectorAll() { return this.dialogs; },
    addEventListener(name, fn) { assert.equal(name, "keydown"); listener = fn; },
    removeEventListener(name, fn) { assert.equal(name, "keydown"); assert.equal(fn, listener); listener = undefined; },
  };
  const cleanup = installMapSearchShortcut({ ownerDocument: doc, contains: node => node === input }, () => opened++);
  return {
    doc, input, cleanup,
    get opened() { return opened; },
    get installed() { return Boolean(listener); },
    fire(overrides = {}) {
      const event = {
        key: "f", ctrlKey: true, metaKey: false, target: new FakeElement(), defaultPrevented: false,
        preventDefault() { this.defaultPrevented = true; }, ...overrides,
      };
      listener?.(event);
      return event;
    },
  };
}

test("Ctrl+F and Cmd+F open map search, repeated shortcuts refocus it, and cleanup restores browser find", () => {
  const setup = shortcutSetup();
  assert.equal(setup.fire().defaultPrevented, true);
  assert.equal(setup.fire({ ctrlKey: false, metaKey: true, key: "F" }).defaultPrevented, true);
  assert.equal(setup.fire({ target: setup.input }).defaultPrevented, true);
  assert.equal(setup.opened, 3);
  setup.cleanup();
  assert.equal(setup.installed, false);
  assert.equal(setup.fire().defaultPrevented, false);
});

test("browser find remains available while editing other fields, in dialogs, and for other key combinations", () => {
  const setup = shortcutSetup();
  for (const overrides of [
    { target: new FakeElement({ editable: true }) },
    { ctrlKey: false }, { altKey: true }, { shiftKey: true },
    { isComposing: true }, { key: "g" }, { defaultPrevented: true },
  ]) {
    const event = setup.fire(overrides);
    assert.equal(event.defaultPrevented, Boolean(overrides.defaultPrevented));
  }
  setup.doc.dialogs = [new FakeElement()];
  assert.equal(setup.fire().defaultPrevented, false);
  assert.equal(setup.opened, 0);
  setup.doc.dialogs[0].visible = false;
  assert.equal(setup.fire().defaultPrevented, true, "a hidden mounted dialog must not disable search");
  setup.cleanup();
});

test("wheel zoom visits the dropdown's levels in both directions and clamps at each limit", () => {
  let interval = 60;
  const levels = [interval];
  for (let step = 0; step < 6; step++) levels.push(interval = nextTimelineInterval(interval, -100));
  assert.deepEqual(levels, [60, 30, 25, 20, 15, 10, 5]);
  assert.equal(nextTimelineInterval(5, -100), 5);
  for (let step = 0; step < 6; step++) interval = nextTimelineInterval(interval, 100);
  assert.equal(interval, 60);
  assert.equal(nextTimelineInterval(60, 100), 60);
  for (const delta of [0, NaN, Infinity]) assert.equal(nextTimelineInterval(30, delta), 30);
});

test("zoom keeps the same minute beneath the pointer while preserving the scroll origin", () => {
  const anchor = timelineZoomAnchor(960, 240, 4);
  assert.equal(anchor.minute, 300);
  for (const scale of [3, 4, 4.5, 5, 6, 8, 12]) {
    const scrollLeft = timelineZoomScrollLeft(anchor, scale);
    assert.equal((scrollLeft + 240) / scale, 300);
  }
  assert.equal(timelineZoomScrollLeft(timelineZoomAnchor(0, 240, 12), 3), 0);
});
