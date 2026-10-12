type SegmentStop = {
  segment_type_to_next?: string;
  arrival_time?: string;
  distance_to_next_stop_meters?: number | null;
  travel_time_to_next_stop_seconds?: number | null;
  service_duration_seconds?: number | null;
  waiting_time_to_next_stop_seconds?: number | null;
};

const duration = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;

/** Missing metrics are unknown, not evidence of zero-distance waiting. */
export function getTimelineSegment(stop: SegmentStop, next: SegmentStop) {
  const difference = Date.parse(next.arrival_time || "") - Date.parse(stop.arrival_time || "");
  const elapsedSeconds = Number.isFinite(difference) ? Math.max(0, difference / 1000) : 0;
  const isWorking = stop.segment_type_to_next === "team_leader_work";
  const travelSeconds = duration(stop.travel_time_to_next_stop_seconds);
  const serviceSeconds = duration(stop.service_duration_seconds);
  const explicitWaiting = duration(stop.waiting_time_to_next_stop_seconds);
  const waitingSeconds = isWorking ? 0 : explicitWaiting !== null
    ? Math.min(explicitWaiting, elapsedSeconds)
    : travelSeconds !== null && serviceSeconds !== null
      ? Math.max(0, elapsedSeconds - travelSeconds - serviceSeconds)
      : null;
  return {
    elapsedSeconds, travelSeconds, serviceSeconds, waitingSeconds,
    isWorking,
    distanceMeters: duration(stop.distance_to_next_stop_meters),
    isWaiting: !isWorking && travelSeconds === 0 && (waitingSeconds ?? 0) > 0,
  };
}
