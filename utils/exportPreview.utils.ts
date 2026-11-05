import { Routes, Stop } from "@/types/routes.type";
import { Job } from "@/types/job.type";
import type { Vehicle } from "@/types/vehicle.type";
import { manifestDate, manifestLocation, manifestTime } from "./shuttleManifest.utils";

export interface AddressComponents {
  address: string;
  latitude: number;
  longitude: number;
}

export interface DriverSummary {
  driverName: string;
  vehicleName?: string;
  licensePlate?: string;
  vehicleType?: string;
  seatCapacity?: string;
  routeDate: string;
  distance: string;
  totalStops: number;
  expectedTravelTime: string;
  startLocation: string;
  endLocation: string;
  startTime: string;
  endTime: string;
}

export interface StopDetail {
  serialNo: number;
  address: string;
  latitude: number;
  longitude: number;
  eta: string;
  nextStopName: string;
  nextStopDistance: string;
  nextStopTime: string;
  isDepot: boolean;
  isLastStop: boolean;
}

/**
 * Convert meters to miles with formatting
 */
export const formatDistance = (meters: number): string => {
  if (!meters || meters === 0) return "0 mi";
  const miles = meters / 1609.34;
  return `${miles.toFixed(2)} mi`;
};

/**
 * Convert seconds to human-readable duration format
 */
export const formatDuration = (seconds: number): string => {
  if (!seconds || seconds === 0) return "0 min";

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (hours > 0 && minutes > 0) {
    return `${hours}h ${minutes}m`;
  } else if (hours > 0) {
    return `${hours}h`;
  } else {
    return `${minutes}m`;
  }
};

/**
 * Format ETA time from ISO string
 */
export const formatETA = (arrivalTime: string): string => {
  if (!arrivalTime) return "-";

  try {
    return new Date(arrivalTime).toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return "-";
  }
};

/**
 * Prepare driver summary data from a route
 */
export const prepareDriverSummary = (
  route: Routes,
  scheduledDate: string,
  vehicle?: Partial<Vehicle> & { capacity?: number }
): DriverSummary => {
  const start = route.stops[0], end = route.stops.at(-1);
  const capacity = route.vehicle_capacity || vehicle?.capacity || vehicle?.load_constraints?.find(item =>
    ["capacity", "seats", "passengers", "item_count"].includes(item.constraint_type))?.max_value;
  return {
    driverName: route.team_member_name || "Unassigned",
    vehicleName: route.vehicle_name || vehicle?.name || (route.vehicle_id ? `Vehicle ${route.vehicle_id}` : "Unassigned"),
    licensePlate: vehicle?.license_plate || undefined,
    vehicleType: vehicle?.type ? vehicle.type.replace("_", " ") : undefined,
    seatCapacity: capacity ? `${capacity} seats` : undefined,
    routeDate: scheduledDate,
    distance: formatDistance(route.total_distance_meters),
    totalStops: route.stops.length,
    expectedTravelTime: formatDuration(route.total_duration_seconds),
    startLocation: manifestLocation(start),
    endLocation: manifestLocation(end),
    startTime: start?.arrival_time ? `${manifestDate(start.arrival_time)} · ${manifestTime(start.arrival_time)}` : "Not scheduled",
    endTime: end?.arrival_time ? `${manifestDate(end.arrival_time)} · ${manifestTime(end.arrival_time)}` : "Not scheduled",
  };
};

/**
 * Prepare stop details data with next stop information
 */
export const prepareStopsData = (stops: Stop[], jobs: Job[]): StopDetail[] => {
  const jobsMap = new Map(jobs.map((j) => [j.id, j]));

  return stops.map((stop, index) => {
    const nextStop = index < stops.length - 1 ? stops[index + 1] : null;
    const job = stop.job_id ? jobsMap.get(stop.job_id) : undefined;

    return {
      serialNo: index + 1,
      address: stop.address_formatted || job?.address_formatted || job?.pickup_delivery_detail?.address_formatted || "Unknown location",
      latitude: stop.latitude,
      longitude: stop.longitude,
      eta: formatETA(stop.arrival_time),
      nextStopName: nextStop?.address_formatted || "-",
      nextStopDistance: stop.distance_to_next_stop_meters
        ? formatDistance(stop.distance_to_next_stop_meters)
        : "-",
      nextStopTime: stop.time_to_next_stop_seconds
        ? formatDuration(stop.time_to_next_stop_seconds)
        : "-",
      isDepot: ["depot", "depot_start", "depot_end"].includes(stop.stop_type),
      isLastStop: index === stops.length - 1,
    };
  });
};
