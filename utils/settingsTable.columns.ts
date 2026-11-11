import type { ColDef, TextMatcherParams } from "ag-grid-community";
import type { Team } from "@/types/team.type";
import type { Vehicle } from "@/types/vehicle.type";
import type { Depot } from "@/types/depots.type";
import type { LocationMapping, LocationTypeOption } from "@/apis/location-mapping.api";
import type { CustomFieldDefinition, FieldSurfaces } from "@/apis/custom-fields.api";

interface SettingsColumnContext {
  settingsFieldKey: string;
  structured?: boolean;
  parentFieldKey?: string;
}

export interface SettingsFieldPreferences {
  hiddenFields: string[];
  surfaceOverrides: Record<string, FieldSurfaces>;
}

export function formatSettingsValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.map(formatSettingsValue).filter(Boolean).join(", ");
  if (typeof value === "object") return Object.entries(value).map(([key, item]) => `${key}: ${formatSettingsValue(item)}`).join("; ");
  return String(value);
}

export function settingsLabel(value?: string | null): string {
  return (value || "").replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function text<T>(colId: string, headerName: string, getValue: (row: T) => unknown, width = 170): ColDef<T> {
  return {
    colId, headerName, width, minWidth: 100, filter: "agTextColumnFilter", cellDataType: "text",
    context: { settingsFieldKey: colId },
    valueGetter: ({ data }) => data ? formatSettingsValue(getValue(data)) : "",
    valueFormatter: ({ value }) => value || "—",
    tooltipValueGetter: ({ value }) => value || "",
  };
}

function number<T>(colId: string, headerName: string, getValue: (row: T) => number | null | undefined, width = 140): ColDef<T> {
  return {
    colId, headerName, width, minWidth: 90, filter: "agNumberColumnFilter", cellDataType: "number",
    context: { settingsFieldKey: colId.startsWith("constraint:") ? "load_constraints" : colId },
    valueGetter: ({ data }) => data ? getValue(data) ?? null : null,
    valueFormatter: ({ value }) => value === null || value === undefined ? "—" : String(value),
  };
}

/** Use the standard AG Grid text-filter menu, while Equals matches a complete array member. */
export function matchSettingsArrayFilter({ value, filterText, filterOption }: Pick<TextMatcherParams, "value" | "filterText" | "filterOption">): boolean {
  let values: unknown;
  try { values = JSON.parse(String(value)); } catch { values = [value]; }
  const items = (Array.isArray(values) ? values : [values]).map(item => String(item ?? "").trim().toLocaleLowerCase());
  const query = (filterText || "").trim().toLocaleLowerCase();
  const matches = (predicate: (item: string) => boolean) => items.some(predicate);
  switch (filterOption) {
    case "equals": return items.includes(query);
    case "notEqual": return !items.includes(query);
    case "contains": return matches(item => item.includes(query));
    case "notContains": return !matches(item => item.includes(query));
    case "startsWith": return matches(item => item.startsWith(query));
    case "endsWith": return matches(item => item.endsWith(query));
    default: return false;
  }
}

function arrayText<T>(colId: string, headerName: string, getValue: (row: T) => unknown, width = 220): ColDef<T> {
  return {
    ...text(colId, headerName, getValue, width),
    context: { settingsFieldKey: colId, structured: true },
    filterValueGetter: ({ data }) => {
      const value = data ? getValue(data) : null;
      const items = (Array.isArray(value) ? value : value == null || value === "" ? [] : [value]).filter(item => String(item).trim());
      return items.length ? JSON.stringify(items) : null;
    },
    filterParams: { textMatcher: matchSettingsArrayFilter, defaultOption: "equals", trimInput: true },
  };
}

export function createTeamSettingsColumns(vehicles: Pick<Vehicle, "id" | "name">[] = []): ColDef<Team>[] {
  const names = new Map(vehicles.map(vehicle => [vehicle.id, vehicle.name]));
  return [
    number("id", "ID", row => row.id, 85),
    text<Team>("name", "Name", row => row.name, 220),
    text("role_type", "Role", row => settingsLabel(row.role_type), 120),
    text("status", "Status", row => settingsLabel(row.status), 120),
    arrayText("skills", "Skills", row => row.skills),
    text("phone_number", "Phone", row => row.phone_number),
    text("email", "Email", row => row.email, 230),
    text("external_identifier", "External identifier", row => row.external_identifier),
    { ...text<Team>("vehicle", "Vehicle", row => names.get(row.vehicle_id ?? -1) || row.vehicle || row.vehicle_id), context: { settingsFieldKey: "vehicle_id" } },
    text("start_address", "Start location", row => row.start_address, 250),
    text("end_address", "End location", row => row.end_address, 250),
    { ...text<Team>("start_coordinates", "Start coordinates", row => row.start_location, 210), context: { settingsFieldKey: "start_location", structured: true } },
    { ...text<Team>("end_coordinates", "End coordinates", row => row.end_location, 210), context: { settingsFieldKey: "end_location", structured: true } },
    text("work_start_time", "Work start", row => row.work_start_time, 130),
    text("work_end_time", "Work end", row => row.work_end_time, 130),
    text("day_schedules", "Weekly schedule", row => Object.entries(row.day_schedules || {}).map(([day, schedule]) => `${settingsLabel(day)}: ${schedule.enabled ? `${schedule.start_time || "—"}–${schedule.end_time || "—"}` : "Off"}`).join("; "), 300),
    text("allowed_overtime", "Overtime allowed", row => row.allowed_overtime),
    number("max_distance", "Distance limit (km)", row => row.max_distance, 180),
    text("break_time_start", "Break start", row => row.break_time_start, 130),
    text("break_time_end", "Break end", row => row.break_time_end, 130),
    number("fixed_cost_for_driver", "Fixed cost", row => row.fixed_cost_for_driver),
    number("cost_per_km", "Cost per km", row => row.cost_per_km),
    number("cost_per_hr", "Cost per hour", row => row.cost_per_hr),
    number("cost_per_hr_overtime", "Overtime cost per hour", row => row.cost_per_hr_overtime, 200),
    { ...number<Team>("service_zone_count", "Service areas", row => row.service_zones?.length ?? 0), context: { settingsFieldKey: "service_zones", structured: true } },
    text("navigation_link_format", "Navigation format", row => row.navigation_link_format, 200),
  ];
}

export function createVehicleSettingsColumns(vehicles: Vehicle[], teams: Pick<Team, "id" | "name">[] = []): ColDef<Vehicle>[] {
  const names = new Map(teams.map(team => [team.id, team.name]));
  const constraints = new Map<string, Vehicle["load_constraints"][number]>();
  for (const vehicle of vehicles) for (const constraint of vehicle.load_constraints || []) {
    constraints.set(JSON.stringify([constraint.constraint_type, constraint.unit, constraint.label || ""]), constraint);
  }
  return [
    number("id", "ID", row => row.id, 85),
    text<Vehicle>("name", "Name", row => row.name, 220),
    text("type", "Type", row => settingsLabel(row.type), 140),
    text("license_plate", "License plate", row => row.license_plate, 150),
    text("make", "Make", row => row.make, 140),
    text("model", "Model", row => row.model, 140),
    { ...text<Vehicle>("team_member", "Assigned team member", row => names.get(row.team_member_id ?? -1) || row.team_member_id, 220), context: { settingsFieldKey: "team_member_id" } },
    arrayText("required_skills", "Required skills", row => row.required_skills),
    text("relation", "Skill matching", row => row.relation === "and" ? "All skills" : row.relation === "or" ? "Any skill" : ""),
    { ...text<Vehicle>("load_constraints", "Load constraints", row => (row.load_constraints || []).map(item => `${item.label || settingsLabel(item.constraint_type)}: ${item.max_value} ${item.unit}`).join("; "), 300), context: { settingsFieldKey: "load_constraints", structured: true } },
    ...Array.from(constraints, ([key, constraint]) => number<Vehicle>(
      `constraint:${key}`,
      `${constraint.label || settingsLabel(constraint.constraint_type)} (${constraint.unit})`,
      row => row.load_constraints?.find(item => JSON.stringify([item.constraint_type, item.unit, item.label || ""]) === key)?.max_value,
      180,
    )),
  ];
}

export function createDepotSettingsColumns(): ColDef<Depot>[] {
  return [
    number("id", "ID", row => row.id, 85),
    text<Depot>("name", "Name", row => row.name, 220),
    text("address", "Address", row => row.address?.formatted_address, 300),
    ...([['street', 'Street'], ['city', 'City'], ['state', 'State'], ['zip_code', 'Postal code'], ['country', 'Country']] as const).map(([key, label]) => ({
      ...text<Depot>(key, label, row => row.address?.[key], 150), context: { settingsFieldKey: key, parentFieldKey: "address" },
    })),
    number("latitude", "Latitude", row => row.location?.lat),
    number("longitude", "Longitude", row => row.location?.lng),
  ];
}

export function createLocationSettingsColumns(types: LocationTypeOption[] = []): ColDef<LocationMapping>[] {
  return [
    number("id", "ID", row => row.id, 85),
    text<LocationMapping>("name", "Name", row => row.name, 220),
    text("type", "Type", row => {
      const value = row.type || row.location_type || "metro_station";
      return types.find(type => [type.value.toLowerCase(), type.label.toLowerCase()].includes(value.toLowerCase()))?.label || settingsLabel(value);
    }, 180),
    text("aliases", "Aliases", row => row.aliases, 230),
    text("address", "Address", row => row.address, 300),
    text("city", "City", row => row.city, 150),
    text("country", "Country", row => row.country, 150),
    text("is_active", "Status", row => row.is_active ? "Active" : "Inactive", 120),
    number("latitude", "Latitude", row => row.latitude),
    number("longitude", "Longitude", row => row.longitude),
  ];
}

export function parseSettingsDate(value: unknown): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value !== "string") return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:$|T|\s)/.exec(value.trim());
  if (!match) return null;
  const [, year, month, day] = match.map(Number);
  const date = new Date(0);
  date.setFullYear(year, month - 1, day);
  date.setHours(0, 0, 0, 0);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : null;
}

