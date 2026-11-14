import type { MarkerData } from "@/components/GoogleMaps";
import type { Job } from "@/types/job.type";
import dayjs from "dayjs";
import { getRouteColor } from "@/utils/timeline.utils";
import { getJobJourneyMapPoint, getUnassignedJobMarker } from "./jobMapLocation.utils";
import type { MapSearchResult } from "./mapSearch.utils";

export interface MapCompareItem {
  key: string;
  title: string;
  subtitle: string;
  address: string;
  searchText: string;
  unassigned: boolean;
  marker: MarkerData | null;
}

const validPosition = (lat: unknown, lng: unknown): lat is number =>
  typeof lat === "number" && Number.isFinite(lat) && Math.abs(lat) <= 90 &&
  typeof lng === "number" && Number.isFinite(lng) && Math.abs(lng) <= 180;

const stopLabel = (type: string) => {
  if (["pickup", "pick_up"].includes(type)) return "Pickup";
  if (["dropoff", "drop_off"].includes(type)) return "Drop-off";
  return "Stop";
};

/** Every route event is selectable separately, even when several share one map pin. */
export function buildMapCompareItems(candidates: MapSearchResult[], unassignedJobs: Job[]): MapCompareItem[] {
  const assigned: MapCompareItem[] = candidates
    .filter(item => item.jobId && item.stop.stop_type !== "break")
    .map(item => {
      const { stop } = item;
      const label = stopLabel(stop.stop_type);
      const name = item.candidateName !== "Unknown Candidate" ? item.candidateName
        : item.job?.business_name || item.job?.pickup_delivery_detail?.business_name || item.job?.client_name || `Job #${item.jobId}`;
      const title = `${name} · ${label}`;
      const eta = stop.arrival_time && dayjs(stop.arrival_time).isValid() ? ` · ETA ${dayjs(stop.arrival_time).format("MMM D, h:mm A")}` : "";
      const subtitle = `${item.driverName} · Stop ${item.displayStopNumber} · Job #${item.jobId}${item.leg ? ` · ${item.leg}` : ""}${eta}`;
      const address = stop.address_formatted || "Address unavailable";
      // Include route, event and job identity so a changed route cannot silently
      // point an existing selection at a different booking.
      const key = `assigned:${item.routeIndex}:${item.stopIndex}:${item.jobId}:${stop.stop_type}:${item.driverName}:${item.leg || ""}`;
      return {
        key, title, subtitle, address, unassigned: false,
        searchText: `${item.searchableText} ${title} ${subtitle} ${address}`.toLowerCase(),
        marker: validPosition(stop.latitude, stop.longitude) ? {
          id: key, position: { lat: stop.latitude, lng: stop.longitude },
          title: address, description: subtitle, color: getRouteColor(item.routeIndex),
          stopType: stop.stop_type, jobData: item.job || { id: Number(item.jobId), status: "assigned" },
          routeIndex: item.routeIndex,
          comparison: { jobId: item.jobId, name, driverName: item.driverName,
            stopNumber: item.displayStopNumber, leg: item.leg, arrivalTime: stop.arrival_time, unassigned: false },
        } : null,
      };
    });

  const unassigned = unassignedJobs.flatMap((job): MapCompareItem[] => {
    const name = job.candidate_name || job.worker_shuttle_detail?.candidate_name ||
      [job.first_name || job.pickup_delivery_detail?.first_name, job.last_name || job.pickup_delivery_detail?.last_name].filter(Boolean).join(" ") ||
      job.business_name || job.pickup_delivery_detail?.business_name || job.client_name || job.pickup_delivery_detail?.client_name || `Job #${job.id}`;
    const points = (["pickup", "dropoff"] as const).flatMap(kind => {
      const point = getJobJourneyMapPoint(job, kind, {});
      return point ? [{ kind, ...point }] : [];
    });
    const fallback = getUnassignedJobMarker(job);
    const locations = points.length ? points : [{ kind: "location" as const, position: fallback?.position, address: fallback?.description }];
    return locations.map(({ kind, position, address: pointAddress }) => {
      const key = `unassigned:${job.id}:${kind}`;
      const title = `${name} · ${kind === "location" ? "Location" : stopLabel(kind)}`;
      const subtitle = `Unassigned · Job #${job.id}`;
      const address = pointAddress || "Address unavailable";
      return {
        key, title, subtitle, address, unassigned: true,
        searchText: `${title} ${subtitle} ${address} ${job.phone_number || ""} ${job.candidate_phone || job.worker_shuttle_detail?.candidate_phone || ""}`.toLowerCase(),
        marker: position ? { id: key, position, title: address, description: subtitle,
          color: "#dc2626", stopType: kind, jobData: job,
          comparison: { jobId: String(job.id), name, unassigned: true } } : null,
      };
    });
  });
  return [...assigned, ...unassigned];
}
