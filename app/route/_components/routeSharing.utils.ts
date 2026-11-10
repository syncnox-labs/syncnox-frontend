import type { Routes } from "@/types/routes.type";

type ShareRoute = Pick<Routes, "team_member_id" | "source_optimization_id" | "stops">;

/** Driver rows can begin with an empty placeholder before trips from other plans. */
export function getDriverShareTarget(routes: readonly ShareRoute[], routeIndex: number, planId: number) {
  const selected = routes[routeIndex];
  if (!selected?.team_member_id) return null;
  const hasJobs = (route: ShareRoute) => route.stops?.some(stop => stop.job_id != null);
  const trips = routes.filter(route => route.team_member_id === selected.team_member_id && hasJobs(route));
  const target = hasJobs(selected) ? selected
    : trips.find(route => (route.source_optimization_id ?? planId) === planId) ?? trips[0] ?? selected;
  return { driverId: selected.team_member_id, optimizationId: target.source_optimization_id ?? planId };
}
