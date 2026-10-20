/** Send only edited inputs; response DTOs contain stale routing aliases. */
export function buildJobEditPatch(
  id: number, initial: Record<string, any>, edited: Record<string, any>, shuttle: boolean,
) {
  const payload: Record<string, any> & { id: number } = { id };
  const detail: Record<string, any> = {};
  const custom: Record<string, any> = {};
  const timeFields = new Set(["start_hour", "end_hour", "time_window_start", "time_window_end"]);
  const routeFields = new Set([...timeFields, "reach_before_minutes", "pick_up_address", "drop_off_address",
    "pick_up_location", "drop_off_location", "address_formatted", "location", "service_duration", "priority_level"]);
  const canonical = (key: string, value: any) => {
    if (timeFields.has(key) && typeof value === "string" && /^\d{2}:\d{2}(:00)?$/.test(value)) return value.slice(0, 5);
    if (key.includes("location") && value) return `${value.lat},${value.lng}`;
    return value ?? "";
  };
  let requiresReOptimization = false;
  let timeChanged = false;
  for (const key of Object.keys(initial)) {
    if (canonical(key, initial[key]) === canonical(key, edited[key])) continue;
    const value = edited[key] ?? null;
    if (["scheduled_date", "job_type", "pickup_type"].includes(key)) payload[key] = value;
    else if (shuttle && key === "client_name") custom[key] = value;
    else detail[shuttle ? (key === "quart_id" ? "quant_id" : key) : ({ notes: "additional_notes", client_name: "client_name", client_phone: "phone_number" }[key] ?? key)] = value;
    requiresReOptimization ||= routeFields.has(key);
    timeChanged ||= timeFields.has(key);
  }
  if (Object.keys(detail).length) payload[shuttle ? "worker_shuttle_detail" : "pickup_delivery_detail"] = detail;
  if (Object.keys(custom).length) payload.custom_fields = custom;
  return { payload, requiresReOptimization, timeChanged };
}
