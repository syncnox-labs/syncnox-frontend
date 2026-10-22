import type { Routes, TripMoveSelection } from "@/types/routes.type";
import { stopNeedsOptimization } from "./jobAddition.utils";
export type { TripMoveSelection } from "@/types/routes.type";

/** A home icon selects only its own depot-bounded trip, not the driver's whole day. */
export function selectTripToMove(route: Routes, sourceRouteIndex: number, startStopIndex: number): TripMoveSelection | null {
  if (route.is_team_leader || route.needs_optimization || route.stops[startStopIndex]?.stop_type !== "depot_start") return null;
  const stops = [];
  for (let index = startStopIndex; index < route.stops.length; index++) {
    const stop = route.stops[index];
    if (index > startStopIndex && stop.stop_type === "depot_start") return null;
    if (stopNeedsOptimization(stop) || !stop.arrival_time) return null;
    stops.push({ job_id: stop.job_id ?? null, stop_type: stop.stop_type, arrival_time: stop.arrival_time });
    if (stop.stop_type === "depot_end") {
      if (!stops.some(item => item.job_id != null)) return null;
      return { sourceRouteIndex, startStopIndex, sourceDriverId: route.team_member_id, sourceLeg: route.leg ?? null, stops };
    }
  }
  return null;
}

/** Capture what the user dragged so concurrent edits are rejected, not overwritten. */
export function snapshotMoveStops(route: Routes): import("@/types/routes.type").StopMoveSnapshot[] {
  return (route.stops || []).map(stop => ({ job_id: stop.job_id ?? null, stop_type: stop.stop_type, arrival_time: stop.arrival_time ?? null }));
}
