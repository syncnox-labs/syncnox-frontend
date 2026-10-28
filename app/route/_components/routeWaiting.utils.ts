import type { Routes } from "@/types/routes.type";

export interface WaitingSelection {
  routeIndex: number;
  afterStopIndex?: number;
  mergeRouteIndex?: number;
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
