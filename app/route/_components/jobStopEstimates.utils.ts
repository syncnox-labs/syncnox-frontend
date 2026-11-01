import type { Job } from "@/types/job.type";

export interface JobTimingStop {
  job_id?: number | string | null;
  stop_type?: string;
  arrival_time?: string | null;
  leg?: string;
  stop_id?: number;
  status?: string | null;
  actual_arrival_time?: string | null;
  actual_departure_time?: string | null;
  actual_timezone?: string;
}

const role = (stop?: JobTimingStop | null) => {
  const type = stop?.stop_type?.toLowerCase();
  if (type === "pickup" || type === "pick_up" || type === "job") return "pickup";
  if (type === "dropoff" || type === "drop_off") return "dropoff";
  return undefined;
};

/** Resolve one pickup/dropoff pair, including legacy combined bookings. */
export function getJobJourneyStops(
  job: Job | null, selected: JobTimingStop | null,
  routeStops?: readonly JobTimingStop[], isUnassigned = false,
): { pickup?: JobTimingStop; dropoff?: JobTimingStop } {
  if (isUnassigned || selected?.stop_type === "unassigned") return {};
  const id = job?.id ?? selected?.job_id;
  const selectedRole = role(selected);
  if (routeStops !== undefined) {
    let matching = routeStops.filter(stop => id != null && String(stop.job_id) === String(id));
    if (selected?.leg && ["GO", "RETURN"].includes(selected.leg.toUpperCase())) {
      matching = matching.filter(stop => !stop.leg || stop.leg.toUpperCase() === selected.leg!.toUpperCase());
    }
    // Legacy combined bookings can contain two pairs under one job ID.
    const index = matching.findIndex(stop => stop === selected || (
      (selected?.stop_id != null && stop.stop_id === selected.stop_id)
      || (role(stop) === selectedRole && stop.arrival_time === selected?.arrival_time)
    ));
    if (index >= 0 && selectedRole === "pickup") {
      return { pickup: matching[index], dropoff: matching.slice(index + 1).find(stop => role(stop) === "dropoff") };
    }
    if (index >= 0 && selectedRole === "dropoff") {
      return { pickup: matching.slice(0, index).reverse().find(stop => role(stop) === "pickup"), dropoff: matching[index] };
    }
    const pickups = matching.filter(stop => role(stop) === "pickup");
    const dropoffs = matching.filter(stop => role(stop) === "dropoff");
    return { pickup: pickups.length === 1 ? pickups[0] : undefined,
      dropoff: dropoffs.length === 1 ? dropoffs[0] : undefined };
  }
  return selectedRole === "pickup" ? { pickup: selected! } : selectedRole === "dropoff" ? { dropoff: selected! } : {};
}

/** Use the current route rather than saved ETAs from an older optimization. */
export function getJobStopEstimates(
  job: Job | null, selected: JobTimingStop | null,
  routeStops?: readonly JobTimingStop[], isUnassigned = false,
): { pickup?: string; dropoff?: string } {
  if (isUnassigned || selected?.stop_type === "unassigned") return {};
  const pair = getJobJourneyStops(job, selected, routeStops);
  if (routeStops !== undefined) return { pickup: pair.pickup?.arrival_time || undefined, dropoff: pair.dropoff?.arrival_time || undefined };
  return {
    pickup: pair.pickup?.arrival_time || job?.pickup_eta || undefined,
    dropoff: pair.dropoff?.arrival_time || job?.dropoff_eta || undefined,
  };
}

export function getStopProgress(stop: JobTimingStop | undefined, kind: "pickup" | "dropoff" | "arrival", shuttle = true) {
  const status = stop?.status && ["pending", "completed", "failed", "skipped"].includes(stop.status)
    ? stop.status : stop?.actual_departure_time ? "completed" : "pending";
  const label = status === "completed" ? (shuttle ? kind === "pickup" ? "Boarded" : "Dropped off" : "Completed")
    : status === "failed" ? (shuttle && kind === "pickup" ? "No show" : "Failed")
    : status === "skipped" ? "Skipped" : "Pending";
  // A geofence arrival is not the boarding/no-show action. Prefer the recorded action time.
  const actualTime = status === "pending" ? undefined : stop?.actual_departure_time || undefined;
  return { status, label, actualTime, timezone: stop?.actual_timezone };
}
