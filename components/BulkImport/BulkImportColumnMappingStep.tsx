"use client";

import { useState, useEffect } from "react";
import { Table, Select, Button, Alert, Checkbox } from "antd";

export interface SystemFieldDefinition {
  key: string;
  label: string;
  required?: boolean;
}

const VEHICLE_FIELDS: SystemFieldDefinition[] = [
  { key: "name", label: "Vehicle Name", required: true },
  { key: "type", label: "Vehicle Type" },
  { key: "capacity", label: "Capacity (Seats)" },
  { key: "weight", label: "Max Weight (kg)" },
  { key: "volume", label: "Max Volume (m³)" },
  { key: "quantity", label: "Max Quantity / Units" },
  { key: "pallets", label: "Max Pallets" },
  { key: "license_plate", label: "License Plate" },
  { key: "make", label: "Make" },
  { key: "model", label: "Model" },
  { key: "required_skills", label: "Required Skills / Licenses" },
];

const DRIVER_FIELDS: SystemFieldDefinition[] = [
  { key: "name", label: "Driver Name", required: true },
  { key: "email", label: "Email" },
  { key: "phone_number", label: "Phone Number" },
  { key: "role_type", label: "Role" },
  { key: "skills", label: "Skills / Driving Licenses" },
  { key: "monday", label: "Monday Schedule" },
  { key: "tuesday", label: "Tuesday Schedule" },
  { key: "wednesday", label: "Wednesday Schedule" },
  { key: "thursday", label: "Thursday Schedule" },
  { key: "friday", label: "Friday Schedule" },
  { key: "saturday", label: "Saturday Schedule" },
  { key: "sunday", label: "Sunday Schedule" },
];

const LOCATION_FIELDS: SystemFieldDefinition[] = [
  { key: "name", label: "Station Name / Title", required: true },
  { key: "address", label: "Location Address / Formatted Address" },
  { key: "city", label: "City" },
  { key: "country", label: "Country" },
  { key: "latitude", label: "Latitude (Lat)" },
  { key: "longitude", label: "Longitude (Lng)" },
];



function matchesDay(clean: string, fullDay: string, shortDay: string): boolean {
  if (clean.includes(fullDay)) return true;
  const regex = new RegExp(`\\b${shortDay}\\b`, "i");
  return regex.test(clean);
}

