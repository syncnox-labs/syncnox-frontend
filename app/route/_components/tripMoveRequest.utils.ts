import { getOptimizationRequest, type MoveTripPayload } from "@/apis/routes.api";
import type { Routes, TripMoveSelection } from "@/types/routes.type";

/** Resolve an adjacent plan's displayed trip to its stored route and stop offset. */
export async function tripMoveRequest(
  optimizationId: number, routes: Routes[], selection: TripMoveSelection, targetIndex: number,
): Promise<{ optimizationId: number; routeIndex: number; payload: MoveTripPayload }> {
  const source = routes[selection.sourceRouteIndex];
  let target = routes[targetIndex];
  if (!source || !target) throw new Error("The selected driver changed. Refresh the plan.");
  const ownerId = source.source_optimization_id || optimizationId;
  const projected = ownerId !== optimizationId;
  if (projected) {
    if (!Number.isInteger(source.source_route_index)) throw new Error("The selected trip changed. Refresh the plan.");
    const owner = await getOptimizationRequest(ownerId);
    const destination = owner.result?.routes.find(item =>
      item.team_member_id === target.team_member_id && !item.source_optimization_id);
    if (!destination) throw new Error("The destination driver is unavailable in this trip's plan. Add the driver to that plan before moving it.");
    targetIndex = owner.result.routes.indexOf(destination);
    target = destination;
  } else if (target.source_optimization_id && target.source_optimization_id !== optimizationId) {
    // The drop row may be a projected trip; assign within the source plan.
    const destination = routes.find(item => item.team_member_id === target.team_member_id && !item.source_optimization_id);
    if (!destination) throw new Error("The destination driver is unavailable in this trip's plan. Add the driver to that plan before moving it.");
    targetIndex = routes.indexOf(destination);
    target = destination;
  }
  return {
    optimizationId: ownerId,
    routeIndex: projected ? source.source_route_index! : selection.sourceRouteIndex,
    payload: {
      start_stop_index: selection.startStopIndex + (projected ? source.source_stop_range?.[0] || 0 : 0),
      target_route_index: targetIndex,
      expected_source_driver_id: selection.sourceDriverId,
      expected_source_leg: projected ? source.source_leg ?? null : selection.sourceLeg,
      expected_target_driver_id: target.team_member_id,
      expected_target_vehicle_id: target.vehicle_id ?? null,
      expected_target_leg: target.leg ?? null,
      expected_stops: selection.stops,
    },
  };
}
