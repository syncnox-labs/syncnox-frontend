import type { Job } from "@/types/job.type";

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
