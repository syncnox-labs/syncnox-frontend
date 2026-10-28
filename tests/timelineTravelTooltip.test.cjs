const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

function load(file, imports = {}) {
  const compiled = ts.transpileModule(fs.readFileSync(path.join(__dirname, "..", file), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const exports = {};
  new Function("exports", "require", compiled)(exports, name => name in imports ? imports[name] : require(name));
  return exports;
}

const { getTimelineSegment } = load("app/route/_components/timelineSegment.utils.ts");
let tooltips = [];
const timelineTooltip = load("app/route/_components/TimelineTooltip.tsx", {
  antd: { Tooltip: ({ title, children }) => {
    tooltips.push({ text: renderToStaticMarkup(title), target: children });
    return children;
  } },
});
const Segment = load("app/route/_components/TimelineTravelSegment.tsx", { "./TimelineTooltip": timelineTooltip }).default;

function render(metrics, props = {}, minutes = 41) {
  tooltips = [];
  const start = { arrival_time: "2026-09-29T15:00:00", service_duration_seconds: 0, ...metrics };
  const next = { arrival_time: `2026-09-29T15:${String(minutes).padStart(2, "0")}:00` };
  renderToStaticMarkup(React.createElement(Segment, {
    segment: getTimelineSegment(start, next), left: 100, width: minutes * 4, pixelsPerMinute: 4,
    routeColor: "#8c564b", vehicleName: "VAN 5", vehicleCapacity: 14, ...props,
  }));
  return tooltips;
}

test("the 24-minute drive and 17-minute wait have separate tooltip content and adjacent hover targets", () => {
  const [travel, waiting] = render({ travel_time_to_next_stop_seconds: 1440, waiting_time_to_next_stop_seconds: 1020, distance_to_next_stop_meters: 21330 });
  assert.equal(tooltips.length, 2);
  assert.match(travel.text, /Travel: 24 min/);
  assert.match(travel.text, /21\.33 km/);
  assert.doesNotMatch(travel.text, /Waiting|41 min|elapsed/);
  assert.match(waiting.text, /Waiting: 17 min/);
  assert.doesNotMatch(waiting.text, /Travel:|21\.33 km|elapsed/);
  assert.equal(travel.target.props["aria-label"], "Travel time and distance");
  assert.equal(waiting.target.props["aria-label"], "Waiting time");
  assert.equal(travel.target.props.style.left, 100);
  assert.equal(travel.target.props.style.width, 96);
  assert.equal(waiting.target.props.style.left, 196);
  assert.equal(waiting.target.props.style.width, 68);
  assert.equal(travel.target.props.children, undefined, "The wait tooltip must not be nested in the travel hover target");
});

test("stationary waiting has a waiting tooltip without travel or distance", () => {
  const [waiting] = render({ travel_time_to_next_stop_seconds: 0, waiting_time_to_next_stop_seconds: 2460, distance_to_next_stop_meters: 0 });
  assert.equal(tooltips.length, 1);
  assert.match(waiting.text, /Waiting: 41 min/);
  assert.doesNotMatch(waiting.text, /Travel|Same location|km/);
  assert.equal(waiting.target.props.style.width, 164);
});

test("a drive without waiting has one full-width travel tooltip", () => {
  const [travel] = render({ travel_time_to_next_stop_seconds: 2460, waiting_time_to_next_stop_seconds: 0, distance_to_next_stop_meters: 21330 });
  assert.equal(tooltips.length, 1);
  assert.match(travel.text, /Travel: 41 min/);
  assert.doesNotMatch(travel.text, /Waiting/);
  assert.equal(travel.target.props.style.width, 164);
});

test("unknown routing metrics remain unknown rather than being labelled as waiting", () => {
  const [travel] = render({});
  assert.equal(tooltips.length, 1);
  assert.match(travel.text, /Travel time unavailable/);
  assert.match(travel.text, /Distance unavailable/);
  assert.doesNotMatch(travel.text, /Waiting|Travel: 41/);
});

test("boarding followed by stationary waiting keeps the waiting tooltip separate", () => {
  const [boarding, waiting] = render({ travel_time_to_next_stop_seconds: 0, service_duration_seconds: 300,
    waiting_time_to_next_stop_seconds: 2160, distance_to_next_stop_meters: 0 });
  assert.equal(tooltips.length, 2);
  assert.match(boarding.text, /Boarding \/ alighting: 5 min/);
  assert.doesNotMatch(boarding.text, /Waiting/);
  assert.match(waiting.text, /Waiting: 36 min/);
  assert.doesNotMatch(waiting.text, /Boarding|Travel/);
});

test("dragging disables both hover targets and dimming applies to both parts", () => {
  const parts = render({ travel_time_to_next_stop_seconds: 1440, waiting_time_to_next_stop_seconds: 1020 }, { isDragging: true, isDimmed: true });
  for (const part of parts) {
    assert.equal(part.target.props.style.pointerEvents, "none");
    assert.equal(part.target.props.style.opacity, 0.15);
  }
});

test("merging waiting left moves its bar before the drive", () => {
  const [travel, waiting] = render({ travel_time_to_next_stop_seconds: 1440,
    waiting_time_to_next_stop_seconds: 1020, waiting_position: "left" });
  assert.equal(waiting.target.props.style.left, 100);
  assert.equal(waiting.target.props.style.width, 68);
  assert.equal(travel.target.props.style.left, 168);
  assert.equal(travel.target.props.style.width, 96);
});

test("left waiting starts after alighting and before driving", () => {
  const parts = render({ travel_time_to_next_stop_seconds: 1440, service_duration_seconds: 300,
    waiting_time_to_next_stop_seconds: 720, waiting_position: "left" });
  const boarding = parts.find(part => part.target.props["aria-label"] === "Boarding / alighting time");
  const travel = parts.find(part => part.target.props["aria-label"] === "Travel time and distance");
  const waiting = parts.find(part => part.target.props["aria-label"] === "Waiting time");
  assert.equal(boarding.target.props.style.left, 100);
  assert.equal(boarding.target.props.style.width, 20);
  assert.equal(waiting.target.props.style.left, 120);
  assert.equal(waiting.target.props.style.width, 48);
  assert.equal(travel.target.props.style.left, 168);
  assert.equal(travel.target.props.style.width, 96);
});

test("waiting can be edited by click or keyboard and dragging disables editing", () => {
  let edits = 0;
  const parts = render({ travel_time_to_next_stop_seconds: 1440, waiting_time_to_next_stop_seconds: 1020 },
    { onEditWaiting: () => edits++ });
  for (const part of parts) {
    assert.equal(part.target.props.role, "button");
    assert.equal(part.target.props.tabIndex, 0);
    part.target.props.onClick({ stopPropagation() {} });
    part.target.props.onKeyDown({ key: "Enter", preventDefault() {}, stopPropagation() {} });
  }
  assert.equal(edits, 4);
  const dragging = render({ travel_time_to_next_stop_seconds: 1440, waiting_time_to_next_stop_seconds: 1020 },
    { onEditWaiting: () => edits++, isDragging: true });
  assert.ok(dragging.every(part => part.target.props.onClick === undefined));
});
