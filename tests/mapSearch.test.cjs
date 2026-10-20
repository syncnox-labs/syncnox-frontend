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
const stopDisplay = load("stopDisplay.utils.ts", { "./leaderRoute.utils": load("leaderRoute.utils.ts") });
const helpers = load("mapSearch.utils.ts", { "./stopDisplay.utils": stopDisplay });
const { generateMapMarkers } = load("optimizationView.utils.ts", {
  "./stopDisplay.utils": stopDisplay,
  "@/utils/app.utils": { formatTime12h: value => value },
  "@/utils/googleMaps.utils": { decodePolyline: () => [] },
  "@/utils/timeline.utils": { getRouteColor: () => "#123456" },
});
const { buildMapSearchIndex, filterMapSearchResults } = helpers;

const fields = {
  candidate_name: "Jane Example",
  candidate_phone: "+1 (514) 555-0123",
  candidate_id: "CAND-7107",
  quant_id: "SHIFT-88360",
  quart_id: "QUART-99360",
  pick_up_address: "100 Rue Émile",
  drop_off_address: "200 Client Avenue",
  candidate_address: "300 Candidate Road",
  client_address: "400 Workplace Boulevard",
};

function route(jobId = 8451) {
  return {
    team_member_name: "Driver Example", leg: "GO",
    stops: [
      { stop_type: "depot_start" },
      { job_id: jobId, stop_type: "pickup", address_formatted: "500 Meeting Point", latitude: 45.5, longitude: -73.5 },
      { job_id: jobId, stop_type: "dropoff", address_formatted: "200 Client Avenue", latitude: 45.6, longitude: -73.6 },
      { stop_type: "depot_end" },
    ],
  };
}

for (const source of ["flat", "worker_shuttle_detail", "custom_fields"]) {
  test(`all requested fields are searchable from ${source} job data`, () => {
    const job = { id: 8451, ...(source === "flat" ? fields : { [source]: fields }) };
    const index = buildMapSearchIndex([route()], [job]);
    for (const query of [
      "jane example", "rue emile", "client avenue", "candidate road", "workplace boulevard",
      "SHIFT-88360", "QUART-99360", "8451", "CAND-7107", "5145550123", "(514) 555-0123",
    ]) {
      assert.equal(filterMapSearchResults(index, query).length, 2, `Missing match for ${query}`);
    }
    assert.equal(index[0].candidateId, "CAND-7107");
    assert.equal(index[0].shiftRef, "SHIFT-88360");
    assert.equal(index[0].pickupAddress, "100 Rue Émile");
    assert.equal(index[0].dropoffAddress, "200 Client Avenue");
  });
}

test("job ID remains searchable independently of candidate ID and shift reference", () => {
  const index = buildMapSearchIndex([route()], [{ id: 8451, ...fields }]);
  for (const query of ["8451", "7107", "88360"]) {
    assert.equal(filterMapSearchResults(index, query)[0].jobId, "8451");
  }
});

test("embedded job and stop-only details work before full jobs are loaded", () => {
  const embedded = route();
  embedded.stops[1].job = { id: 8451, worker_shuttle_detail: fields };
  assert.equal(filterMapSearchResults(buildMapSearchIndex([embedded], []), "88360").length, 1);
  const stopOnly = route();
  Object.assign(stopOnly.stops[1], fields);
  const index = buildMapSearchIndex([stopOnly], []);
  assert.equal(filterMapSearchResults(index, "Jane").length, 1);
  assert.equal(filterMapSearchResults(index, "Meeting Point").length, 1);
});

test("result selection retains original route, stop, job, and map coordinates", () => {
  const selectedRoute = route();
  const job = { id: 8451, ...fields };
  const index = buildMapSearchIndex([{ stops: [] }, selectedRoute], [job]);
  const result = filterMapSearchResults(index, "88360")[0];
  assert.equal(result.routeIndex, 1);
  assert.equal(result.stopIndex, 1);
  assert.equal(result.displayStopNumber, 1);
  assert.equal(result.stop, selectedRoute.stops[1]);
  assert.equal(result.job, job);
  assert.equal(result.stop.latitude, 45.5);
  assert.equal(index.length, 2);
});

test("empty and unmatched searches return no results and valid results stay capped", () => {
  const index = buildMapSearchIndex([route()], [{ id: 8451, ...fields }]);
  for (const query of ["", "   ", "missing candidate", "99999999999"]) {
    assert.deepEqual(filterMapSearchResults(index, query), []);
  }
  assert.equal(filterMapSearchResults(Array(50).fill(index[0]), "Jane").length, 40);
});

