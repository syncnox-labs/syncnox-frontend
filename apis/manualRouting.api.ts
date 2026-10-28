import apiClient from "@/config/apiClient.config";
import type { Route, WorkingTimeExtension } from "@/types/routes.type";

export interface RoutePoint { lat: number; lng: number; address: string }
export interface ManualStop { job_id: number; stop_type: "pickup" | "dropoff" | "job"; arrival_time?: string | null }
export interface ManualJobUpdate {
  job_id: number; name?: string; phone?: string; notes?: string;
  start_hour?: string; end_hour?: string; passenger_count?: number;
  pickup?: RoutePoint; dropoff?: RoutePoint;
}
export interface ManualRoutingRequest {
  action: "assign" | "create" | "edit" | "delete" | "split" | "merge" | "waiting";
  placement?: "auto" | "existing" | "new";
  route_index?: number; merge_route_index?: number; driver_id?: number; vehicle_id?: number;
  waiting_after_stop_index?: number; waiting_seconds?: number; waiting_side?: "left" | "right";
  expected_driver_name?: string;
  job_ids: number[]; name?: string; start_point?: RoutePoint; end_point?: RoutePoint;
  start_at?: string | null; end_at?: string | null; ordered_stops?: ManualStop[];
  job_updates?: ManualJobUpdate[]; change_fixed_driver?: boolean; expected_revision?: string;
}
export interface ManualRoutingPreview {
  success: boolean; revision: string; preview_token: string; explanation: string; message: string;
  result: Route["result"]; affected_route_indices: number[]; deleted_route_indices: number[];
  updates_drivers: boolean;
  working_time_extensions?: WorkingTimeExtension[];
}
export interface ManualJobSummary {
  id: number; name: string; job_type: string; template_type?: string;
  start_hour?: string | null; end_hour?: string | null; pickup?: RoutePoint | null; dropoff?: RoutePoint | null;
  required_driver_name?: string | null;
  required_driver_issue?: "not_active" | "no_vehicles" | "no_matching_qualifications" | null;
}
export interface ManualRoutingContext {
  revision: string; result: Route["result"];
  driver_names?: Record<string, string>;
  job_summaries?: Record<string, ManualJobSummary>;
  drivers?: { id: number; name: string; vehicle_id?: number | null }[];
  vehicles?: { id: number; name: string; capacity: number }[];
  assignment_choices?: AssignmentChoice[];
}
export interface AssignmentChoice {
  driver_id: number; vehicle_id: number; route_index: number | null;
  requires_working_time_extension: boolean; changes_required_driver: boolean;
  job_ids: number[];
}
export const getManualRoutingContext = async (id: number, jobIds: number[] = []): Promise<ManualRoutingContext> => {
  const query = jobIds.map(jobId => `job_ids=${encodeURIComponent(jobId)}`).join("&");
  const { data } = await apiClient.get(`optimization/requests/${id}/manual-routing/context${query ? `?${query}` : ""}`);
  return data;
};
export const previewManualRouting = async (id: number, proposal: ManualRoutingRequest, signal?: AbortSignal): Promise<ManualRoutingPreview> => {
  const response = await apiClient.post(`optimization/requests/${id}/manual-routing/preview?background=true`, proposal, { signal });
  let data = response.data;
  const deadline = Date.now() + 10 * 60 * 1000;
  while (data.pending) {
    if (signal?.aborted) throw new Error("Preview canceled");
    if (Date.now() > deadline) throw new Error("The preview is taking too long. Your selections are kept; please retry.");
    await new Promise<void>(resolve => setTimeout(resolve, 1000));
    const response = await apiClient.get(`optimization/requests/${id}/manual-routing/previews/${encodeURIComponent(data.preview_id)}`, { signal });
    data = response.data;
  }
  return data;
};
export const commitManualRouting = async (id: number, previewToken: string, requestToken: string, approveWorkingTimeExtension = false): Promise<{
  success: boolean; message: string; result: Route["result"]; affected_route_indices: number[];
}> => {
  const { data } = await apiClient.post(`optimization/requests/${id}/manual-routing/commit`, {
    preview_token: previewToken, request_token: requestToken,
    approve_working_time_extension: approveWorkingTimeExtension,
  });
  return data;
};
