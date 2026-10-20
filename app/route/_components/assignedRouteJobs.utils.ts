import type { Job } from "@/types/job.type";
import type { Route } from "@/types/routes.type";

/** Use stop membership, since job_ids also includes the plan's unassigned jobs. */
export function getAssignedRouteJobs(
  route: Route,
  jobs: Job[],
  focusedRouteIndex: number | null = null,
  allowedRouteIndices: ReadonlySet<number> | null = null,
): Job[] {
  const jobsById = new Map(jobs.map(job => [job.id, job]));
  const assigned = new Map<number, Job>();

  for (const [index, trip] of (route.result?.routes || []).entries()) {
    if (focusedRouteIndex !== null && index !== focusedRouteIndex) continue;
    if (allowedRouteIndices !== null && !allowedRouteIndices.has(index)) continue;

    for (const stop of trip.stops || []) {
      if (!stop.job_id) continue;
      const job = jobsById.get(Number(stop.job_id));
      if (!job || job.status !== "assigned") continue;

      let row = assigned.get(job.id);
      if (!row) {
        row = {
          ...job,
          assigned_to: trip.team_member_id,
          optimization_id: route.id,
          route_name: route.route_name,
          vehicle_id: trip.vehicle_id,
          vehicle_name: trip.vehicle_name ?? job.vehicle_name,
        };
        assigned.set(job.id, row);
      }
      // Prefer the current plan's ETAs after edits or reoptimization.
      if (stop.arrival_time) {
        if (stop.stop_type === "pickup" || stop.stop_type === "job") row.pickup_eta = stop.arrival_time;
        if (stop.stop_type === "dropoff" || stop.stop_type === "drop_off") row.dropoff_eta = stop.arrival_time;
      }
    }
  }
  return [...assigned.values()];
}

/** Unassigned membership comes from this plan's result, never from job status alone. */
export function getUnassignedRouteJobs(route: Route, jobs: Job[]): Job[] {
  const assignedIds = new Set((route.result?.routes || []).flatMap(trip =>
    (trip.stops || []).flatMap(stop => stop.job_id == null ? [] : [Number(stop.job_id)]),
  ));
  const unassignedIds = new Set((route.result?.unassigned_jobs || []).map(job => Number(job.job_id)));
  return jobs.filter(job => unassignedIds.has(Number(job.id)) && !assignedIds.has(Number(job.id)))
    .map(job => ({ ...job, assigned_to: undefined, vehicle_id: undefined, vehicle_name: undefined,
      route_name: route.route_name, optimization_id: route.id, pickup_eta: undefined, dropoff_eta: undefined }));
}
