import dayjs from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat";
import type { CustomFieldDefinition } from "@/apis/custom-fields.api";
import type { Job } from "@/types/job.type";
import { getJobPickupType } from "@/utils/jobPickupType.utils";

dayjs.extend(customParseFormat);

export const TIME_FIELD_KEYS = new Set([
  "start_hour", "end_hour", "time_window_start", "time_window_end", "client_pick_up_time",
]);

export const ADDRESS_LOCATION_KEYS: Record<string, string> = {
  address_formatted: "location", pick_up_address: "pick_up_location",
  drop_off_address: "drop_off_location", go_pickup_point: "go_pickup_location",
  return_dropoff_point: "return_dropoff_location", client_address: "client_location",
  candidate_address: "candidate_location",
  go_pickup_address: "go_pickup_location", go_dropoff_address: "go_dropoff_location",
  return_pickup_address: "return_pickup_location", return_dropoff_address: "return_dropoff_location",
};

export const SHUTTLE_ADDRESSES = ["go_pickup_address", "go_dropoff_address", "return_pickup_address", "return_dropoff_address"];
const SHUTTLE_ADDRESS_LABELS: Record<string, string> = {
  go_pickup_address: "Go pickup address", go_dropoff_address: "Go dropoff address",
  return_pickup_address: "Return pickup address", return_dropoff_address: "Return dropoff address",
};

/** Present the configured legacy inputs as explicit trip endpoints, without changing delivery forms. */
export function getJobDisplayFields(definitions: CustomFieldDefinition[], template: string, direction = "one_way") {
  const fields = getJobFormFields(definitions);
  if (template !== "worker_shuttle") return fields;
  const keys = new Set(fields.map(field => field.field_key));
  const returning = direction === "return_only";
  if (!fields.some(field => ["go_pickup_point", "return_dropoff_point", ...SHUTTLE_ADDRESSES].includes(field.field_key))) {
    return fields.map(field => field.data_type === "string" && (field.field_key === "pick_up_address" || field.field_key === "drop_off_address")
      ? { ...field, label: `${returning ? "Return" : "Go"} ${field.field_key === "pick_up_address" ? "pickup" : "dropoff"} address`, description: null }
      : field);
  }
  const aliases: Record<string, string> = {
    go_pickup_point: "go_pickup_address", return_dropoff_point: "return_dropoff_address",
    pick_up_address: keys.has("go_pickup_point") || keys.has("go_pickup_address") || returning ? "return_pickup_address" : "go_pickup_address",
    drop_off_address: keys.has("return_dropoff_point") || keys.has("return_dropoff_address") || !returning ? "go_dropoff_address" : "return_dropoff_address",
  };
  const seen = new Set<string>();
  const presented = fields.flatMap(field => {
    if (field.data_type !== "string") return [field];
    const key = aliases[field.field_key] || field.field_key;
    if (!SHUTTLE_ADDRESS_LABELS[key]) return [field];
    if (seen.has(key) || (key !== field.field_key && keys.has(key))) return [];
    seen.add(key);
    return [{ ...field, field_key: key, label: SHUTTLE_ADDRESS_LABELS[key], description: null,
      ...(field.field_key === "pick_up_address" && key === "return_pickup_address" && !returning ? { default_value: null } : {}) }];
  });
  const addresses = presented.filter(field => SHUTTLE_ADDRESSES.includes(field.field_key))
    .sort((a, b) => SHUTTLE_ADDRESSES.indexOf(a.field_key) - SHUTTLE_ADDRESSES.indexOf(b.field_key));
  let addressIndex = 0;
  return presented.map(field => SHUTTLE_ADDRESSES.includes(field.field_key) ? addresses[addressIndex++] : field);
}

