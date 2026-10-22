import type { Route, Routes, Stop } from "@/types/routes.type";

/** Origin and scheduling state are independent: a new job can be optimized. */
export function stopNeedsOptimization(stop: Partial<Stop> & { is_edited?: boolean }): boolean {
  return Boolean(stop.needs_optimization ?? (stop.is_new || stop.time_edited || stop.is_edited));
}

export function routeNeedsOptimization(route: Partial<Routes>, pendingDeletedJobIds?: ReadonlySet<number>): boolean {
  return Boolean(route.needs_optimization || route.stops?.some(stop =>
    stopNeedsOptimization(stop) || (stop.job_id != null && pendingDeletedJobIds?.has(stop.job_id))
  ));
}

export interface PendingDriverRoute {
  key: string;
  driverName: string;
  routeIndices: number[];
}

/** Preserve original indices: the single-driver endpoint indexes the full plan. */
export function getPendingDriverRoutes(routes: Partial<Routes>[] = [], pendingDeletedJobIds?: ReadonlySet<number>): PendingDriverRoute[] {
  const drivers = new Map<string, PendingDriverRoute>();
  routes.forEach((route, index) => {
    if (!routeNeedsOptimization(route, pendingDeletedJobIds) || !route.stops?.some(stop => stop.job_id != null)) return;
    const key = route.team_member_id != null ? `driver-id-${route.team_member_id}`
      : route.team_member_name ? `driver-name-${route.team_member_name.trim().toLowerCase()}` : `driver-index-${index}`;
    const driver = drivers.get(key) || {
      key, driverName: route.team_member_name || `Driver ${route.team_member_id ?? index + 1}`, routeIndices: [],
    };
    driver.routeIndices.push(index);
    drivers.set(key, driver);
  });
  return [...drivers.values()];
}

export function getAddedJobIds(result?: Route["result"] | null): Set<number> {
  const ids = new Set<number>(result?.added_job_ids || []);
  for (const booking of Object.values(result?.manual_job_creations || {})) {
    booking.job_ids.forEach(id => ids.add(id));
  }
  for (const trip of result?.routes || []) {
    for (const stop of trip.stops || []) {
      if (stop.job_id && stop.is_new) ids.add(stop.job_id);
    }
  }
  for (const job of result?.unassigned_jobs || []) {
    if (job.is_new) ids.add(job.job_id);
  }
  return ids;
}
