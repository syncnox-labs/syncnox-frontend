import dayjs from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat";
import type { CustomFieldDefinition } from "@/apis/custom-fields.api";
import type { Job } from "@/types/job.type";

dayjs.extend(customParseFormat);

export const TIME_FIELD_KEYS = new Set([
  "start_hour", "end_hour", "time_window_start", "time_window_end", "client_pick_up_time",
]);

export const ADDRESS_LOCATION_KEYS: Record<string, string> = {
  address_formatted: "location", pick_up_address: "pick_up_location",
  drop_off_address: "drop_off_location", go_pickup_point: "go_pickup_location",
  return_dropoff_point: "return_dropoff_location", client_address: "client_location",
  candidate_address: "candidate_location",
};

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
  for (const field of getJobFormFields(fields)) {
    const key = field.field_key;
    const sources = [root?.[key], detail?.[key], initialData?.custom_fields?.[key]];
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
