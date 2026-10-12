import type { Job } from "@/types/job.type";
import type { Routes } from "@/types/routes.type";

const shuttleValue = (job: Job, key: string): string => {
  const value = [job[key as keyof Job], job.worker_shuttle_detail?.[key], job.custom_fields?.[key]]
    .find((item) => item !== undefined && item !== null && String(item).trim() !== "");
  return value === undefined || value === null ? "" : String(value).trim().toLowerCase();
};

/** A shuttle trip is a job with pickup AND drop-off stops. Its return is another job. */
export const findRoundTripPartner = (job: Job | undefined, jobs: Job[]): Job | undefined => {
  if (!job || (job.template_type !== "worker_shuttle" && !job.worker_shuttle_detail)) return;
  const oppositeType = job.job_type === "one_way" ? "return_only"
    : job.job_type === "return_only" ? "one_way" : undefined;
  if (!oppositeType) return;

  const candidateId = shuttleValue(job, "candidate_id");
  const candidateName = shuttleValue(job, "candidate_name");
  if (!candidateId && !candidateName) return;

  const matches = jobs.filter((other) => {
    if (other.id === job.id || other.job_type !== oppositeType || other.scheduled_date !== job.scheduled_date) return false;
    if (other.template_type !== "worker_shuttle" && !other.worker_shuttle_detail) return false;
    const otherId = shuttleValue(other, "candidate_id");
    if (candidateId || otherId) {
      if (!candidateId || candidateId !== otherId) return false;
    } else if (shuttleValue(other, "candidate_name") !== candidateName) return false;

    // Avoid matching another shift/client belonging to the same passenger.
    return ["client_id", "client_name", "quant_id", "start_hour"].every((key) => {
      const left = shuttleValue(job, key);
      const right = shuttleValue(other, key);
      if (key.endsWith("_hour")) return !left || !right || left.slice(0, 5) === right.slice(0, 5);
      return left === right;
    });
  });
  // Ambiguous matches must never remove an unrelated passenger's job.
  return matches.length === 1 ? matches[0] : undefined;
};

export const getTripRemovalTargets = (
  routes: Routes[],
  routeIndex: number,
  jobId: number,
  partnerJobId?: number,
): Array<{ routeIndex: number; jobId: number }> => {
  const targets = [{ routeIndex, jobId }];
  if (partnerJobId !== undefined) {
    routes.forEach((route, index) => {
      if (route.stops.some((stop) => stop.job_id === partnerJobId)) {
        targets.push({ routeIndex: index, jobId: partnerJobId });
      }
    });
  }
  return targets;
};
