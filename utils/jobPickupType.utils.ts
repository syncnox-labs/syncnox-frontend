import type { Job } from "@/types/job.type";

/** A booking's pickup type and the direction of this specific leg are separate. */
export function getJobLeg(job?: Job | null, stopLeg?: string, routeLeg?: string): "GO" | "RETURN" | undefined {
  const direction = (value?: unknown) => {
    const normalized = typeof value === "string" ? value.trim().toUpperCase() : "";
    return normalized === "GO" || normalized === "RETURN" ? normalized : undefined;
  };
  const selected = direction(stopLeg);
  if (selected) return selected;
  const jobType = job?.job_type?.trim().toLowerCase();
  if (jobType === "return_only" || jobType === "return") return "RETURN";
  if (jobType === "one_way" || jobType === "go") return "GO";
  return direction(job?.custom_fields?.round_trip_leg) || direction(routeLeg);
}

/** Booking type survives splitting a round trip into directional routing jobs. */
export function getJobPickupType(job?: Job | null): string | undefined {
  const raw = job?.custom_fields?.pickup_type || job?.pickup_type
    || job?.worker_shuttle_detail?.pickup_type || job?.job_type;
  if (typeof raw !== "string" || !raw.trim()) return undefined;
  const value = raw.trim().toLowerCase().replace(/[ -]+/g, "_");
  if (value.includes("round") || value === "both") return "round_trip";
  if (value.includes("return")) return "return_only";
  if (value.includes("one") || value === "go") return "one_way";
  return raw;
}
