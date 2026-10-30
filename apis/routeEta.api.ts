import apiClient from "@/config/apiClient.config";
import type { Route, Routes } from "@/types/routes.type";

export async function editRouteETA(requestId: number, routeIndex: number, stopIndex: number, arrival: string, route: Routes): Promise<{
  success: boolean; message: string; result: Route["result"];
}> {
  const { data } = await apiClient.patch(`optimization/requests/${requestId}/routes/${routeIndex}/eta`, {
    stop_index: stopIndex,
    arrival_time: arrival,
    expected_driver_id: route.team_member_id,
    expected_vehicle_id: route.vehicle_id ?? null,
    expected_stops: route.stops.map(stop => ({
      job_id: stop.job_id ?? null, stop_type: stop.stop_type, arrival_time: stop.arrival_time,
    })),
  });
  return data;
}
