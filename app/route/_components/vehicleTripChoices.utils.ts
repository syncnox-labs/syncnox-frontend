import type { Routes } from "@/types/routes.type";

export function vehicleTripChoices(routes: Routes[], driverId: number | undefined) {
  const trips = routes.map((route, index) => ({ route, index })).filter(({ route }) =>
    route.team_member_id === driverId && route.stops?.length);
  const choices = trips.flatMap(({ route, index }) => {
    const vehicle = route.vehicle_name || `Vehicle #${route.vehicle_id}`;
    return route.leg === "COMBINED" ? [
      { value: `${index}:GO`, label: `GO only · ${vehicle}` },
      { value: `${index}:RETURN`, label: `RETURN only · ${vehicle}` },
      { value: String(index), label: `GO + RETURN · ${vehicle}` },
    ] : [{ value: String(index), label: `${route.leg || "Trip"} · ${vehicle}` }];
  });
  if (trips.length > 1) choices.push({ value: "all", label: "All trips for this driver" });
  return choices;
}
