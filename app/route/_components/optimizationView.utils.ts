import { Route, Stop } from "@/types/routes.type";
import { decodePolyline } from "@/utils/googleMaps.utils";
import { getRouteColor } from "@/utils/timeline.utils";
import { Job } from "@/types/job.type";

/** Stroke colour used for routes that are not the focused one. */
const DIMMED_ROUTE_COLOR = "#9ca3af";

export const isDriverMatch = (
  driverName: string,
  searchQuery: string,
  exactMatch: boolean,
): boolean => {
  const q = searchQuery.trim().toLowerCase();
  if (!q) return true;
  const name = driverName.trim().toLowerCase();

  if (!exactMatch) {
    return name.includes(q);
  }

  // 1. Exact full string match
  if (name === q) return true;

  // 2. Word boundary regex match (e.g. "driver 1" matches "Driver 1", "Driver 1 (van)", but NOT "Driver 12")
  try {
    const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`\\b${escaped}\\b`, "i");
    if (regex.test(driverName)) return true;
  } catch {}

  return false;
};

export const getGroupedStopsCount = (stops?: any[]): number => {
  if (!stops || stops.length === 0) return 0;
  const grouped: { lat: string | null; lon: string | null; type: string }[] = [];

  for (const stop of stops) {
    const isDepot =
      stop.stop_type === "depot" ||
      stop.stop_type === "depot_start" ||
      stop.stop_type === "depot_end";
    if (isDepot) continue;

    const lat = typeof stop.latitude === "number" ? stop.latitude.toFixed(4) : null;
    const lon = typeof stop.longitude === "number" ? stop.longitude.toFixed(4) : null;
    const type = stop.stop_type;

    const prev = grouped[grouped.length - 1];
    if (
      prev &&
      lat !== null &&
      lon !== null &&
      lat === prev.lat &&
      lon === prev.lon &&
      type === prev.type
    ) {
      // merged
    } else {
      grouped.push({ lat, lon, type });
    }
  }

  return grouped.length;
};

export const generateRoutePolylines = (
  route: Route,
  focusedRouteIndex?: number | null,
  allowedRouteIndices?: Set<number> | null,
) => {

  if (!route?.result?.routes) return [];

  return route.result.routes
    .map((routeItem, index) => ({ routeItem, index }))
    .filter(({ routeItem, index }) => {
      if (!routeItem.route_polyline) return false;
      if (
        allowedRouteIndices !== null &&
        allowedRouteIndices !== undefined &&
        !allowedRouteIndices.has(index)
      ) {
        return false;
      }
      if (
        focusedRouteIndex !== null &&
        focusedRouteIndex !== undefined &&
        focusedRouteIndex !== index
      ) {
        return false;
      }
      return true;
    })
    .map(({ routeItem, index }) => ({
      id: `route-${index}`,
      path: decodePolyline(routeItem.route_polyline),
      options: {
        strokeColor: getRouteColor(index),
        strokeWeight: 4,
        strokeOpacity: 1,
        zIndex: 10,
        clickable: true,
      },
    }));
};

export type MarkerJobData = Pick<
  Job,
  "id" | "address_formatted" | "status" | "location"
>;

export const generateMapMarkers = (
  route: Route,
  jobs: Job[],
  allowedRouteIndices?: Set<number> | null,
) => {
  if (!route?.result?.routes) return [];
  const jobsMap = new Map(jobs.map((j) => [Number(j.id), j]));
  return route.result.routes.flatMap((routeItem, index) => {
    if (
      allowedRouteIndices !== null &&
      allowedRouteIndices !== undefined &&
      !allowedRouteIndices.has(index)
    ) {
      return [];
    }
    const color = getRouteColor(index);

    // Group stops by (lat.toFixed(4), lng.toFixed(4), stop_type)
    const validStops = routeItem.stops
      .map((stop: any, rawIndex: number) => ({ stop, rawIndex }))
      .filter(
        ({ stop }) =>
          typeof stop.latitude === "number" &&
          typeof stop.longitude === "number",
      );

    const groupedStops: { representative: any; rawStops: any[]; firstRawIndex: number }[] = [];
    for (const item of validStops) {
      const { stop, rawIndex } = item;
      const latStr = stop.latitude.toFixed(4);
      const lngStr = stop.longitude.toFixed(4);
      const type = stop.stop_type;

      const prev = groupedStops[groupedStops.length - 1];
      if (
        prev &&
        prev.representative.latitude.toFixed(4) === latStr &&
        prev.representative.longitude.toFixed(4) === lngStr &&
        prev.representative.stop_type === type
      ) {
        prev.rawStops.push(stop);
      } else {
        groupedStops.push({
          representative: stop,
          rawStops: [stop],
          firstRawIndex: rawIndex,
        });
      }
    }

    let jobStopCounter = 1;

    return groupedStops.map((group) => {
      const stop = group.representative;
      const count = group.rawStops.length;
      const isDepot =
        stop.stop_type === "depot" ||
        stop.stop_type === "depot_start" ||
        stop.stop_type === "depot_end";

      let displayIndex = 0;
      if (!isDepot) {
        displayIndex = jobStopCounter++;
      }

      let job: Job | MarkerJobData | undefined = stop.job_id
        ? jobsMap.get(Number(stop.job_id))
        : undefined;

      if (
        !job &&
        stop.job_id != null &&
        !isDepot &&
        stop.stop_type !== "break"
      ) {
        job = {
          id: stop.job_id,
          address_formatted: stop.address_formatted,
          status: "assigned",
          location: { lat: stop.latitude, lng: stop.longitude },
        };
      }

      const labelText = count > 1 ? `${displayIndex} (×${count})` : displayIndex.toString();

      return {
        id: `${index}-${group.firstRawIndex}`,
        position: { lat: stop.latitude, lng: stop.longitude },
        label: {
          text: labelText,
          color: "white",
          fontWeight: "bold",
        },
        title: stop.address_formatted || "Unknown location",
        description: stop.arrival_time
          ? `ETA: ${new Date(stop.arrival_time).toLocaleTimeString("en-US", {
              hour: "2-digit",
              minute: "2-digit",
              hour12: true,
            })}`
          : undefined,
        jobData: job,
        sequenceNumber: isDepot ? undefined : displayIndex,
        isDepot: isDepot,
        color: color,
        routeIndex: index,
      };
    });
  });
};

export const prepareExportData = (route: Route, jobs: Job[]) => {
  const flattenData: any[] = [];

  if (route.result?.routes) {
    route.result.routes.forEach((routeItem) => {
      routeItem.stops.forEach((stop: Stop) => {
        // Find primitive job details if available
        const jobDetails = stop.job_id
          ? jobs.find((j) => j.id === stop.job_id)
          : null;

        flattenData.push({
          Priority: jobDetails?.priority_level || "Medium",
          Address: stop.address_formatted,
          ETA: stop.arrival_time
            ? new Date(stop.arrival_time).toLocaleTimeString("en-US", {
                hour: "2-digit",
                minute: "2-digit",
                hour12: true,
              })
            : "-",
          "Phone Number": jobDetails?.phone_number || "-",
          Duration: jobDetails?.service_duration,
          "Team Member (Driver)": routeItem.team_member_name || "Unassigned",
        });
      });
    });
  }
  return flattenData;
};
