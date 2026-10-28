type SegmentStop = {
  leg?: string;
  latitude?: number | null;
  longitude?: number | null;
  segment_type_to_next?: string;
  arrival_time?: string;
  distance_to_next_stop_meters?: number | null;
  travel_time_to_next_stop_seconds?: number | null;
  service_duration_seconds?: number | null;
  waiting_time_to_next_stop_seconds?: number | null;
  waiting_position?: "left" | "right";
};

const duration = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;

const hasDistinctLocations = (a: SegmentStop, b: SegmentStop): boolean => {
  const coords = [a.latitude, a.longitude, b.latitude, b.longitude];
  if (!coords.every(value => typeof value === "number" && Number.isFinite(value))) return false;
  const radians = Math.PI / 180;
  const lat1 = a.latitude! * radians;
  const lat2 = b.latitude! * radians;
  const h = Math.sin((lat2 - lat1) / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin((b.longitude! - a.longitude!) * radians / 2) ** 2;
  // Only reject an impossible zero; never substitute airline distance for road distance.
  return 12_742_000 * Math.asin(Math.sqrt(Math.min(1, h))) > 20;
};

/** Missing metrics are unknown, not evidence of zero-distance waiting. */
export function getTimelineSegment(stop: SegmentStop, next: SegmentStop) {
  const difference = Date.parse(next.arrival_time || "") - Date.parse(stop.arrival_time || "");
  const elapsedSeconds = Number.isFinite(difference) ? Math.max(0, difference / 1000) : 0;
  const isWorking = stop.segment_type_to_next === "team_leader_work";
  const isBetweenTrips = !isWorking && (stop.segment_type_to_next === "between_trips"
    || Boolean(stop.leg && next.leg && stop.leg !== next.leg));
  const distinctLocations = hasDistinctLocations(stop, next);
  const rawTravel = duration(stop.travel_time_to_next_stop_seconds);
  const rawDistance = duration(stop.distance_to_next_stop_meters);
  const travelSeconds = distinctLocations && rawTravel === 0 ? null : rawTravel;
  const serviceSeconds = duration(stop.service_duration_seconds);
  const explicitWaiting = duration(stop.waiting_time_to_next_stop_seconds);
  const waitingSeconds = isWorking ? 0 : isBetweenTrips
    ? travelSeconds === null ? null : Math.max(0, elapsedSeconds - travelSeconds - (serviceSeconds ?? 0))
    : explicitWaiting !== null
    ? Math.min(explicitWaiting, elapsedSeconds)
    : travelSeconds !== null && serviceSeconds !== null
      ? Math.max(0, elapsedSeconds - travelSeconds - serviceSeconds)
      : null;
  return {
    elapsedSeconds, travelSeconds, serviceSeconds, waitingSeconds,
    waitingPosition: stop.waiting_position || "right",
    isWorking, isBetweenTrips,
    distanceMeters: distinctLocations && rawDistance === 0 ? null : rawDistance,
    isWaiting: !isWorking && !isBetweenTrips && travelSeconds === 0 && (waitingSeconds ?? 0) > 0,
  };
}