function schemaValue<T extends { custom_fields?: Record<string, unknown> }>(row: T, field: CustomFieldDefinition): unknown {
  return (row as Record<string, unknown>)[field.field_key] ?? row.custom_fields?.[field.field_key] ?? field.default_value;
}

export function createSettingsCustomColumns<T extends { custom_fields?: Record<string, unknown> }>(fields: CustomFieldDefinition[]): ColDef<T>[] {
  return [...fields].filter(field => field.is_visible_in_list !== false && field.surfaces?.disp !== false)
    .sort((left, right) => left.display_order - right.display_order || left.id - right.id || left.field_key.localeCompare(right.field_key))
    .map(field => {
      const key = `custom:${field.field_key}`;
      if (field.data_type === "number") return number<T>(key, field.label, row => {
        const value = schemaValue(row, field);
        return value == null || value === "" || typeof value === "boolean" || !Number.isFinite(Number(value)) ? null : Number(value);
      });
      if (field.data_type === "date") return {
        colId: key, headerName: field.label, width: 170, minWidth: 100,
        filter: "agDateColumnFilter", cellDataType: "date",
        valueGetter: ({ data }) => data ? parseSettingsDate(schemaValue(data, field)) : null,
        valueFormatter: ({ value }) => value instanceof Date
          ? `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}` : "—",
      } satisfies ColDef<T>;
      if (field.data_type === "select") return arrayText<T>(key, field.label, row => schemaValue(row, field), 180);
      return text<T>(key, field.label, row => {
        const value = schemaValue(row, field);
        if (field.data_type !== "boolean" || value == null || value === "") return value;
        if ([true, 1, "true", "1"].includes(value as string | number | boolean)) return "Yes";
        if ([false, 0, "false", "0"].includes(value as string | number | boolean)) return "No";
        return "";
      }, 180);
    });
}

