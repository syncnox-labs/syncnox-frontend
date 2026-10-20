export interface TransferSelection {
  scope: "jobs" | "leg";
  leg?: "GO" | "RETURN";
}

export function legJobIds(route: any, jobs: any[], leg: "GO" | "RETURN"): number[] {
  const byId = new Map(jobs.map(job => [Number(job.id), job]));
  return [...new Set<number>((route?.stops || []).filter((stop: any) => {
    if (!stop.job_id) return false;
    const job = byId.get(Number(stop.job_id));
    const direction = job?.job_type === "return_only" ? "RETURN"
      : job?.job_type === "one_way" ? "GO"
      : stop.leg || job?.custom_fields?.round_trip_leg || route.leg;
    return direction === leg;
  }).map((stop: any) => Number(stop.job_id)))];
}
