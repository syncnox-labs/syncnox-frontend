import { isRedundantLeaderClientStart } from "./leaderRoute.utils";

interface DisplayStop {
  stop_type?: string;
  latitude?: number | null;
  longitude?: number | null;
  arrival_time?: string | null;
  leg?: string;
  address_formatted?: string;
  job_id?: string | number | null;
  id?: string | number;
  job?: { id?: string | number };
}

export interface GroupedStop<T> {
  representative: T;
  rawStops: T[];
  candidateCount: number;
  firstRawIndex: number;
  /** One number per physical visit; depot endpoints have no number. */
  displayStopNumber: number;
  hasPickup: boolean;
  hasDropoff: boolean;
}

/**
 * Collapse consecutive passenger events at the same physical visit, including
 * visits with both drop-offs and pickups. Preserve their operational raw order.
 *
 * Two stops are merged when ALL of the following match:
 *   • compatible stop types (pickup/drop-off, or the same non-passenger type)
 *   • latitude  (rounded to 4 dp ≈ 11 m)
 *   • longitude (rounded to 4 dp ≈ 11 m)
 *   • arrival_time and leg (the same physical visit)
 */
export function groupStopsByLocation<T extends DisplayStop>(stops: readonly T[]): GroupedStop<T>[] {
  if (!stops || stops.length === 0) return [];

  const grouped: GroupedStop<T>[] = [];

  for (let i = 0; i < stops.length; i++) {
    const stop = stops[i];
    const lat = typeof stop.latitude === "number" && Number.isFinite(stop.latitude) ? stop.latitude.toFixed(4) : null;
    const lon = typeof stop.longitude === "number" && Number.isFinite(stop.longitude) ? stop.longitude.toFixed(4) : null;
    const type = stop.stop_type;
    const hasPickup = type === "pickup";
    const hasDropoff = type === "dropoff" || type === "drop_off";

    // Check if this stop can be merged with the previous group
    const prev = grouped[grouped.length - 1];
    if (
      prev &&
      lat !== null &&
      lon !== null &&
      lat === (typeof prev.representative.latitude  === "number" ? prev.representative.latitude.toFixed(4)  : null) &&
      lon === (typeof prev.representative.longitude === "number" ? prev.representative.longitude.toFixed(4) : null) &&
      (type === prev.representative.stop_type ||
        ((hasPickup || hasDropoff) && (prev.hasPickup || prev.hasDropoff)))
      && stop.leg === prev.representative.leg
      && Boolean(stop.arrival_time)
      && stop.arrival_time === prev.representative.arrival_time
    ) {
      // Merge into the existing group
      prev.rawStops.push(stop);
      prev.candidateCount++;
      prev.hasPickup ||= hasPickup;
      prev.hasDropoff ||= hasDropoff;
    } else {
      // Start a new group
      grouped.push({
        representative: stop,
        rawStops: [stop],
        candidateCount: 1,
        firstRawIndex: i,
        displayStopNumber: 0,
        hasPickup,
        hasDropoff,
      });
    }
  }

  for (const group of grouped) {
    if (!group.hasPickup || !group.hasDropoff) continue;
    // A booking with both activities at this visit is still one passenger.
    group.candidateCount = new Set(group.rawStops.map((stop, index) => {
      const jobId = stop.job_id ?? stop.job?.id ?? stop.id;
      return jobId == null ? `unknown:${index}` : `job:${jobId}`;
    })).size;
  }

  return grouped;
}

/** Drop-off details precede pickup details without reordering editable route data. */
export function getStopTooltipStops<T extends DisplayStop>(group: GroupedStop<T>): T[] {
  if (!group.hasPickup || !group.hasDropoff) return group.rawStops;
  const isDropoff = (stop: T) => {
    const type = stop.stop_type;
    return type === "dropoff" || type === "drop_off";
  };
  return [...group.rawStops.filter(isDropoff), ...group.rawStops.filter(stop => !isDropoff(stop))];
}

/** Shared presentation model for timeline arrows, map markers, and candidate search.
 * Raw indices remain unchanged for selecting and editing individual passengers.
 */
export function getRouteStopDisplay<T extends DisplayStop>(route: {
  stops?: T[];
  is_team_leader?: boolean;
}) {
  const groups = groupStopsByLocation(route.stops || []).filter(
    group => !isRedundantLeaderClientStart(route, group.firstRawIndex),
  );
  const byRawIndex = new Map<number, GroupedStop<T>>();
  let number = 0;
  for (const group of groups) {
    if (!["depot", "depot_start", "depot_end"].includes(group.representative.stop_type || "")) {
      group.displayStopNumber = ++number;
    }
    group.rawStops.forEach((_, offset) => byRawIndex.set(group.firstRawIndex + offset, group));
  }
  return { groups, byRawIndex };
}