/** Recover legacy bookings by physical leg; never use a RETURN pickup as the GO pickup. */
export function getShuttleAddressValues(job: Job | null): Record<string, unknown> {
  if (!job || job.template_type !== "worker_shuttle") return {};
  const root = job as unknown as Record<string, unknown>;
  const detail = job.worker_shuttle_detail || {};
  const custom = job.custom_fields || {};
  const value = (key: string) => root[key] ?? detail[key] ?? custom[key];
  const returning = job.job_type === "return_only";
  const pickup = value("pick_up_address"), dropoff = value("drop_off_address");
  const pickupLocation = value("pick_up_location"), dropoffLocation = value("drop_off_location");
  const result: Record<string, unknown> = {
    go_pickup_address: value("go_pickup_address") ?? (!returning ? pickup : undefined) ?? value("go_pickup_point") ?? value("candidate_address"),
    go_pickup_location: (!returning ? pickupLocation : undefined) ?? value("go_pickup_location") ?? value("candidate_location"),
    go_dropoff_address: value("go_dropoff_address") ?? (!returning ? dropoff : undefined) ?? value("client_address") ?? (returning ? pickup : undefined),
    go_dropoff_location: value("go_dropoff_location") ?? (!returning ? dropoffLocation : undefined) ?? value("client_location") ?? (returning ? pickupLocation : undefined),
    return_pickup_address: value("return_pickup_address") ?? (returning ? pickup : undefined) ?? value("client_address") ?? (!returning ? dropoff : undefined),
    return_pickup_location: value("return_pickup_location") ?? (returning ? pickupLocation : undefined) ?? value("client_location") ?? (!returning ? dropoffLocation : undefined),
    return_dropoff_address: value("return_dropoff_address") ?? (returning ? dropoff : undefined) ?? value("return_dropoff_point") ?? value("candidate_address") ?? (!returning ? pickup : undefined),
    return_dropoff_location: (returning ? dropoffLocation : undefined) ?? value("return_dropoff_location") ?? value("candidate_location") ?? (!returning ? pickupLocation : undefined),
  };
  for (const key of SHUTTLE_ADDRESSES) {
    if (Object.prototype.hasOwnProperty.call(custom, key)) result[key] = custom[key];
    const coordinate = ADDRESS_LOCATION_KEYS[key];
    if (Object.prototype.hasOwnProperty.call(custom, coordinate)) result[coordinate] = custom[coordinate];
  }
  for (const [key, address, coordinate] of returning
    ? [["return_pickup_address", pickup, pickupLocation], ["return_dropoff_address", dropoff, dropoffLocation]]
    : [["go_pickup_address", pickup, pickupLocation], ["go_dropoff_address", dropoff, dropoffLocation]]) {
    if (address !== undefined && address !== null) {
      result[key as string] = address;
      result[ADDRESS_LOCATION_KEYS[key as string]] = coordinate;
    }
  }
  return result;
}

export function getJobFormFields(fields: CustomFieldDefinition[]) {
  return fields.filter(field => field.entity_type === "job" && field.surfaces?.disp !== false)
    .sort((a, b) => a.display_order - b.display_order || a.id - b.id);
}

export function getJobFieldControl(field: CustomFieldDefinition) {
  // Explicit types always win, even when a user reuses a familiar field key.
  if (field.data_type !== "string") return field.data_type;
  if (field.field_key === "time_window") return "time_range";
  if (TIME_FIELD_KEYS.has(field.field_key)) return "time";
  if (ADDRESS_LOCATION_KEYS[field.field_key]) return "address";
  return "string";
}

export function parseCoordinates(value: unknown): { lat: number; lng: number } | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  let lat: unknown, lng: unknown;
  if (typeof value === "string") {
    const parts = value.split(",").map(part => part.trim());
    if (parts.length !== 2) return undefined;
    [lat, lng] = parts;
  }
  else if (typeof value === "object") ({ lat, lng } = value as { lat: unknown; lng: unknown });
  if (![lat, lng].every(part => (typeof part === "number") || (typeof part === "string" && part.trim() !== ""))) return undefined;
  const latitude = Number(lat), longitude = Number(lng);
  return Number.isFinite(latitude) && Number.isFinite(longitude)
    && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180
    ? { lat: latitude, lng: longitude } : undefined;
}

export function getJobInitialValues(
  fields: CustomFieldDefinition[], initialData: Job | null,
  defaults: { date?: string | dayjs.Dayjs; jobType?: string } = {},
) {
  const values: Record<string, unknown> = {};
  const root = initialData as unknown as Record<string, unknown> | null;
  const detail = initialData?.worker_shuttle_detail || initialData?.pickup_delivery_detail;
  const shuttleAddresses = getShuttleAddressValues(initialData);
  for (const field of getJobFormFields(fields)) {
    const key = field.field_key;
    const sources = [root?.[key], detail?.[key], initialData?.custom_fields?.[key]];
    if (SHUTTLE_ADDRESSES.includes(key)) sources.unshift(shuttleAddresses[key]);
    if (key === "pickup_type") sources.unshift(getJobPickupType(initialData));
    if (key === "quart_id") sources.push(initialData?.quant_id, detail?.quant_id);
    if (key === "quant_id") sources.push(initialData?.quart_id);
    let value = sources.find(item => item !== undefined && item !== null);
    if (value === undefined && key === "time_window" && initialData) {
      const start = root?.time_window_start ?? detail?.time_window_start;
      const end = root?.time_window_end ?? detail?.time_window_end;
      if (start && end) value = `${start} - ${end}`;
    }
    if (value === undefined && !initialData && field.default_value !== null && field.default_value !== undefined) value = field.default_value;
    if (!initialData && key === "scheduled_date") value = defaults.date || value || dayjs();
    if (!initialData && ["job_type", "pickup_type"].includes(key) && defaults.jobType
        && (!field.options || field.options.includes(defaults.jobType as never))) value = defaults.jobType;
    if (value === undefined && field.data_type === "boolean") value = false;
    if (value === undefined || value === null || value === "") continue;
    const control = getJobFieldControl(field);
    if (control === "date") value = dayjs(value as string);
    if (control === "time") value = dayjs(String(value), ["HH:mm:ss", "HH:mm"], true);
    if (control === "time_range") {
      const parts = String(value).split(/\s*[-–]\s*/);
      const times = parts.map(part => dayjs(part, ["HH:mm:ss", "HH:mm"], true));
      if (times.length !== 2 || times.some(time => !time.isValid())) continue;
      value = times;
    }
    if (control === "boolean") value = value === true || value === 1 || value === "true" || value === "1";
    if (control === "number") value = Number(value);
    if (control === "select" && field.options) value = field.options.find(option => String(option) === String(value)) ?? value;
    values[key] = value;
  }
  return values;
}

