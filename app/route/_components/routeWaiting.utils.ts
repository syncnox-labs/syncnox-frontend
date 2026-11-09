import type { Routes } from "@/types/routes.type";

export interface WaitingSelection {
  routeIndex: number;
  afterStopIndex?: number;
  mergeRouteIndex?: number;
}

/** The manual editor loads the current plan, while the timeline also shows trips from other plans. */
export function waitingPlanIssue(routes: Routes[], planId: number, selection: WaitingSelection): string | null {
  const selected = [selection.routeIndex, selection.mergeRouteIndex]
    .filter((index): index is number => index !== undefined)
    .map(index => routes[index]);
  if (selected.some(route => !route)) return null; // The usual stale-selection check handles missing trips.
  const owners = new Set(selected.map(route => route.source_optimization_id ?? planId));
  if (owners.size > 1) {
    return "These trips belong to different plans. Merging trips across plans is not supported yet. No changes were made.";
  }
  if (!owners.has(planId)) {
    const name = selected[0].source_route_name;
    return `This trip belongs to ${name ? `the plan “${name}”` : "another plan"}. Open that plan to edit it. No changes were made.`;
  }
  return null;
}

/** Fit a compact control between the icons, including the home's visual offset. */
export function waitingMergeButtonLayout(endPosition: number, startPosition: number, nextStopPosition?: number) {
  const homePosition = nextStopPosition !== undefined && nextStopPosition - startPosition < 36
    ? Math.max(0, nextStopPosition - 36) : startPosition;
  const gapStart = endPosition + 22;
  const gapEnd = homePosition - 22;
  if (![gapStart, gapEnd].every(Number.isFinite) || gapEnd - gapStart < 24) return null;
  return { left: (gapStart + gapEnd - 24) / 2, width: 24 };
}

/** Only consecutive routes for the same driver and vehicle can be joined. */
export function waitingMergeCandidates(routes: Routes[], sourceIndex: number): number[] {
  const source = routes[sourceIndex];
  if (!source?.stops.length || source.needs_optimization || source.is_team_leader) return [];
  const ordered = routes.map((route, index) => ({ route, index }))
    .filter(({ route }) => route.team_member_id === source.team_member_id && route.stops.length)
    .sort((a, b) => Date.parse(a.route.stops[0].arrival_time) - Date.parse(b.route.stops[0].arrival_time));
  const position = ordered.findIndex(({ index }) => index === sourceIndex);
  return [ordered[position - 1], ordered[position + 1]].flatMap(neighbor => {
    if (!neighbor || neighbor.route.vehicle_id !== source.vehicle_id || neighbor.route.needs_optimization || neighbor.route.is_team_leader) return [];
    const [left, right] = Date.parse(source.stops[0].arrival_time) < Date.parse(neighbor.route.stops[0].arrival_time)
      ? [source, neighbor.route] : [neighbor.route, source];
    const end = left.stops[left.stops.length - 1];
    if (end.stop_type !== "depot_end" || right.stops[0].stop_type !== "depot_start"
      || !Number.isFinite(Date.parse(end.arrival_time))
      || Date.parse(end.arrival_time) > Date.parse(right.stops[0].arrival_time)) return [];
    return [neighbor.index];
  });
}

// The timeline overlays mobile progress; the editing context contains the saved plan.
// Compare planned stop data, independent of response field ordering and live progress.
const liveStopFields = new Set([
  "stop_id", "status", "actual_arrival_time", "actual_departure_time", "actual_timezone",
]);

export function sameWaitingRoute(before: Routes | undefined, fresh: Routes | undefined): boolean {
  if (!before || !fresh) return false;
  if (before.route_id != null && fresh.route_id != null && before.route_id !== fresh.route_id) return false;
  if (before.team_member_id !== fresh.team_member_id || before.vehicle_id !== fresh.vehicle_id
      || before.leg !== fresh.leg) return false;
  const plannedStops = (route: Routes) => route.stops.map(stop => Object.entries(stop)
    .filter(([key, value]) => !liveStopFields.has(key) && value !== undefined)
    .sort(([left], [right]) => left.localeCompare(right)));
  return JSON.stringify(plannedStops(before)) === JSON.stringify(plannedStops(fresh));
}
