const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

function load(name, imports = {}) {
  const source = fs.readFileSync(path.join(__dirname, "../app/route/_components", name), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const exports = {};
  new Function("exports", "require", compiled)(exports, name => {
    assert.ok(name in imports, `Unexpected dependency: ${name}`);
    return imports[name];
  });
  return exports;
}

const helpers = load("leaderRoute.utils.ts");
const { isRedundantLeaderClientStart } = helpers;
const { generateMapMarkers } = load("optimizationView.utils.ts", {
  "./stopDisplay.utils": load("stopDisplay.utils.ts", { "./leaderRoute.utils": helpers }),
  "@/utils/app.utils": { formatTime12h: value => value },
  "@/utils/googleMaps.utils": { decodePolyline: () => [] },
  "@/utils/timeline.utils": { getRouteColor: () => "#123456" },
});

function savedLeaderRoute() {
  const depot = { latitude: 45.5756698, longitude: -73.7421057 };
  const client = { latitude: 45.7679916, longitude: -74.0234335 };
  const pickup = { latitude: 45.558379, longitude: -73.721533 };
  return { is_team_leader: true, stops: [
    { ...depot, leg: "GO", stop_type: "depot_start" },
    { ...pickup, leg: "GO", stop_type: "pickup", job_id: 1 },
    { ...client, leg: "GO", stop_type: "dropoff", job_id: 1, segment_type_to_next: "team_leader_work" },
    { ...client, leg: "RETURN", stop_type: "depot_start", address_formatted: "Previous GO trip end" },
    { ...client, leg: "RETURN", stop_type: "pickup", job_id: 2 },
    { ...pickup, leg: "RETURN", stop_type: "dropoff", job_id: 2 },
    { ...depot, leg: "RETURN", stop_type: "depot_end" },
  ] };
}

test("saved leader RETURN starts at client pickup, with only the true depot endpoints", () => {
  const route = savedLeaderRoute();
  const before = structuredClone(route);
  const visible = route.stops.filter((_, index) => !isRedundantLeaderClientStart(route, index));
  assert.equal(visible.filter(stop => stop.stop_type === "depot_start").length, 1);
  assert.equal(visible.find(stop => stop.leg === "RETURN").stop_type, "pickup");
  assert.equal(visible.at(-1).stop_type, "depot_end");
  assert.equal(visible[2].segment_type_to_next, "team_leader_work");
  assert.deepEqual(route, before);
});

test("map hides the synthetic marker and retains server indices for all passenger clicks", () => {
  const route = savedLeaderRoute();
  const markers = generateMapMarkers({ result: { routes: [route] } }, []);
  assert.deepEqual(markers.map(marker => marker.id), ["0-0", "0-1", "0-2", "0-4", "0-5", "0-6"]);
  assert.equal(markers.find(marker => marker.id === "0-4").jobData.id, 2);
  assert.equal(markers.filter(marker => marker.depotKind === "start").length, 1);
  assert.equal(markers.filter(marker => marker.depotKind === "end").length, 1);
});

test("ordinary driver origins and real depots stay intact", () => {
  const route = savedLeaderRoute();
  route.is_team_leader = false;
  assert.equal(isRedundantLeaderClientStart(route, 3), false);
  assert.equal(generateMapMarkers({ result: { routes: [route] } }, []).length, 7);
  route.is_team_leader = true;
  route.stops[3].address_formatted = "Actual depot";
  assert.equal(isRedundantLeaderClientStart(route, 3), false);
  assert.equal(isRedundantLeaderClientStart(route, 0), false);
  assert.equal(isRedundantLeaderClientStart(route, 6), false);
});

test("real positioning travel or missing coordinates are never silently hidden", () => {
  const route = savedLeaderRoute();
  route.stops[4].latitude = 45.5;
  assert.equal(isRedundantLeaderClientStart(route, 3), false);
  route.stops[4].latitude = route.stops[3].latitude;
  route.stops[3].longitude = undefined;
  assert.equal(isRedundantLeaderClientStart(route, 3), false);
});
