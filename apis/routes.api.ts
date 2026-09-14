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

/** Add a draft job to a specific driver's route → re-optimizes */
export const addStopToRoute = async (
  optimizationId: number,
  routeIndex: number,
  jobId: number,
): Promise<RouteOperationResponse> => {
  const response = await apiClient.post(
    `optimization/requests/${optimizationId}/routes/${routeIndex}/add-stop`,
    { job_id: jobId },
  );
  return response.data;
};

/** Remove a job from a specific driver's route → re-optimizes */
export const removeStopFromRoute = async (
  optimizationId: number,
  routeIndex: number,
  jobId: number,
): Promise<RouteOperationResponse> => {
  const response = await apiClient.post(
    `optimization/requests/${optimizationId}/routes/${routeIndex}/remove-stop/${jobId}`,
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
