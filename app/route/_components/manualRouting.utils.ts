import type { Job } from "@/types/job.type";
import type { Routes } from "@/types/routes.type";
import type { ManualJobSummary } from "@/apis/manualRouting.api";

export const routeJobIds = (route?: Routes): number[] => [...new Set((route?.stops || []).map(stop => stop.job_id).filter((id): id is number => typeof id === "number"))];
export function manualRouteLabel(route: Routes, index: number): string {
  const times = (route.stops || []).map(stop => stop.arrival_time).filter(Boolean).sort();
  const time = times.length ? ` · Trip ${formatRouteClock(times[0])}–${formatRouteClock(times[times.length - 1])}${times[0].slice(0, 10) !== times[times.length - 1].slice(0, 10) ? " (+1 day)" : ""}` : " · Empty route";
  return `${route.name || `Route ${index + 1}`} · ${route.team_member_name}${route.leg ? ` · ${route.leg}` : ""}${time}`;
}
export function manualJobLabel(job: Job | ManualJobSummary): string {
  if ("name" in job && job.name) return job.name;
  const full = job as Job;
  return full.worker_shuttle_detail?.candidate_name || full.candidate_name || full.custom_fields?.candidate_name ||
    full.pickup_delivery_detail?.client_name || full.client_name || `Job #${job.id}`;
}

export function formatRouteClock(value?: string | null): string {
  if (!value) return "Time not set";
  const clock = value.includes("T") ? value.slice(11, 16) : value;
  const match = /^(\d{1,2}):(\d{2})/.exec(clock);
  if (!match) return clock;
  const hour = Number(match[1]);
  return `${hour % 12 || 12}:${match[2]} ${hour < 12 ? "AM" : "PM"}`;
}

export function manualJobTrip(job: Job | ManualJobSummary): { direction: string; timeLabel: string } {
  const full = job as Job;
  const fields = full.custom_fields || {};
  const start = job.start_hour || full.worker_shuttle_detail?.start_hour || fields.start_hour || full.time_window_start;
  const end = job.end_hour || full.worker_shuttle_detail?.end_hour || fields.end_hour || full.time_window_end;
  if (job.job_type === "return_only") {
    const nextDay = start && end && String(end).slice(0, 5) < String(start).slice(0, 5);
    return { direction: "RETURN", timeLabel: end ? `Requested pickup: ${formatRouteClock(end)}${nextDay ? " (next day)" : ""}` : "Pickup time not set" };
  }
  if (job.job_type === "one_way") return { direction: "GO", timeLabel: start ? `Work starts at ${formatRouteClock(start)}` : "Work start not set" };
  return { direction: job.job_type || "Job", timeLabel: start ? `Job window from ${formatRouteClock(start)}` : "Time flexible" };
}

export function assignmentProposal(jobIds: number[], driverId?: number, driverName?: string): import("@/apis/manualRouting.api").ManualRoutingRequest {
  return { action: "assign", placement: "auto", job_ids: jobIds, driver_id: driverId, expected_driver_name: driverId === undefined ? undefined : driverName };
}
export function manualRoutingError(error: unknown): string {
  const value = error as { detail?: unknown; response?: { data?: { detail?: unknown } }; message?: string };
  const detail = value?.response?.data?.detail ?? value?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) return detail.map(item => typeof item?.msg === "string" ? item.msg : "Check the selected values.").join("\n");
  if (detail && typeof detail === "object" && "message" in detail && typeof detail.message === "string") return detail.message;
  return value?.message || "The route could not be checked. Your selections are kept; please retry.";
}
export function manualRoutingErrorInfo(error: unknown) {
  const value = error as { detail?: unknown; response?: { data?: { detail?: unknown } } };
  const detail = value?.response?.data?.detail ?? value?.detail;
  const serviceUnavailable = Boolean(detail && typeof detail === "object" && "category" in detail && detail.category === "routing_provider_unavailable");
  return { message: manualRoutingError(error),
    title: serviceUnavailable ? "Routing service unavailable" : "This assignment needs a change",
    showChangeOptions: !serviceUnavailable };
}
export const hasJobProgress = (job: Job): boolean => ["in_transit", "in_progress", "completed", "failed"].includes(job.status);

/** Preserve local date/time strings: route times belong to the plan's timezone. */
export const localRouteTime = (value?: string | null): string => value ? value.slice(0, 16) : "";
