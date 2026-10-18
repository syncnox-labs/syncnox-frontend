const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const source = fs.readFileSync(path.join(__dirname, "../app/route/_components/mapSearch.utils.ts"), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const helpers = {};
new Function("exports", compiled)(helpers);
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
