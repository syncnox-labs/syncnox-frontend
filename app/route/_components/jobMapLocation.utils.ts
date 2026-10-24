import type { Job, Location } from "@/types/job.type";
import type { MarkerData } from "@/components/GoogleMaps";

/** Keep the hover address paired with the coordinates actually shown. */
function getJobMapPoint(job: Job): { position: Location; address?: string } | null {
  const pickupAddress = job.pick_up_address || job.worker_shuttle_detail?.pick_up_address || job.custom_fields?.pick_up_address;
  const address = job.address_formatted || job.pickup_delivery_detail?.address_formatted || job.custom_fields?.address_formatted;
  const dropoffAddress = job.drop_off_address || job.worker_shuttle_detail?.drop_off_address || job.custom_fields?.drop_off_address;
  const candidates = [
    [job.pick_up_location, pickupAddress],
    [job.worker_shuttle_detail?.pick_up_location, pickupAddress],
    [job.custom_fields?.pick_up_location, pickupAddress],
    [job.location, address],
    [job.pickup_delivery_detail?.location, address],
    [job.custom_fields?.location, address],
    [job.drop_off_location, dropoffAddress],
    [job.worker_shuttle_detail?.drop_off_location, dropoffAddress],
    [job.custom_fields?.drop_off_location, dropoffAddress],
  ];
  for (const [value, label] of candidates) {
    if (value && typeof value.lat === "number" && typeof value.lng === "number"
        && Number.isFinite(value.lat) && Number.isFinite(value.lng)
        && Math.abs(value.lat) <= 90 && Math.abs(value.lng) <= 180) {
      return {
        position: { lat: value.lat, lng: value.lng },
        address: typeof label === "string" ? label.trim() || undefined : undefined,
      };
    }
  }
  return null;
}

/** Prefer the pickup shown on an unassigned job, with fallbacks for other templates. */
export function getJobMapLocation(job: Job): Location | null {
  return getJobMapPoint(job)?.position ?? null;
}

export function getUnassignedJobMarker(job?: Job | null): MarkerData | null {
  const point = job ? getJobMapPoint(job) : null;
  if (!job || !point) return null;
  return {
    id: `unassigned-job-${job.id}`, position: point.position, iconLabel: "!", color: "#ef4444",
    title: point.address || `Unassigned Job #${job.id}`,
    description: point.address,
    stopType: "unassigned", jobData: job, zIndex: 1000001,
  };
}
