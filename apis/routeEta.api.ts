import apiClient from "@/config/apiClient.config";
import type { Route, Routes } from "@/types/routes.type";

function etaPayload(stopIndex: number, arrival: string, route: Routes) {
  return {
    stop_index: stopIndex, arrival_time: arrival, expected_driver_id: route.team_member_id,
    expected_vehicle_id: route.vehicle_id ?? null,
    expected_stops: route.stops.map(stop => ({
      job_id: stop.job_id ?? null, stop_type: stop.stop_type, arrival_time: stop.arrival_time,
    })),
  };
}

export async function previewRouteETA(requestId: number, routeIndex: number, stopIndex: number, arrival: string, route: Routes): Promise<{ stops: Routes["stops"] }> {
  const { data } = await apiClient.post(`optimization/requests/${requestId}/routes/${routeIndex}/eta/preview`, etaPayload(stopIndex, arrival, route));
  return data;
}

export async function editRouteETA(requestId: number, routeIndex: number, stopIndex: number, arrival: string, route: Routes, expectedArrivalTimes?: string[]): Promise<{
  success: boolean; message: string; result: Route["result"];
}> {
  const { data } = await apiClient.patch(`optimization/requests/${requestId}/routes/${routeIndex}/eta`, {
    ...etaPayload(stopIndex, arrival, route),
    ...(expectedArrivalTimes ? { expected_arrival_times: expectedArrivalTimes } : {}),
  });
  return data;
}