function autoMatchField(header: string, entityType: "vehicle" | "driver" | "location"): string | undefined {
  if (!header) return undefined;
  const clean = header.trim().toLowerCase();

  if (entityType === "vehicle") {
    if (["vehicle", "name", "vehicule", "vehicle name", "title"].includes(clean) || clean.includes("vehicle name")) return "name";
    if (clean.includes("capacity") || clean.includes("passenger") || clean.includes("seats")) return "capacity";
    if (clean.includes("weight") || clean.includes("poids") || clean.includes("kg") || clean.includes("lbs")) return "weight";
    if (clean.includes("volume") || clean.includes("vlm") || clean.includes("m3")) return "volume";
    if (clean.includes("quantity") || clean.includes("qty") || clean.includes("count") || clean.includes("units")) return "quantity";
    if (clean.includes("pallet")) return "pallets";
    if (clean.includes("license") || clean.includes("skills") || clean.includes("driving") || clean.includes("required")) return "required_skills";
    if (clean.includes("plate") || clean.includes("immatriculation")) return "license_plate";
    if (clean.includes("type")) return "type";
    if (clean.includes("make") || clean.includes("brand")) return "make";
    if (clean.includes("model")) return "model";
  } else if (entityType === "driver") {
    if (["name", "driver", "driver name", "full name", "team member"].includes(clean) || clean.includes("driver name")) return "name";
    if (clean.includes("email")) return "email";
    if (clean.includes("phone") || clean.includes("mobile") || clean.includes("contact")) return "phone_number";
    if (clean.includes("license") || clean.includes("skills") || clean.includes("driving")) return "skills";
    if (clean.includes("role")) return "role_type";
    if (matchesDay(clean, "monday", "mon")) return "monday";
    if (matchesDay(clean, "tuesday", "tue") || matchesDay(clean, "tuesday", "tues")) return "tuesday";
    if (matchesDay(clean, "wednesday", "wed")) return "wednesday";
    if (matchesDay(clean, "thursday", "thu") || matchesDay(clean, "thursday", "thur") || matchesDay(clean, "thursday", "thurs")) return "thursday";
    if (matchesDay(clean, "friday", "fri")) return "friday";
    if (matchesDay(clean, "saturday", "sat")) return "saturday";
    if (matchesDay(clean, "sunday", "sun")) return "sunday";
  } else {
    if (clean === "location" || clean === "addr" || clean.includes("address") || clean.includes("street") || clean.includes("formatted") || clean.includes("location address") || clean.includes("full address")) return "address";
    if (clean.includes("code") || clean.includes("alias") || clean.includes("stn") || clean.includes("station id") || clean === "id") return "code";
    if (clean === "lat" || clean.includes("latitude")) return "latitude";
    if (clean === "lng" || clean === "lon" || clean.includes("longitude")) return "longitude";
    if (clean === "city" || clean === "town" || clean.includes("ville") || clean === "municipality") return "city";
    if (clean === "country" || clean === "pays" || clean.includes("nationality")) return "country";
    if (clean.includes("category") || clean.includes("type") || clean.includes("kind")) return "category";
    if (clean.includes("zone") || clean.includes("area") || clean.includes("region")) return "service_zone";
    if (clean.includes("hours") || clean.includes("operating") || clean.includes("schedule")) return "operating_hours";
    if (["station", "station name", "name", "metro", "depot", "hub", "point", "title", "location name", "place name", "site name"].includes(clean)) return "name";
  }

  return undefined;
}

interface BulkImportColumnMappingStepProps {
  entityType: "vehicle" | "driver" | "location";
  rawHeaders: string[];
  rawRows: Record<string, any>[];
  initialMapping?: Record<string, string>;
  skipFirstRow?: boolean;
  onSkipFirstRowChange?: (skip: boolean) => void;
  onMappingConfirmed: (mapping: Record<string, string>) => void;
  onBack: () => void;
}

