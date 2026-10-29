const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

function loadExportUtils() {
  const source = fs.readFileSync(path.join(__dirname, "..", "utils", "exportCsv.utils.ts"), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      esModuleInterop: true,
      target: ts.ScriptTarget.ES2020,
    },
  }).outputText;

  const exports = {};
  new Function("exports", "require", compiled)(exports, require);
  return exports;
}

test("generateTeamMembersCsv outputs matching bulk-import CSV headers and data", () => {
  const { generateTeamMembersCsv } = loadExportUtils();
  const mockMembers = [
    {
      id: 1,
      name: "Tahreem Ahmed ANWAR",
      skills: ["CLASS 1", "CLASS 4", "CLASS 5"],
      email: "tahreem@example.com",
      phone_number: "+1 555-1234",
      role_type: "driver",
      day_schedules: {
        monday: { enabled: true, start_time: "06:00", end_time: "18:00" },
        tuesday: { enabled: true, start_time: "06:00", end_time: "18:00" },
        wednesday: { enabled: true, start_time: "06:00", end_time: "18:00" },
        thursday: { enabled: true, start_time: "06:00", end_time: "18:00" },
        friday: { enabled: true, start_time: "06:00", end_time: "18:00" },
        saturday: { enabled: false, start_time: null, end_time: null },
        sunday: { enabled: false, start_time: null, end_time: null },
      },
    },
    {
      id: 2,
      name: "Driver, with comma in name",
      skills: ["CLASS 5"],
      email: null,
      phone_number: null,
      role_type: "driver",
      day_schedules: null,
    },
  ];

  const csv = generateTeamMembersCsv(mockMembers);
  const lines = csv.split("\n");
  assert.equal(
    lines[0],
    "NAME,DRIVER LICENSE,EMAIL,PHONE NUMBER,ROLE,MONDAY,TUESDAY,WEDNESDAY,THURSDAY,FRIDAY,SATURDAY,SUNDAY"
  );

  assert.equal(
    lines[1],
    "Tahreem Ahmed ANWAR,CLASS 1 - CLASS 4 - CLASS 5,tahreem@example.com,+1 555-1234,driver,06:00 - 18:00,06:00 - 18:00,06:00 - 18:00,06:00 - 18:00,06:00 - 18:00,NA,NA"
  );

  // Checks comma escaping
  assert.equal(
    lines[2],
    '"Driver, with comma in name",CLASS 5,,,driver,NA,NA,NA,NA,NA,NA,NA'
  );
});

test("generateVehiclesCsv outputs matching bulk-import CSV headers and data", () => {
  const { generateVehiclesCsv } = loadExportUtils();
  const mockVehicles = [
    {
      id: 1,
      name: "VEHICULE 1",
      type: "van",
      license_plate: "ABC-123",
      make: "Ford",
      model: "Transit",
      required_skills: ["CLASS 4", "CLASS 5"],
      load_constraints: [
        { constraint_type: "capacity", max_value: 20, unit: "seats" },
        { constraint_type: "weight", max_value: 1200, unit: "kg" },
      ],
    },
    {
      id: 2,
      name: "BUS 1",
      type: "bus",
      license_plate: null,
      make: null,
      model: null,
      required_skills: ["CLASS 1"],
      load_constraints: [
        { constraint_type: "capacity", max_value: 48, unit: "seats" },
      ],
    },
  ];

  const csv = generateVehiclesCsv(mockVehicles);
  const lines = csv.split("\n");
  assert.equal(
    lines[0],
    "Vehicle Name,Vehicle Type,Passenger Capacity,License Plate,Make,Model,Required Skills,Max Weight (kg),Max Volume (m3),Max Pallets"
  );

  assert.equal(
    lines[1],
    "VEHICULE 1,van,20,ABC-123,Ford,Transit,CLASS 4 - CLASS 5,1200,,"
  );

  assert.equal(
    lines[2],
    "BUS 1,bus,48,,,,CLASS 1,,,"
  );
});
