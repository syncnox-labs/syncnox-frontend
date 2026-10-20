import type { Job } from "@/types/job.type";

export interface JobTimingStop {
  job_id?: number | string | null;
  stop_type?: string;
  arrival_time?: string | null;
  leg?: string;
}

const role = (stop?: JobTimingStop | null) => {
  const type = stop?.stop_type?.toLowerCase();
  if (type === "pickup" || type === "pick_up" || type === "job") return "pickup";
  if (type === "dropoff" || type === "drop_off") return "dropoff";
  return undefined;
};

/** Use the current route rather than saved ETAs from an older optimization. */
export function getJobStopEstimates(
  job: Job | null, selected: JobTimingStop | null,
  routeStops?: readonly JobTimingStop[], isUnassigned = false,
): { pickup?: string; dropoff?: string } {
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
      role(stop) === selectedRole && stop.arrival_time === selected?.arrival_time
    ));
    if (index >= 0 && selectedRole === "pickup") {
      return { pickup: matching[index].arrival_time || undefined,
        dropoff: matching.slice(index + 1).find(stop => role(stop) === "dropoff")?.arrival_time || undefined };
    }
    if (index >= 0 && selectedRole === "dropoff") {
      return { pickup: matching.slice(0, index).reverse().find(stop => role(stop) === "pickup")?.arrival_time || undefined,
        dropoff: matching[index].arrival_time || undefined };
    }
    const pickups = matching.filter(stop => role(stop) === "pickup");
    const dropoffs = matching.filter(stop => role(stop) === "dropoff");
    return { pickup: pickups.length === 1 ? pickups[0].arrival_time || undefined : undefined,
      dropoff: dropoffs.length === 1 ? dropoffs[0].arrival_time || undefined : undefined };
  }
  return {
    pickup: selectedRole === "pickup" ? selected?.arrival_time || job?.pickup_eta || undefined : job?.pickup_eta || undefined,
    dropoff: selectedRole === "dropoff" ? selected?.arrival_time || job?.dropoff_eta || undefined : job?.dropoff_eta || undefined,
  };
}