export default function BulkImportColumnMappingStep({
  entityType,
  rawHeaders,
  rawRows,
  initialMapping,
  skipFirstRow,
  onSkipFirstRowChange,
  onMappingConfirmed,
  onBack,
}: BulkImportColumnMappingStepProps) {
  // mapping: { [excelHeader]: systemFieldKey }
  const [mapping, setMapping] = useState<Record<string, string>>(() => {
    if (initialMapping && Object.keys(initialMapping).length > 0) {
      return { ...initialMapping };
    }
    const initial: Record<string, string> = {};
    rawHeaders.forEach((header) => {
      let matched = autoMatchField(header, entityType);

      // Fallback: If header is empty/generic (e.g., __EMPTY) or unmatched, check the first sample row value
      if (!matched && rawRows && rawRows.length > 0) {
        const sampleVal = rawRows[0]?.[header];
        if (typeof sampleVal === "string" && sampleVal.trim()) {
          matched = autoMatchField(sampleVal, entityType);
        }
      }

      if (matched) {
        initial[header] = matched;
      }
    });
    return initial;
  });
  const systemFields =
    entityType === "vehicle"
      ? VEHICLE_FIELDS
      : entityType === "driver"
      ? DRIVER_FIELDS
      : LOCATION_FIELDS;

  const handleSelectField = (header: string, systemKey: string | undefined) => {
    setMapping((prev) => {
      const next = { ...prev };
      if (!systemKey) {
        delete next[header];
      } else {
        // Ensure no other header is mapped to the same unique system key (optional, allow reassigning)
        Object.keys(next).forEach((h) => {
          if (next[h] === systemKey && h !== header) {
            delete next[h];
          }
        });
        next[header] = systemKey;
      }
      return next;
    });
  };

  const isNameMapped = Object.values(mapping).includes("name");

  const fieldOptions = [
    { value: "", label: "-- Not Mapped --" },
    ...systemFields.map((f) => ({
      value: f.key,
      label: `${f.label}${f.required ? " *" : ""}`,
    })),
  ];

  const columns = [
    {
      title: "#",
      key: "index",
      width: 50,
      render: (_: any, __: any, idx: number) => <span className="text-gray-400 text-xs">{idx + 1}</span>,
    },
    ...rawHeaders.map((header) => ({
      title: (
        <div className="flex flex-col gap-1 py-1">
          <Select
            showSearch
            optionFilterProp="label"
            filterOption={(input, option) =>
              (option?.label ?? "").toString().toLowerCase().includes(input.toLowerCase())
            }
            size="small"
            value={mapping[header] || ""}
            onChange={(val) => handleSelectField(header, val || undefined)}
            options={fieldOptions}
            className="w-full text-xs font-normal"
            placeholder="Select Field"
          />
          <span className="font-semibold text-gray-800 text-xs truncate" title={header}>
            {header}
          </span>
        </div>
      ),
      dataIndex: header,
      key: header,
      width: 220,
      render: (val: any) => (
        <span className="text-xs text-gray-600 truncate block max-w-[210px]" title={val?.toString()}>
          {val !== undefined && val !== null ? String(val) : ""}
        </span>
      ),
    })),
  ];

  const displayedRows = skipFirstRow ? rawRows.slice(1) : rawRows;
  const previewDataSource = displayedRows.map((row, idx) => ({ ...row, key: idx }));

  return (
    <div className="flex flex-col flex-1 min-h-0 space-y-3 py-1">
      {!isNameMapped && (
        <Alert
          type="warning"
          showIcon
          message={`Please map a column to "${entityType === "vehicle" ? "Vehicle Name" : "Driver Name"}" (Required)`}
        />
      )}

      <div className="responsive-toolbar flex items-center justify-between text-xs text-gray-600 font-medium shrink-0">
        <span>Map Excel headers to system fields ({rawHeaders.length} columns detected)</span>
        <div className="flex items-center gap-4">
          <Checkbox
            checked={skipFirstRow}
            onChange={(e) => onSkipFirstRowChange?.(e.target.checked)}
            className="text-xs text-gray-700 font-normal select-none"
          >
            Skip first data row
          </Checkbox>
          <span>Showing preview of {displayedRows.length} rows</span>
        </div>
      </div>

      <div className="flex-1 min-h-0 relative border border-gray-200 overflow-auto [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-track]:bg-gray-100 [&::-webkit-scrollbar-track]:rounded [&::-webkit-scrollbar-thumb]:bg-gray-300 [&::-webkit-scrollbar-thumb:hover]:bg-gray-400 [scrollbar-width:thin] [scrollbar-color:#c1c1c1_#f1f1f1] [&_.ant-table-thead>tr>th]:sticky [&_.ant-table-thead>tr>th]:top-0 [&_.ant-table-thead>tr>th]:z-10 [&_.ant-table-thead>tr>th]:!bg-gray-50 [&_.ant-table-container]:!overflow-visible [&_.ant-table-content]:!overflow-visible [&_.ant-table-cell-fix-left]:!sticky [&_.ant-table-cell-fix-left]:!z-11 [&_.ant-table-thead>tr>.ant-table-cell-fix-left]:!z-20 [&_.ant-table-thead>tr>.ant-table-cell-fix-left]:!top-0">
        <Table
          columns={columns}
          dataSource={previewDataSource}
          pagination={false}
          size="small"
          scroll={{ x: "max-content" }}
        />
      </div>

      <div className="import-step-footer flex justify-between items-center pt-2 border-t shrink-0">
        <Button onClick={onBack} className="rounded-none">Back</Button>
        <Button
          type="primary"
          disabled={!isNameMapped}
          onClick={() => onMappingConfirmed(mapping)}
          className="rounded-none bg-[#003220] hover:bg-[#003220]/90"
        >
          Continue to Preview
        </Button>
      </div>
    </div>
  );
}
