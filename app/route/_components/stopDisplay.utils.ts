import { isRedundantLeaderClientStart } from "./leaderRoute.utils";

interface DisplayStop {
  stop_type?: string;
  latitude?: number | null;
  longitude?: number | null;
  arrival_time?: string | null;
  leg?: string;
  address_formatted?: string;
}

export interface GroupedStop<T> {
  representative: T;
  rawStops: T[];
  candidateCount: number;
  firstRawIndex: number;
  /** One number per physical visit; depot endpoints have no number. */
  displayStopNumber: number;
}

/**
 * Collapse consecutive stops that share the same location and stop_type into
 * a single GroupedStop.  This reduces visual clutter for shuttle routes where
 * multiple workers are picked up / dropped off at the same coordinates.
 *
 * Two stops are merged when ALL of the following match:
 *   • stop_type
 *   • latitude  (rounded to 4 dp ≈ 11 m)
 *   • longitude (rounded to 4 dp ≈ 11 m)
 *   • arrival_time and leg (the same physical visit)
 */
export function groupStopsByLocation<T extends DisplayStop>(stops: readonly T[]): GroupedStop<T>[] {
  if (!stops || stops.length === 0) return [];

  const grouped: GroupedStop<T>[] = [];

  for (let i = 0; i < stops.length; i++) {
    const stop = stops[i];
    const lat  = typeof stop.latitude  === "number" ? stop.latitude.toFixed(4)  : null;
    const lon  = typeof stop.longitude === "number" ? stop.longitude.toFixed(4) : null;
    const type = stop.stop_type;

    // Check if this stop can be merged with the previous group
    const prev = grouped[grouped.length - 1];
    if (
      prev &&
      lat !== null &&
      lon !== null &&
      lat === (typeof prev.representative.latitude  === "number" ? prev.representative.latitude.toFixed(4)  : null) &&
      lon === (typeof prev.representative.longitude === "number" ? prev.representative.longitude.toFixed(4) : null) &&
      type === prev.representative.stop_type
      && stop.leg === prev.representative.leg
      && Boolean(stop.arrival_time)
      && stop.arrival_time === prev.representative.arrival_time
    ) {
      // Merge into the existing group
      prev.rawStops.push(stop);
      prev.candidateCount++;
    } else {
      // Start a new group
      grouped.push({
        representative: stop,
        rawStops: [stop],
        candidateCount: 1,
        firstRawIndex: i,
        displayStopNumber: 0,
      });
    }
  }

  return grouped;
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