test("numeric references, including zero, are preserved", () => {
  const index = buildMapSearchIndex([route()], [{ id: 8451, candidate_id: 0, quant_id: 88360 }]);
  assert.equal(index[0].candidateId, "0");
  assert.equal(index[0].shiftRef, "88360");
});

test("search uses the timeline visit number instead of counting individual passengers", () => {
  const first = { stop_type: "pickup", latitude: 45.5, longitude: -73.5, arrival_time: "2026-09-29T15:00:00" };
  const stops = [{ stop_type: "depot_start" },
    ...[1, 2, 3].map(job_id => ({ ...first, job_id })),
    ...Array.from({ length: 19 }, (_, index) => ({ ...first, job_id: 10 + index,
      latitude: 45.6 + index / 100, arrival_time: `2026-09-29T16:${String(index).padStart(2, "0")}:00` })),
    { ...first, job_id: 42, stop_type: "dropoff", latitude: 45.9, arrival_time: "2026-09-29T16:37:00" },
    { stop_type: "depot_end" }];
  const selectedRoute = { team_member_name: "Alliance Driver 13", stops };
  const before = structuredClone(stops);
  const index = buildMapSearchIndex([selectedRoute], [{ id: 42, candidate_name: "Paula Plata" }]);
  const [result] = filterMapSearchResults(index, "Paula Plata");
  assert.equal(result.stopIndex, 23, "raw server index is retained for the passenger");
  assert.equal(result.displayStopNumber, 21, "only physical visits get timeline numbers");
  const markers = generateMapMarkers({ result: { routes: [selectedRoute] } }, []);
  const marker = markers.find(marker => marker.id === result.markerId);
  assert.equal(marker.sequenceNumber, result.displayStopNumber);
  assert.equal(marker.label.text, "21");
  assert.equal(stopDisplay.getRouteStopDisplay(selectedRoute).byRawIndex.get(23).displayStopNumber, 21);
  assert.deepEqual(stops, before, "presentation must not modify routing or raw indices");
});

test("a search for another passenger in a shared stop targets the existing group marker", () => {
  const selectedRoute = route();
  selectedRoute.stops[1].arrival_time = "2026-09-29T08:00:00";
  selectedRoute.stops.splice(2, 0, { ...selectedRoute.stops[1], job_id: 42 });
  const job = { id: 42, candidate_name: "Paula Plata" };
  const [result] = filterMapSearchResults(buildMapSearchIndex([selectedRoute], [job]), "Paula");
  assert.equal(result.stopIndex, 2);
  assert.equal(result.displayStopNumber, 1);
  assert.equal(result.markerId, "0-1", "the second passenger has no separate map marker");
  assert.equal(result.job, job, "keep the searched passenger, not the group's first passenger");
  assert.equal(result.stop, selectedRoute.stops[2]);
  const marker = generateMapMarkers({ result: { routes: [selectedRoute] } }, []).find(marker => marker.id === result.markerId);
  assert.equal(marker.sequenceNumber, 1);
  assert.equal(marker.label.text, "1 (×2)");
});

test("missing map coordinates never renumber later visible stops", () => {
  const selectedRoute = route();
  selectedRoute.stops[1].latitude = undefined;
  const index = buildMapSearchIndex([selectedRoute], [{ id: 8451, ...fields }]);
  const markers = generateMapMarkers({ result: { routes: [selectedRoute] } }, []);
  assert.equal(markers.length, 1);
  assert.equal(markers[0].sequenceNumber, 2);
  assert.equal(index[1].displayStopNumber, 2);
  assert.equal(markers[0].id, index[1].markerId);
});

test("map and search keep repeated visits at different times or legs separate", () => {
  const first = { stop_type: "pickup", job_id: 42, latitude: 45.5, longitude: -73.5,
    leg: "GO", arrival_time: "2026-09-29T08:00:00" };
  for (const change of [{ arrival_time: "2026-09-29T17:00:00" }, { leg: "RETURN" }, { arrival_time: undefined }]) {
    const selectedRoute = { stops: [first, { ...first, ...change }] };
    const results = buildMapSearchIndex([selectedRoute], []);
    const markers = generateMapMarkers({ result: { routes: [selectedRoute] } }, []);
    assert.deepEqual(markers.map(marker => marker.sequenceNumber), [1, 2]);
    assert.deepEqual(results.map(result => result.displayStopNumber), [1, 2]);
    assert.deepEqual(results.map(result => result.markerId), markers.map(marker => marker.id));
    assert.equal(results[1].leg, change.leg || "GO");
  }
});
