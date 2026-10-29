import type { Job, Location } from "@/types/job.type";
import type { MarkerData } from "@/components/GoogleMaps";

export type JourneyLocationKind = "pickup" | "dropoff";
type JourneyStop = {
  job_id?: number | string | null; stop_type?: string; arrival_time?: string | null;
  latitude?: number | null; longitude?: number | null; leg?: string; address_formatted?: string;
};

function validPosition(value: unknown): value is Location {
  if (!value || typeof value !== "object") return false;
  const point = value as Partial<Location>;
  return typeof point.lat === "number" && typeof point.lng === "number"
    && Number.isFinite(point.lat) && Number.isFinite(point.lng)
    && Math.abs(point.lat) <= 90 && Math.abs(point.lng) <= 180;
}

/** Resolve the clicked end of this journey, including repeated pairs in legacy combined routes. */
export function getJobJourneyMapPoint(job: Job | null, kind: JourneyLocationKind,
  selected: JourneyStop, routeStops: readonly JourneyStop[] = []): { position: Location; address?: string } | null {
  const role = (stop: JourneyStop) => ["pickup", "pick_up", "job"].includes(stop.stop_type || "") ? "pickup"
    : ["dropoff", "drop_off"].includes(stop.stop_type || "") ? "dropoff" : undefined;
  const id = job?.id ?? selected.job_id;
  const selectedLeg = selected.leg?.toUpperCase();
  const matches = routeStops.filter(stop => id != null && String(stop.job_id) === String(id)
    && (!["GO", "RETURN"].includes(selectedLeg || "") || !stop.leg || selectedLeg === stop.leg.toUpperCase()));
  const index = matches.findIndex(stop => stop === selected || (role(stop) === role(selected)
    && Boolean(selected.arrival_time) && stop.arrival_time === selected.arrival_time));
  const sameRole = matches.filter(stop => role(stop) === kind);
  const target = index >= 0 ? (role(matches[index]) === kind ? matches[index]
    : kind === "pickup" ? matches.slice(0, index).reverse().find(stop => role(stop) === kind)
      : matches.slice(index + 1).find(stop => role(stop) === kind))
    : sameRole.length === 1 ? sameRole[0] : role(selected) === kind ? selected : undefined;
  const position = { lat: target?.latitude, lng: target?.longitude };
  if (validPosition(position)) return { position, address: target?.address_formatted };
  const key = kind === "pickup" ? "pick_up_location" : "drop_off_location";
  const addressKey = kind === "pickup" ? "pick_up_address" : "drop_off_address";
  for (const source of [job, job?.worker_shuttle_detail, job?.custom_fields]) {
    const point = source?.[key];
    if (validPosition(point)) return { position: { lat: point.lat, lng: point.lng }, address: source?.[addressKey] };
  }
  return null;
}

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