export function readSettingsFieldPreferences(storage: Pick<Storage, "getItem">, entity: string): SettingsFieldPreferences {
  const result: SettingsFieldPreferences = { hiddenFields: [], surfaceOverrides: {} };
  try {
    const hidden: unknown = JSON.parse(storage.getItem(`syncnox_hidden_base_fields_${entity}`) || "[]");
    if (Array.isArray(hidden)) result.hiddenFields = hidden.filter((key): key is string => typeof key === "string");
    const overrides: unknown = JSON.parse(storage.getItem(`syncnox_base_field_overrides_${entity}`) || "{}");
    if (overrides && typeof overrides === "object" && !Array.isArray(overrides)) {
      result.surfaceOverrides = Object.fromEntries(Object.entries(overrides).flatMap(([key, value]) => {
        const surfaces = value && typeof value === "object" ? (value as { surfaces?: FieldSurfaces }).surfaces : undefined;
        return typeof surfaces?.disp === "boolean" ? [[key, { disp: surfaces.disp }]] : [];
      }));
    }
  } catch { /* Invalid or unavailable browser preferences must not break the table. */ }
  return result;
}

/** Native adapters provide business values; tenant definitions own their presentation and extra columns. */
export function resolveSettingsColumns<T extends { custom_fields?: Record<string, unknown> }>(
  baseColumns: ColDef<T>[], fields: CustomFieldDefinition[], preferences: SettingsFieldPreferences = { hiddenFields: [], surfaceOverrides: {} },
): ColDef<T>[] {
  const definitions = new Map<string, CustomFieldDefinition>();
  for (const field of [...fields].sort((left, right) => left.display_order - right.display_order || left.id - right.id || left.field_key.localeCompare(right.field_key))) {
    if (!definitions.has(field.field_key)) definitions.set(field.field_key, field);
  }
  const hidden = new Set(preferences.hiddenFields);
  const knownKeys = new Set(baseColumns.flatMap(column => [(column.context as SettingsColumnContext | undefined)?.settingsFieldKey, column.colId]).filter(Boolean));
  const visible = (key: string) => {
    const definition = definitions.get(key);
    const isBase = knownKeys.has(key) || definition?.group === "optimization";
    return !(isBase && hidden.has(key)) && definition?.is_visible_in_list !== false
      && ((isBase ? preferences.surfaceOverrides[key]?.disp : undefined) ?? definition?.surfaces?.disp) !== false;
  };
  const maxOrder = Array.from(definitions.values()).reduce((maximum, field) => Math.max(maximum, field.display_order), 0);
  const resolved: { column: ColDef<T>; order: number; index: number }[] = [];
  baseColumns.forEach((column, index) => {
    const context = column.context as SettingsColumnContext | undefined;
    const key = context?.settingsFieldKey || column.colId || String(column.field);
    if (!visible(key) || context?.parentFieldKey && !visible(context.parentFieldKey)) return;
    const definition = definitions.get(key) || (column.colId ? definitions.get(column.colId) : undefined);
    const direct = column.colId === key || definition?.field_key === column.colId;
    let configured = { ...column, headerName: definition && direct ? definition.label : column.headerName };
    // Structured native values (skills, addresses, capacities) keep their domain-specific filters.
    if (definition && direct && !context?.structured) {
      const getter = column.valueGetter;
      const typed = createSettingsCustomColumns<T>([{ ...definition, is_visible_in_list: true, surfaces: { disp: true } }])[0];
      configured = {
        ...configured, filter: typed.filter, cellDataType: typed.cellDataType, valueFormatter: typed.valueFormatter,
        valueGetter: params => {
          if (!params.data) return null;
          const raw = typeof getter === "function" ? getter(params) : schemaValue(params.data, definition);
          if (definition.data_type === "date") return parseSettingsDate(raw);
          if (definition.data_type === "number") return raw == null || raw === "" || typeof raw === "boolean" || !Number.isFinite(Number(raw)) ? null : Number(raw);
          if (definition.data_type === "boolean") return [true, 1, "true", "1", "Yes"].includes(raw as string | number | boolean) ? "Yes" : [false, 0, "false", "0", "No"].includes(raw as string | number | boolean) ? "No" : "";
          return formatSettingsValue(raw);
        },
      };
    }
    const order = definition?.display_order ?? (key === "id" ? -2 : key === "name" ? -1 : maxOrder + 1 + index);
    resolved.push({ column: configured, order, index });
  });
  for (const field of definitions.values()) {
    if (knownKeys.has(field.field_key) || !visible(field.field_key)) continue;
    const column = createSettingsCustomColumns<T>([{ ...field, surfaces: { ...field.surfaces, ...preferences.surfaceOverrides[field.field_key] } }])[0];
    if (column) resolved.push({ column, order: field.display_order, index: baseColumns.length + resolved.length });
  }
  return resolved.sort((left, right) => left.order - right.order || left.index - right.index).map(item => item.column);
}

/** Drop only filters whose column was removed or changed type after a schema update. */
export function reconcileSettingsFilters(model: Record<string, unknown>, columns: ColDef[]): Record<string, unknown> {
  const filters = new Map(columns.map(column => [column.colId, column.filter]));
  const types: Record<string, string> = { agTextColumnFilter: "text", agNumberColumnFilter: "number", agDateColumnFilter: "date" };
  return Object.fromEntries(Object.entries(model).filter(([key, value]) => {
    const filter = filters.get(key);
    if (!filter) return false;
    const expected = typeof filter === "string" ? types[filter] : undefined;
    return !expected || !value || typeof value !== "object" || !("filterType" in value) || value.filterType === expected;
  }));
}
