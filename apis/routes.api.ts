import apiClient from "@/config/apiClient.config";
import { AllRoutes, Route } from "@/types/routes.type";

export const fetchRoutes = async (status?: string, date?: string): Promise<AllRoutes[]> => {
  if (status === "all") status = "";
  const params = new URLSearchParams();
  if (status) params.append("status", status);
  if (date) params.append("date", date);
  const query = params.toString() ? `?${params.toString()}` : "";
  const response = await apiClient.get(`routes${query}`);
  return response.data;
};

export interface CreateOptimizationRequestPayload {
  route_name: string;
  depot_id?: number;
  job_ids: number[];
  team_member_ids: number[];
  scheduled_date: string; // YYYY-MM-DD format
  optimization_goal: "minimum_time" | "minimum_distance";
}

export const createOptimizationRequest = async (
  payload: CreateOptimizationRequestPayload,
): Promise<Route> => {
  const response = await apiClient.post("optimization/requests", payload);
  return response.data;
};

export const getOptimizationRequest = async (id: number): Promise<Route> => {
  const response = await apiClient.get(`optimization/requests/${id}`);
  return response.data;
};

export interface UpdateOptimizationRequestPayload {
  route_name?: string;
  job_ids?: number[];
  result?: any;
}

export const updateOptimizationRequest = async (
  id: number,
  payload: UpdateOptimizationRequestPayload,
): Promise<Route> => {
  const response = await apiClient.patch(
    `optimization/requests/${id}`,
    payload,
  );
  return response.data;
};

export const deleteOptimizationRequest = async (id: number): Promise<void> => {
  await apiClient.delete(`optimization/requests/${id}`);
};

export const deleteRouteApi = async (id: number): Promise<void> => {
  await apiClient.delete(`routes/${id}`);
};

export const deleteRoutesBulkApi = async (ids: number[]): Promise<void> => {
  await apiClient.post("routes/bulk-delete", ids);
};

/** Re-run the full optimization for a request (after job edits). Deletes old routes. */
export const reOptimizeRequest = async (id: number): Promise<Route> => {
  const response = await apiClient.post<Route>(`optimization/requests/${id}/re-optimize`);
  return response.data;
};


// ─────────────────────────────────────────────
// Per-Driver Route Operations
// ─────────────────────────────────────────────

import type { RouteOperationResponse } from "@/types/routes.type";

/** Add a draft job to a specific driver's route (synchronous, marks is_new=true) */
export const addStopToRoute = async (
  optimizationId: number,
  routeIndex: number,
  jobId: number,
  position?: number,
): Promise<RouteOperationResponse> => {
  const payload: { job_id: number; position?: number } = { job_id: jobId };
  if (position !== undefined) payload.position = position;
  const response = await apiClient.post(
    `optimization/requests/${optimizationId}/routes/${routeIndex}/add-stop`,
    payload,
  );
  return response.data;
};

/** Remove a job from a specific driver's route (synchronous) */
export const removeStopFromRoute = async (
  optimizationId: number,
  routeIndex: number,
  jobId: number,
): Promise<RouteOperationResponse> => {
  const response = await apiClient.delete(
    `optimization/requests/${optimizationId}/routes/${routeIndex}/stops/${jobId}`,
  );
  return response.data;
};

/** Manually reorder stops in a route via drag-and-drop or modal (synchronous) */
export const reorderRouteStops = async (
  optimizationId: number,
  routeIndex: number,
  orderedJobIds?: number[],
  orderedStopIndices?: number[],
  orderedStops?: any[],
): Promise<RouteOperationResponse> => {
  const payload: any = {};
  if (orderedJobIds && orderedJobIds.length > 0) payload.ordered_job_ids = orderedJobIds;
  if (orderedStopIndices && orderedStopIndices.length > 0) payload.ordered_stop_indices = orderedStopIndices;
  if (orderedStops && orderedStops.length > 0) payload.ordered_stops = orderedStops;
  const response = await apiClient.put(
    `optimization/requests/${optimizationId}/routes/${routeIndex}/reorder`,
    payload,
  );
  return response.data;
};

/** Edit a stop's planned arrival/end time (synchronous) */
export const editStopTime = async (
  optimizationId: number,
  routeIndex: number,
  jobId: number,
  startTime?: string,
  endTime?: string,
): Promise<RouteOperationResponse> => {
  const response = await apiClient.patch(
    `optimization/requests/${optimizationId}/routes/${routeIndex}/stops/${jobId}/time`,
    { job_id: jobId, start_time: startTime, end_time: endTime },
  );
  return response.data;
};

/** Swap a route's driver → re-optimizes with new driver's constraints */
export const swapRouteDriver = async (
  optimizationId: number,
  routeIndex: number,
  newDriverId: number,
): Promise<RouteOperationResponse> => {
  const response = await apiClient.post(
    `optimization/requests/${optimizationId}/routes/${routeIndex}/swap-driver`,
    { new_driver_id: newDriverId },
  );
  return response.data;
};

/** Reverse the stop order of a driver's route (synchronous) */
export const reverseRoute = async (
  optimizationId: number,
  routeIndex: number,
): Promise<RouteOperationResponse> => {
  const response = await apiClient.post(
    `optimization/requests/${optimizationId}/routes/${routeIndex}/reverse`,
  );
  return response.data;
};

/** Re-optimize a single driver's route via full VRP re-run */
export const reOptimizeRoute = async (
  optimizationId: number,
  routeIndex: number,
): Promise<RouteOperationResponse> => {
  const response = await apiClient.post(
    `optimization/requests/${optimizationId}/routes/${routeIndex}/re-optimize`,
  );
  return response.data;
};

/** Transfer one or more stops/jobs from source driver's route to another driver's route */
export const transferRouteStops = async (
  optimizationId: number,
  sourceRouteIndex: number,
  targetRouteIndex: number,
  jobIds: number[],
  targetPosition?: number,
  reoptimize?: boolean,
): Promise<RouteOperationResponse> => {
  const payload: {
    target_route_index: number;
    job_ids: number[];
    target_position?: number;
    reoptimize?: boolean;
  } = {
    target_route_index: targetRouteIndex,
    job_ids: jobIds,
    reoptimize: reoptimize ?? false,
  };
  if (targetPosition !== undefined) {
    payload.target_position = targetPosition;
  }
  const response = await apiClient.post(
    `optimization/requests/${optimizationId}/routes/${sourceRouteIndex}/transfer-stops`,
    payload,
  );
  return response.data;
};

// ─────────────────────────────────────────────
// Route Sharing (Driver Mobile App)
// ─────────────────────────────────────────────

export interface ShareRouteResponse {
  shared_count: number;
  driver_ids: number[];
  online_drivers: number[];
}

/** Share all routes in an optimization request to their assigned drivers. */
export const shareOptimizationRoutes = async (
  optimizationRequestId: number,
): Promise<ShareRouteResponse> => {
  const response = await apiClient.post(
    `optimization/${optimizationRequestId}/share`,
  );
  return response.data;
};