export function buildJobFormPayload(
  fields: CustomFieldDefinition[], values: Record<string, unknown>, template: string,
  addressLocations: Record<string, unknown> = {},
) {
  const configured: Record<string, unknown> = {};
  const payload: Record<string, unknown> = { template_type: template };
  const visibleFields = getJobFormFields(fields);
  const visibleKeys = new Set(visibleFields.map(field => field.field_key));
  for (const field of visibleFields) {
    const key = field.field_key;
    let value = values[key];
    if (!Object.prototype.hasOwnProperty.call(values, key)) continue;
    if (value === undefined) value = null;
    const control = getJobFieldControl(field);
    if (dayjs.isDayjs(value)) value = value.format(control === "time" ? "HH:mm" : "YYYY-MM-DD");
    if (control === "time_range") {
      const range = Array.isArray(value) ? value.map(time => dayjs.isDayjs(time) ? time.format("HH:mm") : null) : [];
      value = range.length === 2 && range.every(Boolean) ? range.join(" - ") : null;
      if (!visibleKeys.has("time_window_start")) payload.time_window_start = value ? range[0] : null;
      if (!visibleKeys.has("time_window_end")) payload.time_window_end = value ? range[1] : null;
    }
    if (control === "number" && value !== null && value !== "") value = Number(value);
    if (control === "geo" && value !== null && value !== "") value = parseCoordinates(value);
    configured[key] = value;
    payload[key] = value;
    // Geocoded metadata supports routing without adding an unconfigured form control.
    if (control === "address" && ADDRESS_LOCATION_KEYS[key] && addressLocations[key] !== undefined
        && !visibleKeys.has(ADDRESS_LOCATION_KEYS[key])) {
      payload[ADDRESS_LOCATION_KEYS[key]] = addressLocations[key];
    }
  }
  payload.custom_fields = configured;
  return payload;
}

/** Unchanged fields must not trigger booking synchronization or geocoding. */
export function buildJobFormPatch(initial: Record<string, unknown>, edited: Record<string, unknown>) {
  const canonical = (value: unknown): unknown => {
    if (value == null || value === "") return null;
    if (Array.isArray(value)) return value.map(canonical);
    if (typeof value === "object") return Object.fromEntries(
      Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)]),
    );
    return value;
  };
  const same = (left: unknown, right: unknown) => JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));
  const patch: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(edited)) {
    if (key === "template_type") continue;
    if (key === "custom_fields") {
      const previous = (initial.custom_fields || {}) as Record<string, unknown>;
      const custom = Object.fromEntries(Object.entries(value as Record<string, unknown>)
        .filter(([field, next]) => !same(previous[field], next)));
      if (Object.keys(custom).length) patch.custom_fields = custom;
    } else if (!same(initial[key], value)) patch[key] = value;
  }
  if (edited.template_type === "worker_shuttle") {
    for (const address of SHUTTLE_ADDRESSES) {
      const coordinate = ADDRESS_LOCATION_KEYS[address];
      if (Object.prototype.hasOwnProperty.call(patch, coordinate) && Object.prototype.hasOwnProperty.call(edited, address)) {
        patch[address] = edited[address];
        patch.custom_fields = { ...((patch.custom_fields || {}) as Record<string, unknown>), [address]: edited[address] };
      }
    }
  }
  return Object.keys(patch).length ? { template_type: edited.template_type, ...patch } : patch;
}
