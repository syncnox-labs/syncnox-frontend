type LeaderStop = {
  stop_type?: string;
  leg?: string;
  address_formatted?: string;
  latitude?: number | null;
  longitude?: number | null;
};

/** Hide only the redundant client-origin marker emitted by the earlier backend.
 * Keep the saved stop array and raw indices intact for editing and map clicks.
 */
export function isRedundantLeaderClientStart(
  route: { is_team_leader?: boolean; stops?: LeaderStop[] },
  index: number,
): boolean {
  const stop = route.stops?.[index];
  const next = route.stops?.[index + 1];
  return route.is_team_leader === true
    && stop?.leg === "RETURN"
    && stop.stop_type === "depot_start"
    && stop.address_formatted === "Previous GO trip end"
    && next?.leg === "RETURN"
    && next.stop_type === "pickup"
    && typeof stop.latitude === "number" && Number.isFinite(stop.latitude)
    && typeof stop.longitude === "number" && Number.isFinite(stop.longitude)
    && stop.latitude === next.latitude && stop.longitude === next.longitude;
}
