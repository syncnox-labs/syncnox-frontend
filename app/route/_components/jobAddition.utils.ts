import type { Route, Stop } from "@/types/routes.type";

/** Origin and scheduling state are independent: a new job can be optimized. */
export function stopNeedsOptimization(stop: Partial<Stop> & { is_edited?: boolean }): boolean {
  return Boolean((stop.needs_optimization ?? stop.is_new) || stop.time_edited || stop.is_edited);
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
